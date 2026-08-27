import type { CommissionRule } from '@closed-commerce/types';

export const APP_NAME = 'Dealkey';
export const APP_NAME_KO = '딜키';

/**
 * 사업자 정보. 푸터·이용약관·개인정보처리방침이 각자 하드코딩하면 반드시 어긋난다.
 * 실제로 푸터 고객센터 번호와 대표님이 카카오톡에서 안내한 번호가 서로 달랐다.
 * 바꿀 일이 생기면 여기 한 곳만 고친다.
 */
export const COMPANY = {
  /** 법인/상호명 */
  name: '도미니언',
  nameEn: 'Dominion',
  ceo: '이정복',
  businessNumber: '818-06-03297',
  mailOrderNumber: '2025-고양일산동-1946',
  address: '경기도 고양시 일산동구 중앙로 1123, 제상가동 2층 207호',
  /**
   * 고객센터 대표번호.
   * 푸터에는 010-4159-1942, 카카오톡 안내에는 010-2711-1942가 쓰이고 있었다.
   * 어느 쪽이 맞는지 확인되면 이 값만 고치면 전 화면에 반영된다.
   */
  phone: '010-4159-1942',
  email: 'luxury194219@gmail.com',
  /** 개인정보 보호책임자 */
  privacyOfficer: '이정복',
  privacyOfficerEmail: 'luxury194219@gmail.com',
  /** 약관·방침 시행일 */
  termsEffectiveDate: '2026-08-27',
  privacyEffectiveDate: '2026-08-27',
} as const;
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
