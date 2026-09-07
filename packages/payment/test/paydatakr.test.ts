import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAYDATAKR_SUCCESS,
  PayDataKrPaymentProvider,
  isPayDataKrCancellation,
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
    });
    expect(params.payerTel).toBe('01027111942');
    expect(JSON.stringify(params)).not.toContain(config.payKey);
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
});

describe('PayDataKr server APIs', () => {
  afterEach(() => vi.unstubAllGlobals());

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
