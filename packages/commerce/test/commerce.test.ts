import { describe, expect, it } from 'vitest';
import { calculateCartTotalsFromLines } from '../src/index';

describe('commerce totals', () => {
  it('snapshots discount and commissionable amount from the same order base', () => {
    const result = calculateCartTotalsFromLines([
      { productId: 'p-420', productName: '육포 420g', optionId: 'o-420', optionName: '구성: 420g', unitPrice: 52000, shippingFee: 3500, quantity: 2 },
    ], { id: 'promo', code: 'CHUSEOK10', status: 'active', usageCount: 0, rule: { discountRate: 0.1, minimumOrderAmount: 50000 } });
    expect(result.grossAmount).toBe(104000);
    expect(result.discountAmount).toBe(10400);
    expect(result.shippingAmount).toBe(0);
    expect(result.paidAmount).toBe(93600);
    expect(result.commissionableAmount).toBe(93600);
  });

  it('does not apply a promotion before its minimum order amount', () => {
    const result = calculateCartTotalsFromLines([
      { productId: 'p-300', productName: '육포 300g', unitPrice: 39000, shippingFee: 3500, quantity: 1 },
    ], { id: 'promo', code: 'CHUSEOK10', status: 'active', usageCount: 0, rule: { discountRate: 0.1, minimumOrderAmount: 50000 } });
    expect(result.discountAmount).toBe(0);
    expect(result.paidAmount).toBe(42500);
  });
});
