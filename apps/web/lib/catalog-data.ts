import { DEMO_PRODUCTS, DEMO_REFERRAL_CODES, getProductBySlug, getVisibleProducts } from '@closed-commerce/commerce';
import { cache } from 'react';
import { createServiceRoleSupabaseClient, resolveRuntimeMode } from '@closed-commerce/db';
import { findValidReferralCode } from '@closed-commerce/referral';
import type { Product, ProductImage } from '@closed-commerce/types';
import { createServerAppClient, getRequestUser } from '@/lib/supabase-server';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  short_description: string;
  description: string;
  base_price: number;
  shipping_fee: number;
  home_sort_order: number;
  withdrawal_restriction: string;
  visibility: Product['visibility'];
  status: Product['status'];
};

// 세션 클라이언트와 서비스 롤 클라이언트는 타입이 같다. 다른 건 붙는 권한뿐이다.
type AnyClient = Awaited<ReturnType<typeof createServerAppClient>>;

const PRODUCT_COLUMNS =
  'id, slug, name, category, short_description, description, base_price, shipping_fee, home_sort_order, withdrawal_restriction, visibility, status, created_at';

function isSupabaseMode() {
  return resolveRuntimeMode({ requireServiceRole: false }) === 'supabase';
}

function hasServiceRole() {
  return resolveRuntimeMode({ requireServiceRole: true }) === 'supabase';
}

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
    basePrice: row.base_price,
    homeSortOrder: row.home_sort_order,
    price: options[0]?.price ?? row.base_price,
    shippingFee: row.shipping_fee,
    withdrawalRestriction: row.withdrawal_restriction ?? '',
    visibility: row.visibility,
    status: row.status,
    imageUrl: images[0]?.url ?? '',
    images,
    options,
    tags: [],
  };
}

/**
 * 가격을 볼 자격이 없는 방문자에게는 금액을 화면에서 감추는 것으로 끝내면 안 된다.
 * HTML 소스에 숫자가 그대로 남으면 감춘 게 아니다. 페이로드에서 아예 지운다.
 */
function stripPrices(product: Product): Product {
  return {
    ...product,
    basePrice: 0,
    price: 0,
    options: product.options.map((option) => ({ ...option, price: 0 })),
  };
}

export interface CatalogAccess {
  /** 로그인 여부. */
  authenticated: boolean;
  /** 회원에게 귀속된 유효한 추천 코드. */
  validReferralCode?: string;
  /**
   * 가격 노출 여부. 폐쇄몰 3단계의 1~2단계를 가르는 축이다.
   *   비회원 / 추천코드 없는 회원 → false (상품은 보이되 가격 비노출)
   *   추천코드로 귀속된 회원       → true  (특판가 노출, 구매 가능)
   * 3단계(프로모션 코드 추가 할인)는 주문서에서 적용된다.
   *
   * products.visibility는 이것과 다른 축이다. 그건 "상품 자체를 감출지"를 정하고,
   * 'hidden'은 자격과 무관하게 아무에게도 보이지 않는다.
   */
  priceVisible: boolean;
}

export const resolveCatalogAccess = cache(async (
  client: Awaited<ReturnType<typeof createServerAppClient>>,
): Promise<CatalogAccess> => {
  const user = await getRequestUser();
  if (!user) return { authenticated: false, priceVisible: false };

  // 예전에는 profiles → referral_relationships → referral_codes를 하나씩 순서대로 물었다.
  // 셋 다 사용자 id만 있으면 되므로 같이 보낸다. 왕복 3회가 1회가 된다.
  // 추천 코드는 관계 테이블을 통해 조인해 가져오므로 별도 조회가 필요 없다.
  const [{ data: profile }, { data: relationship }] = await Promise.all([
    client.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    client
      .from('referral_relationships')
      .select('referral_code_id, referral_codes!inner(code, status)')
      .eq('referred_user_id', user.id)
      .maybeSingle(),
  ]);

  // 운영자·관리자는 추천 귀속이 없어도 가격을 봐야 한다.
  // 그렇지 않으면 대표님이 본인 쇼핑몰에서 자기 상품 가격을 못 본다.
  if (profile?.role === 'operator' || profile?.role === 'admin') {
    return { authenticated: true, priceVisible: true };
  }

  const joined = relationship?.referral_codes as { code?: string; status?: string } | undefined;
  // 귀속은 되어 있으나 코드가 만료·정지된 경우까지 특판가를 보여주지는 않는다.
  if (!joined?.code || joined.status !== 'active') return { authenticated: true, priceVisible: false };
  return { authenticated: true, validReferralCode: joined.code, priceVisible: true };
});

/** 재고 조회. 호출 전에 열람 권한이 확정되어 있어야 한다. */
async function loadAvailableStock(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0 || !hasServiceRole()) return new Map();
  const admin = createServiceRoleSupabaseClient();
  const { data } = await admin.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds);
  return new Map((data ?? []).map((row) => [row.product_id, Math.max(0, row.quantity - row.reserved_quantity)]));
}

async function hydrate(client: AnyClient, rows: ProductRow[], imageMode: 'thumbnail' | 'all'): Promise<Product[]> {
  if (rows.length === 0) return [];
  const productIds = rows.map((row) => row.id);
  const imageQuery = client
    .from('product_images')
    .select('id, product_id, storage_path, alt_text, sort_order, role, width, height, byte_size, mime_type, created_at')
    .in('product_id', productIds)
    .order('sort_order');
  const [{ data: options }, { data: imageRows }] = await Promise.all([
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    imageMode === 'thumbnail' ? imageQuery.eq('role', 'thumbnail') : imageQuery,
  ]);
  // inventory는 회원이 읽을 수 있는 RLS 정책이 없어 세션 클라이언트로는 항상 0행이다.
  // 인가는 호출부에서 이미 끝났으므로, 확정된 상품 id에 한해 서버 전용 클라이언트로 읽는다.
  const stockByProduct = await loadAvailableStock(productIds);
  const imagesByProduct = new Map<string, ProductImage[]>();
  (imageRows ?? []).forEach((image) => {
    const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl;
    const current = imagesByProduct.get(image.product_id) ?? [];
    current.push({
      id: image.id,
      url,
      altText: image.alt_text,
      sortOrder: image.sort_order,
      role: image.role === 'thumbnail' ? 'thumbnail' : 'detail',
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      byteSize: image.byte_size ?? undefined,
      mimeType: image.mime_type ?? undefined,
    });
    imagesByProduct.set(image.product_id, current);
  });
  return rows.map((row) => {
    const rowOptions = (options ?? [])
      .filter((option) => option.product_id === row.id)
      .map((option) => ({ id: option.id, name: option.name, value: option.value, price: option.price, stock: stockByProduct.get(row.id) ?? 0 }));
    return mapProduct(row, rowOptions, imagesByProduct.get(row.id));
  });
}

/**
 * 목록/상세를 읽을 클라이언트를 고른다.
 *
 * 가격을 볼 자격이 있는 회원은 세션 클라이언트를 쓴다 = RLS가 인가를 담당한다.
 * 자격이 없는 방문자에게도 "무엇이 있는지"는 보여줘야 하는데(당근·QR 유입은
 * 대부분 비로그인 상태로 상세 링크를 받는다) 세션 클라이언트로는 referral 상품이
 * 0행이라 화면이 통째로 벽이 된다. 그래서 서버 전용 클라이언트로 읽되
 * visibility='hidden'을 제외하고 가격은 페이로드에서 지운다.
 */
function pickClient(sessionClient: Awaited<ReturnType<typeof createServerAppClient>>, access: CatalogAccess): AnyClient | undefined {
  if (access.priceVisible) return sessionClient;
  return hasServiceRole() ? createServiceRoleSupabaseClient() : undefined;
}

export interface CatalogResult extends CatalogAccess {
  products: Product[];
}

export async function loadVisibleCatalog(referralCode?: string, category?: string): Promise<CatalogResult> {
  if (!isSupabaseMode()) {
    // 데모에서도 운영과 같은 규칙을 따른다: 상품은 보이고, 가격만 추천 코드로 갈린다.
    // 예전에는 코드가 없으면 referral 상품이 통째로 걸러져 홈이 "상품 없음"으로 보였다.
    const valid = referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, referralCode) : undefined;
    const priceVisible = Boolean(valid);
    const all = getVisibleProducts(true, true).filter((product) => !category || product.category === category);
    return {
      products: priceVisible ? all : all.map(stripPrices),
      validReferralCode: valid?.code,
      authenticated: true,
      priceVisible,
    };
  }
  const sessionClient = await createServerAppClient();
  const access = await resolveCatalogAccess(sessionClient);
  const client = pickClient(sessionClient, access);
  if (!client) return { products: [], ...access };

  let query = client.from('products').select(PRODUCT_COLUMNS).eq('status', 'active');
  if (!access.priceVisible) query = query.neq('visibility', 'hidden');
  if (category) query = query.eq('category', category);
  const { data: rows, error } = await query.order('home_sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error || !rows) return { products: [], ...access };

  const products = await hydrate(client, rows, 'thumbnail');
  return { products: access.priceVisible ? products : products.map(stripPrices), ...access };
}

/**
 * 상세 페이지는 slug 하나만 필요하다.
 * 예전에는 전체 카탈로그를 불러와 JS에서 find했다. 상품이 늘면 조회 한 번마다 전체 스캔이 된다.
 */
export async function loadProductBySlug(slug: string, referralCode?: string): Promise<CatalogAccess & { product?: Product }> {
  if (!isSupabaseMode()) {
    const valid = referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, referralCode) : undefined;
    const priceVisible = Boolean(valid);
    const found = getProductBySlug(slug);
    return {
      product: found && !priceVisible ? stripPrices(found) : found,
      validReferralCode: valid?.code,
      authenticated: true,
      priceVisible,
    };
  }
  const sessionClient = await createServerAppClient();
  const access = await resolveCatalogAccess(sessionClient);
  const client = pickClient(sessionClient, access);
  if (!client) return access;

  let query = client.from('products').select(PRODUCT_COLUMNS).eq('slug', slug).eq('status', 'active');
  if (!access.priceVisible) query = query.neq('visibility', 'hidden');
  const { data: row } = await query.maybeSingle();
  if (!row) return access;
  const [product] = await hydrate(client, [row], 'all');
  if (!product) return access;
  return { product: access.priceVisible ? product : stripPrices(product), ...access };
}

/** 대분류 하나와 그 아래 소분류들. 상품은 소분류에 붙는다. */
export interface CategoryGroup {
  name: string;
  children: string[];
}

/**
 * 관리자가 등록한 카테고리. 2단계까지다(대분류 > 소분류).
 * 스마트스토어는 4단계지만 그건 네이버 검색 노출용 표준 분류이고,
 * 딜키는 검색 노출을 막는 폐쇄몰이라 같은 깊이가 필요하지 않다.
 */
export async function loadCategoryTree(): Promise<CategoryGroup[]> {
  if (!isSupabaseMode()) {
    return [{ name: '전체', children: [...new Set(DEMO_PRODUCTS.map((product) => product.category))] }];
  }
  const client = await createServerAppClient();
  const { data } = await client
    .from('product_categories')
    .select('id, name, parent_id, sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  const rows = data ?? [];
  const parents = rows.filter((row) => !row.parent_id);
  const groups: CategoryGroup[] = parents.map((parent) => ({
    name: parent.name,
    children: rows.filter((row) => row.parent_id === parent.id).map((row) => row.name),
  }));
  // 부모가 비활성이라 위 그룹에 못 들어간 소분류도 화면에서 사라지면 안 된다.
  const claimed = new Set(groups.flatMap((group) => group.children));
  const looseChildren = rows.filter((row) => row.parent_id && !claimed.has(row.name)).map((row) => row.name);
  if (looseChildren.length > 0) groups.push({ name: '기타', children: looseChildren });
  return groups;
}

/** 화면에서 상품 필터로 쓸 수 있는 모든 카테고리 이름(소분류 우선, 없으면 대분류). */
export async function loadCategories(): Promise<string[]> {
  const tree = await loadCategoryTree();
  return tree.flatMap((group) => (group.children.length > 0 ? group.children : [group.name]));
}
