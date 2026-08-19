import type { CommissionRule } from '@closed-commerce/types';

export const APP_NAME = 'Closed Commerce';
export const DEFAULT_COMMISSION_RULE: CommissionRule = {
  level1Rate: 0.08,
  level2Rate: 0.03,
  approvalDays: 7,
};

export function getCommissionRule(): CommissionRule {
  const level1 = Number(process.env.L1_COMMISSION_RATE);
  const level2 = Number(process.env.L2_COMMISSION_RATE);
  const approvalDays = Number(process.env.COMMISSION_APPROVAL_DAYS);
  return {
    level1Rate: Number.isFinite(level1) && level1 >= 0 ? level1 : DEFAULT_COMMISSION_RULE.level1Rate,
    level2Rate: Number.isFinite(level2) && level2 >= 0 ? level2 : DEFAULT_COMMISSION_RULE.level2Rate,
    approvalDays: Number.isFinite(approvalDays) && approvalDays >= 0 ? approvalDays : DEFAULT_COMMISSION_RULE.approvalDays,
  };
}

export function formatWon(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`;
}
