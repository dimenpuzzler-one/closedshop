import { describe, expect, it } from 'vitest';
import {
  allocateDiscount,
  calculateCartTotalsFromLines,
  calculateShippingAmount,
  DEFAULT_SHIPPING_POLICY,
  type CatalogLine,
} from '../src/index';

const line = (overrides: Partial<CatalogLine> = {}): CatalogLine => ({
  productId: 'p-420',
  productName: '육포 420g',
  optionId: 'o-420',
  optionName: '구성: 420g',
  unitPrice: 52000,
  shippingFee: 3500,
  quantity: 1,
  ...overrides,
});

describe('commerce totals', () => {
  it('snapshots discount and commissionable amount from the same order base', () => {
    const result = calculateCartTotalsFromLines([line({ quantity: 2 })], {
      id: 'promo',
      code: 'CHUSEOK10',
      status: 'active',
      usageCount: 0,
      rule: { discountRate: 0.1, minimumOrderAmount: 50000 },
    });
    expect(result.grossAmount).toBe(104000);
    expect(result.discountAmount).toBe(10400);
    // 기본 정책은 카툰 5개당 4,000원. 2개면 카툰 1개.
    expect(result.shippingAmount).toBe(4000);
    expect(result.paidAmount).toBe(97600);
    expect(result.commissionableAmount).toBe(93600);
  });

  it('does not apply a promotion before its minimum order amount', () => {
    const result = calculateCartTotalsFromLines([line({ productId: 'p-300', unitPrice: 39000 })], {
      id: 'promo',
      code: 'CHUSEOK10',
      status: 'active',
      usageCount: 0,
      rule: { discountRate: 0.1, minimumOrderAmount: 50000 },
    });
    expect(result.discountAmount).toBe(0);
    expect(result.paidAmount).toBe(43000);
  });

  it('charges per carton on the whole order quantity, not per product line', () => {
    // 형님이 정한 규칙: 1~5개 4,000원 / 6~10개 8,000원.
    // 예전에는 상품별 shippingFee의 max를 썼고, 몇 개를 사든 금액이 같았다.
    expect(calculateShippingAmount(1, 0, DEFAULT_SHIPPING_POLICY)).toBe(4000);
    expect(calculateShippingAmount(5, 0, DEFAULT_SHIPPING_POLICY)).toBe(4000);
    expect(calculateShippingAmount(6, 0, DEFAULT_SHIPPING_POLICY)).toBe(8000);
    expect(calculateShippingAmount(10, 0, DEFAULT_SHIPPING_POLICY)).toBe(8000);
    expect(calculateShippingAmount(11, 0, DEFAULT_SHIPPING_POLICY)).toBe(12000);
  });

  it('splits cartons across products because the carton is per order, not per line', () => {
    const result = calculateCartTotalsFromLines([
      line({ productId: 'a', unitPrice: 10000, quantity: 3 }),
      line({ productId: 'b', unitPrice: 10000, quantity: 3 }),
    ]);
    expect(result.quantity).toBe(6);
    expect(result.shippingAmount).toBe(8000);
  });

  it('waives shipping only when the operator set a free-shipping threshold', () => {
    const policy = { cartonQuantity: 5, feePerCarton: 4000, freeShippingThreshold: 100_000 };
    const justUnder = calculateCartTotalsFromLines([line({ unitPrice: 99_999 })], undefined, policy);
    const atThreshold = calculateCartTotalsFromLines([line({ unitPrice: 100_000 })], undefined, policy);
    expect(justUnder.shippingAmount).toBe(4000);
    expect(atThreshold.shippingAmount).toBe(0);
    // 임계값을 안 정하면 금액과 무관하게 항상 배송비를 받는다(기본값).
    expect(calculateCartTotalsFromLines([line({ unitPrice: 999_999 })]).shippingAmount).toBe(4000);
  });

  it('guards against a zero or negative carton quantity from bad settings', () => {
    expect(calculateShippingAmount(3, 0, { cartonQuantity: 0, feePerCarton: 4000 })).toBe(12000);
    expect(calculateShippingAmount(3, 0, { cartonQuantity: 5, feePerCarton: -1 })).toBe(0);
  });

  it('skips a product-scoped promotion when the cart contains an ineligible product', () => {
    const result = calculateCartTotalsFromLines(
      [line({ productId: 'allowed', unitPrice: 60000 }), line({ productId: 'other', unitPrice: 60000 })],
      { id: 'promo', code: 'ONLYA', status: 'active', usageCount: 0, rule: { discountRate: 0.5, productIds: ['allowed'] } },
    );
    expect(result.discountAmount).toBe(0);
  });

  it('never discounts more than the gross amount', () => {
    const result = calculateCartTotalsFromLines([line({ unitPrice: 10000 })], {
      id: 'promo',
      code: 'BIG',
      status: 'active',
      usageCount: 0,
      rule: { discountAmount: 999999 },
    });
    expect(result.discountAmount).toBe(10000);
    expect(result.paidAmount).toBeGreaterThanOrEqual(0);
    expect(result.commissionableAmount).toBe(0);
  });

  it('returns zeroed totals for an empty cart instead of -Infinity shipping', () => {
    const result = calculateCartTotalsFromLines([]);
    expect(result).toEqual({
      grossAmount: 0,
      discountAmount: 0,
      shippingAmount: 0,
      paidAmount: 0,
      commissionableAmount: 0,
      quantity: 0,
    });
  });
});

describe('discount allocation', () => {
  it('distributes the exact discount across lines with no rounding drift', () => {
    // 라인별 반올림 합계가 주문 할인액과 어긋나면
    // order_items.commissionable_amount 합 != orders.commissionable_amount가 된다.
    const lines = [
      line({ productId: 'a', unitPrice: 3333, quantity: 1 }),
      line({ productId: 'b', unitPrice: 3333, quantity: 1 }),
      line({ productId: 'c', unitPrice: 3334, quantity: 1 }),
    ];
    const gross = 10000;
    const discount = 1000;
    const shares = allocateDiscount(lines, gross, discount);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(discount);
  });

  it('returns zero shares when there is no discount', () => {
    expect(allocateDiscount([line()], 52000, 0)).toEqual([0]);
  });

  it('handles an empty line list', () => {
    expect(allocateDiscount([], 0, 0)).toEqual([]);
  });
});
