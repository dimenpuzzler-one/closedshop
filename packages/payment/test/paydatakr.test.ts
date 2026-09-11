import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAYDATAKR_SUCCESS,
  PayDataKrPaymentProvider,
  isPayDataKrCancellation,
  normalizePayDataKrResult,
  payDataKrAmount,
  payDataKrResultCode,
} from '../src/paydatakr';

const config = {
  publicKey: 'public-test-key',
  payKey: 'server-only-pay-key',
  checkoutUrl: 'https://api.paydatakr.com/payment/card',
  apiBaseUrl: 'https://api.paydatakr.com',
};

describe('PayDataKr checkout parameters', () => {
  it('uses the documented authentication payment fields', () => {
    const params = new PayDataKrPaymentProvider(config).buildCheckoutParams({
      trackId: 'DK20260907ABC123',
      amount: 55000,
      productName: '한우 육포 선물세트',
      quantity: 2,
      unitPrice: 27500,
      payerName: '홍길동',
      payerEmail: 'buyer@example.com',
      payerTel: '010-2711-1942',
      returnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/return',
      webhookUrl: 'https://dealkey.co.kr/api/payments/paydatakr/webhook',
      cancelReturnUrl: 'https://dealkey.co.kr/checkout',
    });

    expect(params).toMatchObject({
      publicKey: config.publicKey,
      certflag: 'cardcert',
      popuptype: 'submit',
      paysvctype: '0000',
      paymethod: 'card',
      amount: 55000,
      Unit: '00',
      trackId: 'DK20260907ABC123',
      goods_name: '한우 육포 선물세트',
      goods_qty: 2,
      HalbuInfo: '00',
      selcard: '',
      returnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/return',
      webhookUrl: 'https://dealkey.co.kr/api/payments/paydatakr/webhook',
      cnclreturnUrl: 'https://dealkey.co.kr/checkout',
    });
    expect(params.payerTel).toBe('01027111942');
    expect(JSON.stringify(params)).not.toContain(config.payKey);
  });

  it('uses the authentication form endpoint without a one-time token', () => {
    const provider = new PayDataKrPaymentProvider({ ...config, checkoutUrl: undefined });
    expect(provider.checkoutUrl).toBe('https://api.paydatakr.com/kpdWebPayment/KpdCredit');
    expect(new URL(provider.checkoutUrl).search).toBe('');
  });

  it('supports the documented popup payment mode', () => {
    const params = new PayDataKrPaymentProvider(config).buildCheckoutParams({
      trackId: 'CHECK-POPUP-1',
      amount: 1000,
      productName: '테스트 상품',
      payerName: '테스트 구매자',
      returnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/return',
      webhookUrl: 'https://dealkey.co.kr/api/payments/paydatakr/webhook',
      cancelReturnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/cancel',
      popupType: 'popup',
    });

    expect(params).toMatchObject({
      popuptype: 'popup',
      parentTargetNm: 'dealkeyPaymentParent',
      HalbuInfo: '00',
    });
  });

  it.each(['returnUrl', 'webhookUrl', 'cancelReturnUrl'] as const)('rejects a missing %s before starting checkout', (field) => {
    const input = {
      trackId: 'CHECK123', amount: 1000, productName: '테스트', payerName: '테스트',
      returnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/return',
      webhookUrl: 'https://dealkey.co.kr/api/payments/paydatakr/webhook',
      cancelReturnUrl: 'https://dealkey.co.kr/api/payments/paydatakr/cancel',
      [field]: '',
    };
    expect(() => new PayDataKrPaymentProvider(config).buildCheckoutParams(input)).toThrow();
  });
});

describe('PayDataKr result helpers', () => {
  it('reads both return and webhook result code names', () => {
    expect(payDataKrResultCode({ result_code: PAYDATAKR_SUCCESS })).toBe('0000');
    expect(payDataKrResultCode({ resultCd: PAYDATAKR_SUCCESS })).toBe('0000');
  });

  it('normalizes gateway amounts and recognizes cancellation codes', () => {
    expect(payDataKrAmount('1,004')).toBeUndefined();
    expect(payDataKrAmount('1004')).toBe(1004);
    expect(isPayDataKrCancellation('cancel')).toBe(true);
  });

  it('normalizes the v1.5 SDK response without losing the nested payload', () => {
    const raw = {
      result: { resultCd: PAYDATAKR_SUCCESS, resultMsg: '정상', advanceMsg: '정상승인' },
      pay: {
        trxId: 'TRX1',
        trackId: 'ORDER1',
        trxDate: '20260908120000',
        amount: 1004,
        card: { cardId: 'card_test', last4: '4242', installment: 0 },
      },
    };
    const normalized = normalizePayDataKrResult(raw);

    expect(payDataKrResultCode(normalized)).toBe(PAYDATAKR_SUCCESS);
    expect(normalized).toMatchObject({
      trackId: 'ORDER1',
      transactionId: 'TRX1',
      amount: 1004,
      transactionDate: '20260908120000',
      card_last4: '4242',
      result_advanceMsg: '정상승인',
      pay: raw.pay,
    });
  });
});

describe('PayDataKr server APIs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a browser-safe widget session with a POST token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: { resultCd: PAYDATAKR_SUCCESS, resultMsg: '정상' },
          widget: {
            routeUrl: '/kpdWebPayment/KpdCredit?token=key_test_123',
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await new PayDataKrPaymentProvider(config).createWidgetSession({
      amount: 1000,
      publicKey: config.publicKey,
      payRoute: 'regular',
      mode: 'popup',
      trackId: 'DK-WIDGET-1',
      products: [{ name: '테스트', price: 1000, qty: 1 }],
      redirectUrl: 'https://dealkey.co.kr/api/payments/paydatakr/return',
      webhookUrl: 'https://dealkey.co.kr/api/payments/paydatakr/webhook',
    });

    expect(session).toEqual({
      checkoutUrl: 'https://api.paydatakr.com/kpdWebPayment/KpdCredit?token=key_test_123',
      token: 'key_test_123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paydatakr.com/api/widget',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: config.publicKey }),
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain(config.payKey);
  });

  it('rechecks a transaction with the Pay Key and does not expose it in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { resultCd: '0000', resultMsg: '정상' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new PayDataKrPaymentProvider(config).lookup('T251023013797');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paydatakr.com/api/get/T251023013797',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: config.payKey }),
      }),
    );
  });
});
