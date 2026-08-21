import type { CartItem, Product, PromotionCode, ReferralCode, ReferralNode } from '@closed-commerce/types';
import type { CreateOrderInput } from '@closed-commerce/validation';

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'product-300',
    slug: 'premium-jerky-300g',
    name: '한우 육포 선물세트 300g',
    category: '선물세트',
    shortDescription: '가볍게 전하기 좋은 프리미엄 한우 육포 세트',
    description: '엄선한 원육을 정성껏 숙성해 담은 실속형 명절 선물세트입니다.',
    weight: '300g',
    price: 39_000,
    shippingFee: 3_500,
    visibility: 'referral',
    status: 'active',
    imageUrl: '/products/jerky-300.svg',
    options: [{ id: 'option-300-default', name: '구성', value: '육포 300g', price: 39_000, stock: 120 }],
    tags: ['추석', '실속 선물'],
  },
  {
    id: 'product-420',
    slug: 'premium-jerky-420g',
    name: '한우 육포 선물세트 420g',
    category: '선물세트',
    shortDescription: '가족과 나누기 좋은 균형 잡힌 구성',
    description: '선물의 만족도와 실용성을 함께 고려한 420g 구성입니다.',
    weight: '420g',
    price: 52_000,
    shippingFee: 3_500,
    visibility: 'referral',
    status: 'active',
    imageUrl: '/products/jerky-420.svg',
    options: [{ id: 'option-420-default', name: '구성', value: '육포 420g', price: 52_000, stock: 90 }],
    tags: ['추석', '베스트'],
  },
  {
    id: 'product-480',
    slug: 'premium-jerky-480g',
    name: '한우 육포 선물세트 480g',
    category: '선물세트',
    shortDescription: '거래처와 가족 모두에게 어울리는 대표 구성',
    description: '선물용 패키지와 넉넉한 중량으로 준비한 대표 상품입니다.',
    weight: '480g',
    price: 59_000,
    shippingFee: 0,
    visibility: 'referral',
    status: 'active',
    imageUrl: '/products/jerky-480.svg',
    options: [{ id: 'option-480-default', name: '구성', value: '육포 480g', price: 59_000, stock: 70 }],
    tags: ['추석', '무료배송'],
  },
  {
    id: 'product-600',
    slug: 'premium-jerky-600g',
    name: '한우 육포 선물세트 600g',
    category: '선물세트',
    shortDescription: '감사한 분께 넉넉하게 전하는 프리미엄 구성',
    description: '중요한 선물과 단체 주문을 위해 가장 넉넉하게 구성했습니다.',
    weight: '600g',
    price: 72_000,
    shippingFee: 0,
    visibility: 'referral',
    status: 'active',
    imageUrl: '/products/jerky-600.svg',
    options: [{ id: 'option-600-default', name: '구성', value: '육포 600g', price: 72_000, stock: 45 }],
    tags: ['추석', '프리미엄', '무료배송'],
  },
];

export const DEMO_PROMOTIONS: PromotionCode[] = [
  {
    id: 'promotion-chuseok10',
    code: 'CHUSEOK10',
    status: 'active',
    usageCount: 18,
    totalUsageLimit: 100,
    perMemberUsageLimit: 1,
    rule: { discountRate: 0.1, minimumOrderAmount: 50_000 },
  },
  {
    id: 'promotion-vip15',
    code: 'VIP15',
    status: 'active',
    usageCount: 4,
    rule: { discountRate: 0.15, minimumOrderAmount: 100_000 },
  },
];

export const DEMO_REFERRAL_CODES: ReferralCode[] = [
  { id: 'ref-kgy', code: 'KGY001', ownerUserId: 'user-kgy', ownerName: '김건엽', status: 'active' },
  { id: 'ref-lee', code: 'LEE001', ownerUserId: 'user-lee', ownerName: '이정복', status: 'active' },
  { id: 'ref-jihye', code: 'JIHYE01', ownerUserId: 'user-jihye', ownerName: '지혜 파트너', status: 'active' },
];

export const DEMO_REFERRAL_GRAPH = new Map<string, ReferralNode>([
  ['user-demo', { userId: 'user-kgy', name: '김건엽' }],
  ['user-kgy', { userId: 'user-lee', name: '이정복' }],
]);

export function getProductById(productId: string): Product | undefined {
  return DEMO_PRODUCTS.find((product) => product.id === productId);
}

export function getProductBySlug(slug: string): Product | undefined {
  return DEMO_PRODUCTS.find((product) => product.slug === slug);
}

export function getVisibleProducts(isMember = false, hasReferral = false): Product[] {
  return DEMO_PRODUCTS.filter((product) => {
    if (product.status !== 'active') return false;
    if (product.visibility === 'public') return true;
    if (product.visibility === 'member') return isMember;
    if (product.visibility === 'referral') return isMember && hasReferral;
    return false;
  });
}

/**
 * 무료배송 기준액. 예전에는 두 개의 계산 함수에 각각 50_000이 하드코딩되어 있었다.
 * 운영자가 바꿔야 하는 값이므로 최종적으로는 store_settings로 옮겨야 한다.
 */
export const FREE_SHIPPING_THRESHOLD = 50_000;

export interface CatalogLine {
  productId: string;
  productName: string;
  optionId?: string;
  optionName?: string;
  unitPrice: number;
  shippingFee: number;
  quantity: number;
}

export interface CartTotals {
  grossAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
  commissionableAmount: number;
  quantity: number;
}

/**
 * 금액 계산의 단일 진입점.
 *
 * 예전에는 계산기가 둘이었다: 화면용 calculateCartTotals(DEMO_PRODUCTS 기준)와
 * 주문 저장용 calculateCartTotalsFromLines(실 DB 기준). 배송비 산출 방식과
 * promotion productIds 검사 여부가 서로 달라, 같은 장바구니가 화면과 서버에서
 * 다른 금액을 낼 수 있었다. 이제 이 함수 하나만 존재한다.
 */
export function calculateCartTotalsFromLines(lines: CatalogLine[], promotion?: PromotionCode): CartTotals {
  const grossAmount = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const productsAllowed = !promotion?.rule.productIds?.length || lines.every((line) => promotion.rule.productIds?.includes(line.productId));
  const meetsAmount = promotion?.rule.minimumOrderAmount === undefined || grossAmount >= promotion.rule.minimumOrderAmount;
  const meetsQuantity = promotion?.rule.minimumQuantity === undefined || quantity >= promotion.rule.minimumQuantity;
  const eligible = Boolean(promotion && productsAllowed && meetsAmount && meetsQuantity);
  const rawDiscount = eligible
    ? promotion?.rule.discountRate
      ? Math.round(grossAmount * promotion.rule.discountRate)
      : promotion?.rule.discountAmount ?? 0
    : 0;
  const discountAmount = Math.min(grossAmount, rawDiscount);
  const netAmount = Math.max(0, grossAmount - discountAmount);
  const shippingAmount = lines.length === 0 || netAmount >= FREE_SHIPPING_THRESHOLD ? 0 : Math.max(...lines.map((line) => line.shippingFee), 0);
  return {
    grossAmount,
    discountAmount,
    shippingAmount,
    paidAmount: Math.max(0, netAmount + shippingAmount),
    commissionableAmount: netAmount,
    quantity,
  };
}

/**
 * 주문 라인별 할인 배분. 단순 반올림은 합계가 주문 할인액과 어긋나
 * order_items.commissionable_amount 합 != orders.commissionable_amount가 됐다.
 * 마지막 라인에 잔차를 몰아 합계를 정확히 맞춘다.
 */
export function allocateDiscount(lines: CatalogLine[], grossAmount: number, discountAmount: number): number[] {
  if (lines.length === 0) return [];
  if (grossAmount <= 0 || discountAmount <= 0) return lines.map(() => 0);
  const shares = lines.map((line) => Math.round((discountAmount * line.unitPrice * line.quantity) / grossAmount));
  const drift = discountAmount - shares.reduce((sum, share) => sum + share, 0);
  const lastIndex = shares.length - 1;
  shares[lastIndex] = Math.max(0, (shares[lastIndex] ?? 0) + drift);
  return shares;
}

/** 데모 카탈로그(DEMO_PRODUCTS)를 위 계산기가 먹을 수 있는 라인으로 바꾼다. 데모 전용. */
export function toDemoCatalogLines(items: CartItem[]): CatalogLine[] {
  return items.map((item) => {
    const product = getProductById(item.productId);
    if (!product) throw new Error(`상품을 찾을 수 없습니다: ${item.productId}`);
    const option = item.optionId ? product.options.find((candidate) => candidate.id === item.optionId) : product.options[0];
    if (!option) throw new Error(`상품 옵션을 찾을 수 없습니다: ${item.productId}`);
    return {
      productId: product.id,
      productName: product.name,
      optionId: option.id,
      optionName: `${option.name}: ${option.value}`,
      unitPrice: option.price,
      shippingFee: product.shippingFee,
      quantity: item.quantity,
    };
  });
}

export function findPromotionCode(code: string): PromotionCode | undefined {
  return DEMO_PROMOTIONS.find((promotion) => promotion.code === code.trim().toUpperCase() && promotion.status === 'active');
}

/** 데모 모드 주문 요약. 운영 경로는 apps/web/lib/order-service.ts를 쓴다. */
export function summarizeOrderInput(input: CreateOrderInput) {
  const promotion = input.promotionCode ? findPromotionCode(input.promotionCode) : undefined;
  return { ...calculateCartTotalsFromLines(toDemoCatalogLines(input.items), promotion), promotion };
}
