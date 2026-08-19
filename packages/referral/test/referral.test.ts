import { describe, expect, it } from 'vitest';
import { calculateTwoDepthCommissions, getTwoDepthReferrers } from '../src/index';

const graph = new Map([
  ['buyer', { userId: 'direct', name: 'B', referrerUserId: 'parent' }],
  ['direct', { userId: 'parent', name: 'A' }],
  ['parent', { userId: 'root', name: 'Root' }],
]);

const lookup = { getReferrer: (userId: string) => graph.get(userId) };

describe('two-depth referral engine', () => {
  it('returns at most the direct and parent referrer', () => {
    expect(getTwoDepthReferrers('buyer', lookup).map((node) => node?.userId)).toEqual(['direct', 'parent']);
    expect(getTwoDepthReferrers('parent', lookup).map((node) => node?.userId)).toEqual(['root', undefined]);
  });

  it('snapshots L1 and L2 rates from the order rule', () => {
    const result = calculateTwoDepthCommissions(
      {
        orderId: 'order-1',
        buyerUserId: 'buyer',
        commissionableAmount: 100_000,
        rule: { level1Rate: 0.08, level2Rate: 0.03, approvalDays: 7 },
      },
      lookup,
    );

    expect(result.commissions).toHaveLength(2);
    expect(result.commissions.map((commission) => commission.commissionAmount)).toEqual([8000, 3000]);
    expect(result.commissions.every((commission) => commission.status === 'pending')).toBe(true);
  });

  it('does not create a third-depth commission', () => {
    const result = calculateTwoDepthCommissions(
      {
        orderId: 'order-2',
        buyerUserId: 'buyer',
        commissionableAmount: 100_000,
        rule: { level1Rate: 0.08, level2Rate: 0.03, approvalDays: 7 },
      },
      lookup,
    );

    expect(result.commissions.map((commission) => commission.depth)).toEqual([1, 2]);
    expect(result.commissions.some((commission) => commission.depth > 2)).toBe(false);
  });
});
