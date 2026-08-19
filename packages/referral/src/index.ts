import type { CommissionRule, CommissionSnapshot, Id, ReferralCode, ReferralNode } from '@closed-commerce/types';

export interface ReferralLookup {
  getReferrer(userId: Id): ReferralNode | undefined;
}

export interface CommissionCalculationInput {
  orderId: Id;
  buyerUserId: Id;
  commissionableAmount: number;
  createdAt?: string;
  rule: CommissionRule;
}

export interface CommissionCalculationResult {
  directReferrer?: ReferralNode;
  parentReferrer?: ReferralNode;
  commissions: CommissionSnapshot[];
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

export function findValidReferralCode(codes: ReferralCode[], value: string, now = new Date()): ReferralCode | undefined {
  const normalized = normalizeReferralCode(value);
  return codes.find((code) => {
    if (normalizeReferralCode(code.code) !== normalized || code.status !== 'active') return false;
    if (code.startsAt && new Date(code.startsAt) > now) return false;
    if (code.expiresAt && new Date(code.expiresAt) < now) return false;
    return true;
  });
}

export function getTwoDepthReferrers(buyerUserId: Id, lookup: ReferralLookup): [ReferralNode | undefined, ReferralNode | undefined] {
  const directReferrer = lookup.getReferrer(buyerUserId);
  if (!directReferrer) return [undefined, undefined];
  const parentReferrer = lookup.getReferrer(directReferrer.userId);
  return [directReferrer, parentReferrer];
}

function createCommission(
  input: CommissionCalculationInput,
  beneficiary: ReferralNode,
  depth: 1 | 2,
  rate: number,
  createdAt: string,
): CommissionSnapshot {
  const base = Math.max(0, Math.round(input.commissionableAmount));
  const commissionAmount = Math.round(base * rate);
  return {
    id: `${input.orderId}-l${depth}`,
    orderId: input.orderId,
    buyerUserId: input.buyerUserId,
    beneficiaryUserId: beneficiary.userId,
    beneficiaryName: beneficiary.name,
    depth,
    commissionBase: base,
    commissionRate: rate,
    commissionAmount,
    status: 'pending',
    createdAt,
  };
}

export function calculateTwoDepthCommissions(input: CommissionCalculationInput, lookup: ReferralLookup): CommissionCalculationResult {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const [directReferrer, parentReferrer] = getTwoDepthReferrers(input.buyerUserId, lookup);
  const commissions: CommissionSnapshot[] = [];

  if (directReferrer && input.rule.level1Rate > 0) {
    commissions.push(createCommission(input, directReferrer, 1, input.rule.level1Rate, createdAt));
  }
  if (parentReferrer && input.rule.level2Rate > 0) {
    commissions.push(createCommission(input, parentReferrer, 2, input.rule.level2Rate, createdAt));
  }

  return { directReferrer, parentReferrer, commissions };
}

export function nextCommissionStatus(status: CommissionSnapshot['status'], event: 'approve' | 'pay' | 'cancel' | 'reverse'): CommissionSnapshot['status'] {
  if (event === 'cancel') return 'cancelled';
  if (event === 'reverse') return 'reversed';
  if (event === 'approve' && status === 'pending') return 'approved';
  if (event === 'pay' && (status === 'approved' || status === 'payable')) return 'paid';
  return status;
}
