import { DEMO_PRODUCTS, DEMO_REFERRAL_CODES, getProductBySlug, getVisibleProducts } from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, resolveRuntimeMode } from '@closed-commerce/db';
import { findValidReferralCode } from '@closed-commerce/referral';
import type { Product, ProductImage } from '@closed-commerce/types';
import { createServerAppClient } from '@/lib/supabase-server';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  short_description: string;
  description: string;
  base_price: number;
  shipping_fee: number;
  visibility: Product['visibility'];
  status: Product['status'];
};

function mapProduct(
  row: ProductRow,
  options: { id: string; name: string; value: string; price: number; stock: number }[],
  images: ProductImage[] = [],
): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    shortDescription: row.short_description,
    description: row.description,
    weight: options[0]?.value ?? '',
    price: options[0]?.price ?? row.base_price,
    shippingFee: row.shipping_fee,
    visibility: row.visibility,
    status: row.status,
    imageUrl: images[0]?.url ?? '',
    images,
    options,
    tags: [],
  };
}

const PRODUCT_COLUMNS = 'id, slug, name, category, short_description, description, base_price, shipping_fee, visibility, status, created_at';

function isSupabaseMode() {
  return resolveRuntimeMode({ requireServiceRole: false }) === 'supabase';
}

/** 재고 조회. 호출 전에 RLS로 열람 권한이 확정되어 있어야 한다. */
async function loadAvailableStock(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  if (resolveRuntimeMode({ requireServiceRole: true }) !== 'supabase') return new Map();
  const admin = createServiceRoleSupabaseClient();
  const { data } = await admin.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds);
  return new Map((data ?? []).map((row) => [row.product_id, Math.max(0, row.quantity - row.reserved_quantity)]));
}

async function hydrate(
  client: Awaited<ReturnType<typeof createServerAppClient>>,
  rows: ProductRow[],
): Promise<Product[]> {
  if (rows.length === 0) return [];
  const productIds = rows.map((row) => row.id);
  const [{ data: options }, { data: imageRows }] = await Promise.all([
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    client.from('product_images').select('id, product_id, storage_path, alt_text, sort_order, created_at').in('product_id', productIds).order('sort_order'),
  ]);
  // inventory는 회원이 읽을 수 있는 RLS 정책이 없어 세션 클라이언트로는 항상 0행이다.
  // 그래서 고객몰의 재고 표시가 계속 0이었다. 인가는 위 RLS에서 이미 끝났으므로
  // 확정된 상품 id에 한해 서버 전용 클라이언트로 읽는다.
  const stockByProduct = await loadAvailableStock(productIds);
  const imagesByProduct = new Map<string, ProductImage[]>();
  (imageRows ?? []).forEach((image) => {
    const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl;
    const current = imagesByProduct.get(image.product_id) ?? [];
    current.push({ id: image.id, url, altText: image.alt_text, sortOrder: image.sort_order });
    imagesByProduct.set(image.product_id, current);
  });
  return rows.map((row) => {
    const rowOptions = (options ?? [])
      .filter((option) => option.product_id === row.id)
      .map((option) => ({ id: option.id, name: option.name, value: option.value, price: option.price, stock: stockByProduct.get(row.id) ?? 0 }));
    return mapProduct(row, rowOptions, imagesByProduct.get(row.id));
  });
}

export async function loadVisibleCatalog(referralCode?: string): Promise<{ products: Product[]; validReferralCode?: string; authenticated: boolean }> {
  if (!isSupabaseMode()) {
    const valid = referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, referralCode) : undefined;
    return { products: getVisibleProducts(true, Boolean(valid)), validReferralCode: valid?.code, authenticated: true };
  }
  const client = await createServerAppClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { products: [], authenticated: false };

  const { data: relationship } = await client
    .from('referral_relationships')
    .select('referral_code_id')
    .eq('referred_user_id', auth.user.id)
    .maybeSingle();
  let validReferralCode: string | undefined;
  if (relationship) {
    const { data: code } = await client.from('referral_codes').select('code').eq('id', relationship.referral_code_id).eq('status', 'active').maybeSingle();
    validReferralCode = code?.code;
  }

  const { data: rows, error } = await client.from('products').select(PRODUCT_COLUMNS).eq('status', 'active');
  if (error || !rows) return { products: [], validReferralCode, authenticated: true };
  return { products: await hydrate(client, rows), validReferralCode, authenticated: true };
}

/**
 * 상세 페이지는 slug 하나만 필요하다.
 * 예전에는 loadVisibleCatalog로 전체 카탈로그를 불러와 JS에서 find했다.
 * 상품이 늘면 PDP 조회 한 번마다 전체 스캔이 된다.
 */
export async function loadProductBySlug(slug: string, referralCode?: string): Promise<{ product?: Product; validReferralCode?: string; authenticated: boolean }> {
  if (!isSupabaseMode()) {
    const valid = referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, referralCode) : undefined;
    return { product: getProductBySlug(slug), validReferralCode: valid?.code, authenticated: true };
  }
  const client = await createServerAppClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { authenticated: false };

  const { data: relationship } = await client
    .from('referral_relationships')
    .select('referral_code_id')
    .eq('referred_user_id', auth.user.id)
    .maybeSingle();
  let validReferralCode: string | undefined;
  if (relationship) {
    const { data: code } = await client.from('referral_codes').select('code').eq('id', relationship.referral_code_id).eq('status', 'active').maybeSingle();
    validReferralCode = code?.code;
  }

  // RLS(products_visible_read)가 노출 정책을 적용하므로, 볼 수 없는 상품은 여기서 나오지 않는다.
  const { data: row } = await client.from('products').select(PRODUCT_COLUMNS).eq('slug', slug).eq('status', 'active').maybeSingle();
  if (!row) return { validReferralCode, authenticated: true };
  const [product] = await hydrate(client, [row]);
  return { product, validReferralCode, authenticated: true };
}

/**
 * 홈 화면의 상품 진열.
 *
 * 홈은 비로그인 방문자도 보는 페이지라 세션 클라이언트로는 referral 전용 상품이
 * 전혀 나오지 않는다(그래서 예전에는 DEMO_PRODUCTS를 그렸다).
 * 여기서는 서버 전용 클라이언트로 "무엇이 있는지"만 보여주고,
 * 가격은 볼 자격이 있는 회원에게만 노출한다.
 * 사이트 문구("상품 가격과 판매 조건은 공개 검색에 노출하지 않습니다")와도 일치한다.
 */
export async function loadShowcaseProducts(limit = 4): Promise<{ products: Product[]; priceVisible: boolean }> {
  if (!isSupabaseMode()) return { products: DEMO_PRODUCTS.slice(0, limit), priceVisible: true };

  const sessionClient = await createServerAppClient();
  const { data: auth } = await sessionClient.auth.getUser();
  let priceVisible = false;
  if (auth.user) {
    const { data: relationship } = await sessionClient
      .from('referral_relationships')
      .select('id')
      .eq('referred_user_id', auth.user.id)
      .maybeSingle();
    priceVisible = Boolean(relationship);
  }

  if (!resolveRuntimeMode({ requireServiceRole: true }).includes('supabase')) {
    return { products: [], priceVisible };
  }

  const serviceClient = createServiceRoleSupabaseClient();
  const { data: rows, error } = await serviceClient
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('status', 'active')
    .neq('visibility', 'hidden')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !rows) return { products: [], priceVisible };

  const productIds = rows.map((row) => row.id);
  const [{ data: options }, { data: imageRows }] = await Promise.all([
    serviceClient.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    serviceClient.from('product_images').select('id, product_id, storage_path, alt_text, sort_order, created_at').in('product_id', productIds).order('sort_order'),
  ]);
  const imagesByProduct = new Map<string, ProductImage[]>();
  (imageRows ?? []).forEach((image) => {
    const url = serviceClient.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl;
    const current = imagesByProduct.get(image.product_id) ?? [];
    current.push({ id: image.id, url, altText: image.alt_text, sortOrder: image.sort_order });
    imagesByProduct.set(image.product_id, current);
  });

  const products = rows.map((row) => {
    const rowOptions = (options ?? [])
      .filter((option) => option.product_id === row.id)
      .map((option) => ({ id: option.id, name: option.name, value: option.value, price: option.price, stock: 0 }));
    return mapProduct(row, rowOptions, imagesByProduct.get(row.id));
  });
  return { products, priceVisible };
}
