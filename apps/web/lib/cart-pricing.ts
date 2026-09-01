import {
  calculateCartTotalsFromLines,
  DEFAULT_SHIPPING_POLICY,
  getProductById,
  toDemoCatalogLines,
  type CartTotals,
  type CatalogLine,
  type ShippingPolicy,
} from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError } from '@closed-commerce/observability';
import type { CartItem } from '@closed-commerce/types';
import { resolveCatalogAccess } from '@/lib/catalog-data';
import { createServerAppClient, getRequestUser } from '@/lib/supabase-server';
import { loadStoreSettings } from '@/lib/store-settings';

/**
 * 장바구니/주문서의 금액을 서버에서만 계산한다.
 *
 * 예전에는 cart-view와 checkout-form이 @closed-commerce/commerce의
 * getProductById / calculateCartTotals를 직접 호출했는데, 그 함수들은
 * 하드코딩된 DEMO_PRODUCTS만 알고 있었다. localStorage에는 실제 상품 UUID가
 * 저장되므로 live 상품을 담는 순간 조회가 실패했고, calculateCartTotals는
 * 예외를 던져 /cart 렌더 자체가 깨졌다.
 *
 * 부수적으로: 단가가 더 이상 브라우저에서 오지 않으므로 가격 조작 여지도 사라진다.
 */

export interface QuotedLine extends CatalogLine {
  imageUrl?: string;
  /** 재고를 확인하지 못했으면 undefined. JSON에서 Infinity는 null이 되므로 값 자체를 빼는 편이 안전하다. */
  availableStock?: number;
  slug: string;
}

export interface CartQuote {
  lines: QuotedLine[];
  totals: CartTotals;
  /** 담아뒀지만 지금은 살 수 없는 항목(품절/판매중지/삭제). 화면에서 알려주고 정리를 유도한다. */
  issues: { productId: string; optionId?: string; reason: string }[];
  authenticated: boolean;
  /** 화면에 "몇 개까지 얼마"를 그대로 설명하기 위해 정책을 함께 내려보낸다. */
  shippingPolicy: ShippingPolicy;
}

const EMPTY_TOTALS: CartTotals = {
  grossAmount: 0,
  discountAmount: 0,
  shippingAmount: 0,
  paidAmount: 0,
  commissionableAmount: 0,
  quantity: 0,
};

function demoQuote(items: CartItem[]): CartQuote {
  const issues: CartQuote['issues'] = [];
  const usable = items.filter((item) => {
    if (getProductById(item.productId)) return true;
    issues.push({ productId: item.productId, optionId: item.optionId, reason: '데모 카탈로그에 없는 상품입니다.' });
    return false;
  });
  const lines = toDemoCatalogLines(usable).map<QuotedLine>((line) => ({
    ...line,
    availableStock: getProductById(line.productId)?.options[0]?.stock ?? 0,
    imageUrl: getProductById(line.productId)?.imageUrl,
    slug: getProductById(line.productId)?.slug ?? '',
  }));
  return {
    lines,
    totals: calculateCartTotalsFromLines(lines, undefined, DEFAULT_SHIPPING_POLICY),
    issues,
    authenticated: true,
    shippingPolicy: DEFAULT_SHIPPING_POLICY,
  };
}

/**
 * 판매 가능 재고를 읽는다.
 * 호출 전에 반드시 RLS로 "이 회원이 볼 수 있는 상품"을 확정해야 한다 —
 * 여기서는 인가를 하지 않고, 넘겨받은 id의 재고만 읽는다.
 */
async function loadAvailableStock(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  if (resolveRuntimeMode({ requireServiceRole: true }) !== 'supabase') return new Map();
  try {
    const admin = createServiceRoleSupabaseClient();
    const { data, error } = await admin.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds);
    if (error) {
      logServerError('web.cart.stock', 'cart-quote', error, { productCount: productIds.length });
      return new Map();
    }
    return new Map((data ?? []).map((row) => [row.product_id, Math.max(0, row.quantity - row.reserved_quantity)]));
  } catch (error) {
    logServerError('web.cart.stock', 'cart-quote', error, { productCount: productIds.length });
    return new Map();
  }
}

export async function quoteCart(items: CartItem[]): Promise<CartQuote> {
  if (resolveRuntimeMode({ requireServiceRole: false }) !== 'supabase') {
    return items.length === 0
      ? { lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: true, shippingPolicy: DEFAULT_SHIPPING_POLICY }
      : demoQuote(items);
  }

  // 배송비 규칙은 운영자가 관리자 화면에서 정한다. 빈 장바구니에서도 화면이
  // "몇 개까지 얼마"를 안내해야 하므로 라인이 없어도 함께 읽는다.
  const { shippingPolicy } = await loadStoreSettings();
  if (items.length === 0) return { lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: true, shippingPolicy };

  const client = await createServerAppClient();
  const user = await getRequestUser();
  if (!user) return { lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: false, shippingPolicy };

  // 가격을 볼 자격이 없는 회원에게는 견적 자체를 내주지 않는다.
  // 화면에서만 가리고 이 API가 금액을 돌려주면 가린 게 아니다.
  // 주문 경로(createPersistedOrder)도 추천 귀속이 없으면 403으로 막는다 — 두 경로를 맞춘다.
  const access = await resolveCatalogAccess(client);
  if (!access.priceVisible) {
    return {
      lines: [],
      totals: EMPTY_TOTALS,
      issues: [{ productId: '', reason: '추천 코드로 가입한 회원만 가격 확인과 주문이 가능합니다.' }],
      authenticated: true,
      shippingPolicy,
    };
  }

  const productIds = [...new Set(items.map((item) => item.productId))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (productIds.length === 0) {
    return {
      lines: [],
      totals: EMPTY_TOTALS,
      issues: items.map((item) => ({ productId: item.productId, optionId: item.optionId, reason: '더 이상 판매하지 않는 상품입니다.' })),
      authenticated: true,
      shippingPolicy,
    };
  }

  // 세션 클라이언트를 쓰므로 RLS(products_visible_read)가 그대로 적용된다.
  // 회원이 볼 수 없는 상품은 애초에 조회되지 않는다 = 여기서 인가가 끝난다.
  const [{ data: products }, { data: options }, { data: images }] = await Promise.all([
    client.from('products').select('id, slug, name, base_price, shipping_fee, status, visibility').in('id', productIds).eq('status', 'active'),
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    client.from('product_images').select('product_id, storage_path, sort_order').in('product_id', productIds).eq('role', 'thumbnail').order('sort_order'),
  ]);

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const optionMap = new Map((options ?? []).map((option) => [option.id, option]));
  // inventory에는 회원이 읽을 수 있는 RLS 정책이 없다(관리자 전용 하나뿐).
  // 세션 클라이언트로 읽으면 항상 0행이 돌아와 모든 상품이 "품절"로 보인다.
  // 위에서 RLS가 이미 "이 회원이 볼 수 있는 상품"을 확정했으므로,
  // 그 id들에 한해서만 서버 전용 클라이언트로 재고를 읽는다.
  const stockMap = await loadAvailableStock([...productMap.keys()]);
  const imageMap = new Map<string, string>();
  (images ?? []).forEach((image) => {
    if (imageMap.has(image.product_id)) return;
    imageMap.set(image.product_id, client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl);
  });

  const lines: QuotedLine[] = [];
  const issues: CartQuote['issues'] = [];

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      issues.push({ productId: item.productId, optionId: item.optionId, reason: '지금은 구매할 수 없는 상품입니다.' });
      continue;
    }
    const productOptions = (options ?? []).filter((option) => option.product_id === item.productId);
    const option = item.optionId ? optionMap.get(item.optionId) : productOptions[0];
    if (!option || option.product_id !== item.productId) {
      issues.push({ productId: item.productId, optionId: item.optionId, reason: `${product.name}의 선택 옵션이 변경되었습니다.` });
      continue;
    }
    // 재고를 확인하지 못했으면(서비스 롤 미설정 등) 수량 제한을 걸지 않는다.
    // 주문 시점에 서버가 다시 확인하므로 여기서 막을 이유가 없다.
    const knownStock = stockMap.get(item.productId);
    if (knownStock !== undefined && knownStock < item.quantity) {
      issues.push({
        productId: item.productId,
        optionId: item.optionId,
        reason: knownStock === 0 ? `${product.name} 품절입니다.` : `${product.name} 재고가 ${knownStock}개 남아 수량을 줄여야 합니다.`,
      });
    }
    lines.push({
      productId: product.id,
      productName: product.name,
      optionId: option.id,
      optionName: `${option.name}: ${option.value}`,
      unitPrice: option.price,
      shippingFee: product.shipping_fee,
      quantity: item.quantity,
      availableStock: knownStock,
      imageUrl: imageMap.get(product.id),
      slug: product.slug,
    });
  }

  return { lines, totals: calculateCartTotalsFromLines(lines, undefined, shippingPolicy), issues, authenticated: true, shippingPolicy };
}
