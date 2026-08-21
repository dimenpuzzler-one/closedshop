import {
  calculateCartTotalsFromLines,
  getProductById,
  toDemoCatalogLines,
  type CartTotals,
  type CatalogLine,
} from '@closed-commerce/commerce';
import { resolveRuntimeMode } from '@closed-commerce/db';
import type { CartItem } from '@closed-commerce/types';
import { createServerAppClient } from '@/lib/supabase-server';

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
  availableStock: number;
  slug: string;
}

export interface CartQuote {
  lines: QuotedLine[];
  totals: CartTotals;
  /** 담아뒀지만 지금은 살 수 없는 항목(품절/판매중지/삭제). 화면에서 알려주고 정리를 유도한다. */
  issues: { productId: string; optionId?: string; reason: string }[];
  authenticated: boolean;
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
  return { lines, totals: calculateCartTotalsFromLines(lines), issues, authenticated: true };
}

export async function quoteCart(items: CartItem[]): Promise<CartQuote> {
  if (items.length === 0) return { lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: true };
  if (resolveRuntimeMode({ requireServiceRole: false }) !== 'supabase') return demoQuote(items);

  const client = await createServerAppClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: false };

  const productIds = [...new Set(items.map((item) => item.productId))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (productIds.length === 0) {
    return {
      lines: [],
      totals: EMPTY_TOTALS,
      issues: items.map((item) => ({ productId: item.productId, optionId: item.optionId, reason: '더 이상 판매하지 않는 상품입니다.' })),
      authenticated: true,
    };
  }

  // 세션 클라이언트를 쓰므로 RLS(products_visible_read)가 그대로 적용된다.
  // 회원이 볼 수 없는 상품은 애초에 조회되지 않는다.
  const [{ data: products }, { data: options }, { data: inventory }, { data: images }] = await Promise.all([
    client.from('products').select('id, slug, name, base_price, shipping_fee, status, visibility').in('id', productIds).eq('status', 'active'),
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    client.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds),
    client.from('product_images').select('product_id, storage_path, sort_order').in('product_id', productIds).order('sort_order'),
  ]);

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const optionMap = new Map((options ?? []).map((option) => [option.id, option]));
  const stockMap = new Map((inventory ?? []).map((row) => [row.product_id, Math.max(0, row.quantity - row.reserved_quantity)]));
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
    const availableStock = stockMap.get(item.productId) ?? 0;
    if (availableStock < item.quantity) {
      issues.push({
        productId: item.productId,
        optionId: item.optionId,
        reason: availableStock === 0 ? `${product.name} 품절입니다.` : `${product.name} 재고가 ${availableStock}개 남았습니다.`,
      });
    }
    lines.push({
      productId: product.id,
      productName: product.name,
      optionId: option.id,
      optionName: `${option.name}: ${option.value}`,
      unitPrice: option.price,
      shippingFee: product.shipping_fee,
      quantity: Math.min(item.quantity, Math.max(availableStock, 0)) || item.quantity,
      availableStock,
      imageUrl: imageMap.get(product.id),
      slug: product.slug,
    });
  }

  return { lines, totals: calculateCartTotalsFromLines(lines), issues, authenticated: true };
}
