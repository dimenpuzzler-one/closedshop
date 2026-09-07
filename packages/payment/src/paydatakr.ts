/**
 * 한국결제데이터 인증결제 연동.
 *
 * 결제창은 브라우저에서 HTML form POST로 호출하고, 결제 결과는 returnUrl과
 * webhookUrl로 각각 전달된다. Pay Key는 서버 API 호출에만 사용하며 브라우저로
 * 절대 전달하지 않는다.
 */

export const PAYDATAKR_SUCCESS = '0000';
export const PAYDATAKR_CANCELLED_CODES = new Set(['1001', '1002', 'CANCEL', 'CANCELLED']);

export type PayDataKrPopupType = 'popup' | 'layerpopup' | 'submit';

export interface PayDataKrConfig {
  publicKey: string;
  payKey: string;
  checkoutUrl: string;
  apiBaseUrl: string;
}

/** 한국결제데이터 인증결제창에 POST할 필드. 키 이름의 대소문자는 문서 규격을 따른다. */
export interface PayDataKrCheckoutParams {
  publicKey: string;
  certflag: 'cardcert';
  popuptype: PayDataKrPopupType;
  paysvctype: '0000';
  paymethod: 'card';
  parentTargetNm: string;
  amount: number;
  Unit: '00';
  trackId: string;
  payerName: string;
  payerEmail?: string;
  payerTel?: string;
  goods_name: string;
  goods_price?: number;
  goods_qty?: number;
  goods_desc?: string;
  HalbuInfo: string;
  selcard: string;
  webhookUrl: string;
  returnUrl: string;
  cnclreturnUrl: string;
  udf1?: string;
}

/** returnUrl form과 webhook JSON 양쪽에서 받을 수 있는 공통 결과 필드. */
export interface PayDataKrPaymentResult {
  result_code?: string;
  resultCd?: string;
  result_msg?: string;
  resultMsg?: string;
  result_advanceMsg?: string;
  advanceMsg?: string;
  authCd?: string;
  tmnId?: string;
  cancel_type?: string;
  card_issuer?: string;
  card_acquirer?: string;
  card_no?: string;
  create?: string;
  card_bin?: string;
  amount?: string | number;
  trackId?: string;
  card_last4?: string;
  card_type?: string;
  transactionDate?: string;
  udf1?: string;
  udf2?: string;
  transactionId?: string;
  cardId?: string;
  installment?: string;
  catId?: string;
  catPayYn?: string;
  mchtId?: string;
  trxType?: string;
  paymethod?: string;
  [key: string]: unknown;
}

export interface PayDataKrRefundInput {
  trackId: string;
  amount?: number;
  rootTrxId: string;
  rootTrackId: string;
  rootTrxDay: string;
  webhookUrl?: string;
  udf1?: string;
  udf2?: string;
}

export interface PayDataKrRefundResponse {
  result: {
    resultCd: string;
    resultMsg?: string;
    advanceMsg?: string;
    create?: string;
  };
  refund?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PayDataKrLookupResponse {
  result?: {
    resultCd?: string;
    resultMsg?: string;
    advanceMsg?: string;
    create?: string;
  };
  [key: string]: unknown;
}

export class PayDataKrError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'PayDataKrError';
  }
}

export function payDataKrResultCode(result: PayDataKrPaymentResult): string {
  return String(result.result_code ?? result.resultCd ?? '').trim();
}

export function payDataKrResultMessage(result: PayDataKrPaymentResult): string {
  return String(result.result_advanceMsg ?? result.advanceMsg ?? result.result_msg ?? result.resultMsg ?? '').trim();
}

export function payDataKrAmount(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : undefined;
}

export function isPayDataKrCancellation(code: string | undefined | null): boolean {
  return Boolean(code && PAYDATAKR_CANCELLED_CODES.has(code.toUpperCase()));
}

function text(value: string | undefined, max: number, fallback = ''): string {
  return (value?.trim() || fallback).slice(0, max);
}

function requiredText(value: string | undefined, max: number, label: string): string {
  const normalized = text(value, max);
  if (!normalized) throw new PayDataKrError('E001', `${label}이(가) 필요합니다.`);
  return normalized;
}

function absoluteUrl(value: string, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('https required');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new PayDataKrError('E001', `${label}은(는) HTTPS 절대 URL이어야 합니다.`);
  }
}

export class PayDataKrPaymentProvider {
  constructor(private readonly config: PayDataKrConfig) {}

  get checkoutUrl(): string {
    return absoluteUrl(this.config.checkoutUrl, '한국결제데이터 결제창 URL');
  }

  buildCheckoutParams(input: {
    trackId: string;
    amount: number;
    productName: string;
    quantity?: number;
    unitPrice?: number;
    productDescription?: string;
    payerName: string;
    payerEmail?: string;
    payerTel?: string;
    returnUrl: string;
    webhookUrl: string;
    cancelReturnUrl: string;
    popupType?: PayDataKrPopupType;
  }): PayDataKrCheckoutParams {
    const amount = Math.trunc(input.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new PayDataKrError('E001', '결제 금액이 올바르지 않습니다.');
    const trackId = requiredText(input.trackId, 50, 'trackId');
    const payerName = requiredText(input.payerName, 40, '구매자 성명');
    const popupType = input.popupType ?? 'submit';
    if (popupType === 'layerpopup') {
      throw new PayDataKrError('E001', '모바일 환경에서 사용할 수 없는 결제창 방식입니다.');
    }

    return {
      publicKey: requiredText(this.config.publicKey, 200, 'publicKey'),
      certflag: 'cardcert',
      popuptype: popupType,
      paysvctype: '0000',
      paymethod: 'card',
      parentTargetNm: 'dealkeyPaymentParent',
      amount,
      Unit: '00',
      trackId,
      payerName,
      payerEmail: text(input.payerEmail, 100) || undefined,
      payerTel: input.payerTel?.replace(/\D/g, '').slice(0, 20) || undefined,
      goods_name: requiredText(input.productName, 40, '상품명'),
      goods_price: input.unitPrice === undefined ? undefined : Math.trunc(input.unitPrice),
      goods_qty: input.quantity === undefined ? undefined : Math.trunc(input.quantity),
      goods_desc: text(input.productDescription, 100) || undefined,
      HalbuInfo: '00',
      selcard: '',
      webhookUrl: absoluteUrl(input.webhookUrl, 'webhookUrl'),
      returnUrl: absoluteUrl(input.returnUrl, 'returnUrl'),
      cnclreturnUrl: absoluteUrl(input.cancelReturnUrl, 'cnclreturnUrl'),
    };
  }

  async refund(input: PayDataKrRefundInput, options?: { timeoutMs?: number }): Promise<PayDataKrRefundResponse> {
    const url = `${absoluteUrl(this.config.apiBaseUrl, '한국결제데이터 API URL')}/api/refund`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: this.config.payKey,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          refund: {
            trxType: 'ONTR',
            trackId: input.trackId,
            amount: input.amount,
            rootTrxId: input.rootTrxId,
            rootTrackId: input.rootTrackId,
            rootTrxDay: input.rootTrxDay,
            webhookUrl: input.webhookUrl ?? '',
            udf1: input.udf1 ?? '',
            udf2: input.udf2 ?? '',
          },
          metadata: {},
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new PayDataKrError('EB001', `한국결제데이터에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();
    let payload: PayDataKrRefundResponse;
    try {
      payload = JSON.parse(body) as PayDataKrRefundResponse;
    } catch {
      throw new PayDataKrError('E010', `한국결제데이터 응답을 해석하지 못했습니다. (HTTP ${response.status})`, body.slice(0, 200));
    }
    if (payload.result?.resultCd !== PAYDATAKR_SUCCESS) {
      throw new PayDataKrError(
        payload.result?.resultCd ?? `HTTP_${response.status}`,
        payload.result?.advanceMsg || payload.result?.resultMsg || '결제 취소에 실패했습니다.',
        payload,
      );
    }
    return payload;
  }

  /** 결제 결과를 거래번호로 서버에서 재조회한다. return/webhook 값만 믿고 주문을 확정하지 않는다. */
  async lookup(transactionId: string, options?: { timeoutMs?: number }): Promise<PayDataKrLookupResponse> {
    const identifier = requiredText(transactionId, 100, '거래번호');
    const url = `${absoluteUrl(this.config.apiBaseUrl, '한국결제데이터 API URL')}/api/get/${encodeURIComponent(identifier)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.config.payKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new PayDataKrError('EB001', `한국결제데이터 조회에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();
    let payload: PayDataKrLookupResponse;
    try {
      payload = JSON.parse(body) as PayDataKrLookupResponse;
    } catch {
      throw new PayDataKrError('E010', `한국결제데이터 조회 응답을 해석하지 못했습니다. (HTTP ${response.status})`, body.slice(0, 200));
    }
    const resultCode = payload.result?.resultCd ?? '';
    if (resultCode !== PAYDATAKR_SUCCESS) {
      throw new PayDataKrError(
        resultCode || `HTTP_${response.status}`,
        payload.result?.advanceMsg || payload.result?.resultMsg || '결제 결과를 확인하지 못했습니다.',
        payload,
      );
    }
    return payload;
  }
}
