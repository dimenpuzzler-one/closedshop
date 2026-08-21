import { describe, expect, it } from 'vitest';
import { allocateDiscount, calculateCartTotalsFromLines, FREE_SHIPPING_THRESHOLD, type CatalogLine } from '../src/index';

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
    expect(result.shippingAmount).toBe(0);
    expect(result.paidAmount).toBe(93600);
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
    expect(result.paidAmount).toBe(42500);
  });

  it('charges no shipping once the net amount reaches the free-shipping threshold', () => {
    const justUnder = calculateCartTotalsFromLines([line({ unitPrice: FREE_SHIPPING_THRESHOLD - 1 })]);
    const atThreshold = calculateCartTotalsFromLines([line({ unitPrice: FREE_SHIPPING_THRESHOLD })]);
    expect(justUnder.shippingAmount).toBe(3500);
    expect(atThreshold.shippingAmount).toBe(0);
  });

  it('uses the highest shipping fee across lines, not the first line', () => {
    // 예전 화면용 계산기는 lines[0]의 배송비만 봤고 서버는 max를 썼다.
    // 같은 장바구니가 화면과 서버에서 다른 금액을 냈다.
    const result = calculateCartTotalsFromLines([
      line({ productId: 'a', unitPrice: 10000, shippingFee: 0 }),
      line({ productId: 'b', unitPrice: 10000, shippingFee: 3500 }),
    ]);
    expect(result.shippingAmount).toBe(3500);
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
