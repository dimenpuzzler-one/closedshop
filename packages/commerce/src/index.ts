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

export function calculateCartTotals(items: CartItem[], promotion?: PromotionCode): {
  grossAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
  commissionableAmount: number;
  quantity: number;
} {
  const lines = items.map((item) => {
    const product = getProductById(item.productId);
    if (!product) throw new Error(`상품을 찾을 수 없습니다: ${item.productId}`);
    const option = item.optionId ? product.options.find((candidate) => candidate.id === item.optionId) : product.options[0];
    if (!option) throw new Error(`상품 옵션을 찾을 수 없습니다: ${item.productId}`);
    return { product, unitPrice: option.price, quantity: item.quantity };
  });
  const grossAmount = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  let discountAmount = 0;
  if (promotion?.rule.minimumOrderAmount === undefined || grossAmount >= promotion.rule.minimumOrderAmount) {
    if (promotion?.rule.minimumQuantity === undefined || quantity >= promotion.rule.minimumQuantity) {
      discountAmount = Math.min(grossAmount, promotion?.rule.discountRate
        ? Math.round(grossAmount * promotion.rule.discountRate)
        : promotion?.rule.discountAmount ?? 0);
    }
  }
  const shippingAmount = grossAmount - discountAmount >= 50_000 ? 0 : lines[0]?.product.shippingFee ?? 0;
  const paidAmount = Math.max(0, grossAmount - discountAmount + shippingAmount);
  const commissionableAmount = Math.max(0, grossAmount - discountAmount);
  return { grossAmount, discountAmount, shippingAmount, paidAmount, commissionableAmount, quantity };
}

export interface CatalogLine {
  productId: string;
  productName: string;
  optionId?: string;
  optionName?: string;
  unitPrice: number;
  shippingFee: number;
  quantity: number;
}

export function calculateCartTotalsFromLines(lines: CatalogLine[], promotion?: PromotionCode): {
  grossAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
  commissionableAmount: number;
  quantity: number;
} {
  const grossAmount = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const productsAllowed = !promotion?.rule.productIds?.length || lines.every((line) => promotion.rule.productIds?.includes(line.productId));
  const meetsAmount = promotion?.rule.minimumOrderAmount === undefined || grossAmount >= promotion.rule.minimumOrderAmount;
  const meetsQuantity = promotion?.rule.minimumQuantity === undefined || quantity >= promotion.rule.minimumQuantity;
  const eligible = Boolean(promotion && productsAllowed && meetsAmount && meetsQuantity);
  const discountAmount = eligible
    ? promotion?.rule.discountRate
      ? Math.round(grossAmount * promotion.rule.discountRate)
      : promotion?.rule.discountAmount ?? 0
    : 0;
  const cappedDiscountAmount = Math.min(grossAmount, discountAmount);
  const shippingAmount = Math.max(0, grossAmount - cappedDiscountAmount) >= 50_000 ? 0 : Math.max(...lines.map((line) => line.shippingFee), 0);
  const paidAmount = Math.max(0, grossAmount - cappedDiscountAmount + shippingAmount);
  const commissionableAmount = Math.max(0, grossAmount - cappedDiscountAmount);
  return { grossAmount, discountAmount: cappedDiscountAmount, shippingAmount, paidAmount, commissionableAmount, quantity };
}

export function findPromotionCode(code: string): PromotionCode | undefined {
  return DEMO_PROMOTIONS.find((promotion) => promotion.code === code.trim().toUpperCase() && promotion.status === 'active');
}

export function summarizeOrderInput(input: CreateOrderInput) {
  const promotion = input.promotionCode ? findPromotionCode(input.promotionCode) : undefined;
  return { ...calculateCartTotals(input.items, promotion), promotion };
}
