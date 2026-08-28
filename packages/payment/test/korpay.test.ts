import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  describeKorpayCode,
  isUserCancellation,
  korpayEdiDate,
  korpayHashKey,
  korpayIssuerName,
  KorpayPaymentProvider,
  toKorpayOrderNumber,
  toKorpayProductName,
} from '../src/korpay';

const config = { merchantId: 'test12345m', mkey: 'secret-mkey', baseUrl: 'https://payments.korpay.com/v1' };

describe('korpay hashKey', () => {
  it('hashes merchantId + ediDate + amount + mkey with SHA-256', () => {
    const expected = createHash('sha256').update('test12345m2026082810300055000secret-mkey', 'utf8').digest('hex');
    expect(korpayHashKey({ merchantId: 'test12345m', ediDate: '20260828103000', amount: '55000', mkey: 'secret-mkey' })).toBe(expected);
  });

  it('changes when the amount changes, so a tampered amount fails verification', () => {
    const base = { merchantId: 'm', ediDate: '20260828103000', mkey: 'k' };
    expect(korpayHashKey({ ...base, amount: '1000' })).not.toBe(korpayHashKey({ ...base, amount: '2000' }));
  });
});

describe('korpay ediDate', () => {
  it('formats Korean time as yyyyMMddHHmmss', () => {
    // 2026-08-28T01:30:00Z = 한국 시간 10:30
    expect(korpayEdiDate(new Date('2026-08-28T01:30:00Z'))).toBe('20260828103000');
  });

  it('rolls the date forward for late-evening UTC', () => {
    // 2026-08-28T15:30:00Z = 한국 시간 다음날 00:30
    expect(korpayEdiDate(new Date('2026-08-28T15:30:00Z'))).toBe('20260829003000');
  });
});

describe('주문번호 정리', () => {
  it('strips hyphens because Korpay only accepts letters and digits', () => {
    // 예전 형식이 그대로 나가면 E001로 거절된다.
    expect(toKorpayOrderNumber('CC-20260828-A1B2C3')).toBe('CC20260828A1B2C3');
  });

  it('caps the length at 40', () => {
    expect(toKorpayOrderNumber('A'.repeat(60))).toHaveLength(40);
  });

  it('rejects a value that has nothing usable left', () => {
    expect(() => toKorpayOrderNumber('---')).toThrow();
  });
});

describe('상품명 정리', () => {
  it('keeps Korean, digits and the allowed punctuation', () => {
    expect(toKorpayProductName('한우 육포 선물세트 (420g)')).toBe('한우 육포 선물세트 (420g)');
  });

  it('drops characters Korpay rejects', () => {
    expect(toKorpayProductName('육포 <스페셜> 100%*')).toBe('육포 스페셜 100');
  });

  it('never returns an empty name', () => {
    expect(toKorpayProductName('***')).toBe('상품');
  });

  it('caps the length at 50', () => {
    expect(toKorpayProductName('가'.repeat(80))).toHaveLength(50);
  });
});

describe('checkout parameters', () => {
  it('builds a signed parameter set without leaking the mkey', () => {
    const provider = new KorpayPaymentProvider(config);
    const params = provider.buildCheckoutParams({
      orderNumber: 'CC-2026-ABC',
      productName: '한우 육포 선물세트',
      amount: 55000,
      returnUrl: 'https://dealkey.co.kr/api/payments/korpay/return',
      customerPhone: '010-2711-1942',
      now: new Date('2026-08-28T01:30:00Z'),
    });
    expect(params.orderNumber).toBe('CC2026ABC');
    expect(params.amount).toBe('55000');
    expect(params.ediDate).toBe('20260828103000');
    expect(params.payMethod).toBe('card');
    // 전화번호는 숫자만 보낸다.
    expect(params.customerPhone).toBe('01027111942');
    expect(params.hashKey).toBe(korpayHashKey({ merchantId: config.merchantId, ediDate: '20260828103000', amount: '55000', mkey: config.mkey }));
    // 직렬화해도 비밀키가 섞여 나가면 안 된다.
    expect(JSON.stringify(params)).not.toContain(config.mkey);
  });
});

describe('오류 코드 안내', () => {
  it('turns codes into sentences a buyer can act on', () => {
    expect(describeKorpayCode('E004')).toContain('시간이 초과');
    expect(describeKorpayCode('3024')).toContain('할부');
    expect(describeKorpayCode('E002')).toContain('이미 결제');
  });

  it('falls back to the message from Korpay for unknown codes', () => {
    expect(describeKorpayCode('ZZZZ', '알 수 없는 상태')).toBe('알 수 없는 상태');
    expect(describeKorpayCode('ZZZZ')).toContain('ZZZZ');
  });

  it('treats a buyer cancellation as a cancellation, not an error', () => {
    expect(isUserCancellation('E111')).toBe(true);
    expect(isUserCancellation('E004')).toBe(false);
  });

  it('names the card issuer', () => {
    expect(korpayIssuerName('06')).toBe('신한');
    expect(korpayIssuerName('99')).toBeUndefined();
  });
});
