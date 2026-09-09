/**
 * 한국결제데이터 인증결제 연동.
 *
 * 서버가 인증결제 필드를 만들고 브라우저가 KpdCredit에 form POST한다.
 * 결제 결과는 returnUrl과 webhookUrl로 각각 전달된다.
 * Pay Key는 서버 API 호출에만 사용하며 브라우저로 절대 전달하지 않는다.
 */

export const PAYDATAKR_SUCCESS = '0000';
export const PAYDATAKR_CANCELLED_CODES = new Set([
  '1001',
  '1002',
  'CANCEL',
  'CANCELLED',
]);

export type PayDataKrPopupType = 'popup' | 'layerpopup' | 'submit';

export interface PayDataKrConfig {
  publicKey: string;
  payKey: string;
  /** 인증결제 form URL. 생략하면 API 기준 URL의 KpdCredit을 사용한다. */
  checkoutUrl?: string;
  apiBaseUrl: string;
}

/** 한국결제데이터 v1.5 JavaScript SDK에 전달할 상품 정보. */
export interface PayDataKrSdkProduct {
  name: string;
  price: number | string;
  qty: number;
  desc?: string;
}

/** 서버가 위젯 토큰 발급 API에 보내는 결제창 설정. */
export interface PayDataKrSdkCheckoutParams {
  amount: number;
  publicKey: string;
  payRoute: string;
  products: PayDataKrSdkProduct[];
  trackId?: string;
  /** SDK 결제 결과를 전달받을 가맹점 return URL. */
  redirectUrl?: string;
  webhookUrl?: string;
  /** 결제사 위젯이 생성할 인증결제 화면 방식. 현재 토큰 POST 방식은 popup을 사용한다. */
  mode?: 'popup' | 'layer' | 'submit';
  udf1?: string;
  udf2?: string;
  payerName?: string;
  payerEmail?: string;
  payerTel?: string;
  widgetLogoUrl?: string;
}

/** 결제사 위젯 토큰을 브라우저 form POST로 전달하기 위한 세션. */
export interface PayDataKrWidgetSession {
  checkoutUrl: string;
  token: string;
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
  trxId?: string;
  trxDate?: string;
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
  return String(
    result.result_advanceMsg ??
      result.advanceMsg ??
      result.result_msg ??
      result.resultMsg ??
      '',
  ).trim();
}

/**
 * v1.5 SDK의 중첩 응답과 webhook/구형 returnUrl의 평면 응답을 공통 형태로 맞춘다.
 * 원문 객체의 나머지 필드는 그대로 보존해 결제 감사 로그에 저장할 수 있다.
 */
export function normalizePayDataKrResult(
  value: unknown,
): PayDataKrPaymentResult {
  if (!isRecord(value)) return {};

  const normalized: PayDataKrPaymentResult = { ...value };
  const result = isRecord(value.result) ? value.result : undefined;
  const pay = isRecord(value.pay) ? value.pay : undefined;
  const card = pay && isRecord(pay.card) ? pay.card : undefined;

  if (result) {
    if (
      normalized.result_code === undefined &&
      typeof result.resultCd === 'string'
    )
      normalized.result_code = result.resultCd;
    if (
      normalized.resultCd === undefined &&
      typeof result.resultCd === 'string'
    )
      normalized.resultCd = result.resultCd;
    if (
      normalized.result_msg === undefined &&
      typeof result.resultMsg === 'string'
    )
      normalized.result_msg = result.resultMsg;
    if (
      normalized.resultMsg === undefined &&
      typeof result.resultMsg === 'string'
    )
      normalized.resultMsg = result.resultMsg;
    if (
      normalized.result_advanceMsg === undefined &&
      typeof result.advanceMsg === 'string'
    )
      normalized.result_advanceMsg = result.advanceMsg;
    if (
      normalized.advanceMsg === undefined &&
      typeof result.advanceMsg === 'string'
    )
      normalized.advanceMsg = result.advanceMsg;
    if (normalized.create === undefined && typeof result.create === 'string')
      normalized.create = result.create;
  }

  if (pay) {
    if (normalized.authCd === undefined && typeof pay.authCd === 'string')
      normalized.authCd = pay.authCd;
    if (normalized.tmnId === undefined && typeof pay.tmnId === 'string')
      normalized.tmnId = pay.tmnId;
    if (normalized.trackId === undefined && typeof pay.trackId === 'string')
      normalized.trackId = pay.trackId;
    if (
      normalized.amount === undefined &&
      (typeof pay.amount === 'number' || typeof pay.amount === 'string')
    )
      normalized.amount = pay.amount;
    if (normalized.transactionId === undefined) {
      const transactionId = pay.transactionId ?? pay.trxId;
      if (typeof transactionId === 'string')
        normalized.transactionId = transactionId;
    }
    if (normalized.trxId === undefined && typeof pay.trxId === 'string')
      normalized.trxId = pay.trxId;
    if (normalized.transactionDate === undefined) {
      const transactionDate = pay.transactionDate ?? pay.trxDate;
      if (typeof transactionDate === 'string')
        normalized.transactionDate = transactionDate;
    }
    if (normalized.trxDate === undefined && typeof pay.trxDate === 'string')
      normalized.trxDate = pay.trxDate;
    if (normalized.trxType === undefined && typeof pay.trxType === 'string')
      normalized.trxType = pay.trxType;
    if (normalized.paymethod === undefined && typeof pay.paymethod === 'string')
      normalized.paymethod = pay.paymethod;
    if (normalized.udf1 === undefined && typeof pay.udf1 === 'string')
      normalized.udf1 = pay.udf1;
    if (normalized.udf2 === undefined && typeof pay.udf2 === 'string')
      normalized.udf2 = pay.udf2;
    if (normalized.mchtId === undefined && typeof pay.mchtId === 'string')
      normalized.mchtId = pay.mchtId;
  }

  if (card) {
    if (normalized.cardId === undefined && typeof card.cardId === 'string')
      normalized.cardId = card.cardId;
    if (
      normalized.installment === undefined &&
      (typeof card.installment === 'number' ||
        typeof card.installment === 'string')
    )
      normalized.installment = String(card.installment);
    if (normalized.card_bin === undefined && typeof card.bin === 'string')
      normalized.card_bin = card.bin;
    if (normalized.card_last4 === undefined && typeof card.last4 === 'string')
      normalized.card_last4 = card.last4;
    if (normalized.card_issuer === undefined && typeof card.issuer === 'string')
      normalized.card_issuer = card.issuer;
    if (normalized.card_type === undefined && typeof card.cardType === 'string')
      normalized.card_type = card.cardType;
  }

  return normalized;
}

export function payDataKrAmount(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim()))
    return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function isPayDataKrCancellation(
  code: string | undefined | null,
): boolean {
  return Boolean(code && PAYDATAKR_CANCELLED_CODES.has(code.toUpperCase()));
}

function text(value: string | undefined, max: number, fallback = ''): string {
  return (value?.trim() || fallback).slice(0, max);
}

function requiredText(
  value: string | undefined,
  max: number,
  label: string,
): string {
  const normalized = text(value, max);
  if (!normalized)
    throw new PayDataKrError('E001', `${label}이(가) 필요합니다.`);
  return normalized;
}

function absoluteUrl(value: string, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('https required');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new PayDataKrError(
      'E001',
      `${label}은(는) HTTPS 절대 URL이어야 합니다.`,
    );
  }
}

export class PayDataKrPaymentProvider {
  constructor(private readonly config: PayDataKrConfig) {}

  get checkoutUrl(): string {
    return absoluteUrl(
      this.config.checkoutUrl ?? `${absoluteUrl(this.config.apiBaseUrl, '한국결제데이터 API URL')}/kpdWebPayment/KpdCredit`,
      '한국결제데이터 결제창 URL',
    );
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
    const amount = input.amount;
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new PayDataKrError('E001', '결제 금액이 올바르지 않습니다.');
    const trackId = requiredText(input.trackId, 50, 'trackId');
    const payerName = requiredText(input.payerName, 40, '구매자 성명');
    const popupType = input.popupType ?? 'submit';
    if (popupType === 'layerpopup') {
      throw new PayDataKrError(
        'E001',
        '모바일 환경에서 사용할 수 없는 결제창 방식입니다.',
      );
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
      goods_price:
        input.unitPrice === undefined ? undefined : Math.trunc(input.unitPrice),
      goods_qty:
        input.quantity === undefined ? undefined : Math.trunc(input.quantity),
      goods_desc: text(input.productDescription, 100) || undefined,
      HalbuInfo: '00',
      selcard: '',
      webhookUrl: absoluteUrl(input.webhookUrl, 'webhookUrl'),
      returnUrl: absoluteUrl(input.returnUrl, 'returnUrl'),
      cnclreturnUrl: absoluteUrl(input.cancelReturnUrl, 'cnclreturnUrl'),
    };
  }

  /** 결제 화면용 일회성 토큰을 생성한다. 카드정보나 Pay Key는 브라우저로 전달하지 않는다. */
  async createWidgetSession(
    params: PayDataKrSdkCheckoutParams,
    options?: { timeoutMs?: number },
  ): Promise<PayDataKrWidgetSession> {
    const apiBaseUrl = absoluteUrl(
      this.config.apiBaseUrl,
      '한국결제데이터 API URL',
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? 20_000,
    );
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/widget`, {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Authorization: this.config.publicKey,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ widget: params }),
        signal: controller.signal,
      });
    } catch {
      throw new PayDataKrError(
        'EB001',
        '결제창 세션 생성에 연결하지 못했습니다.',
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PayDataKrError(
        'E010',
        `결제창 세션 응답을 해석하지 못했습니다. (HTTP ${response.status})`,
      );
    }
    if (
      !response.ok ||
      !isRecord(payload) ||
      !isRecord(payload.result) ||
      typeof payload.result.resultCd !== 'string'
    ) {
      throw new PayDataKrError(
        `HTTP_${response.status}`,
        '결제창 세션 생성에 실패했습니다.',
        payload,
      );
    }
    if (payload.result.resultCd !== PAYDATAKR_SUCCESS) {
      throw new PayDataKrError(
        payload.result.resultCd,
        typeof payload.result.advanceMsg === 'string'
          ? payload.result.advanceMsg
          : typeof payload.result.resultMsg === 'string'
            ? payload.result.resultMsg
            : '결제창 세션 생성에 실패했습니다.',
        payload,
      );
    }

    const widget = isRecord(payload.widget) ? payload.widget : undefined;
    const routeUrl =
      widget && typeof widget.routeUrl === 'string' ? widget.routeUrl : '';
    const checkoutUrl = new URL(routeUrl, apiBaseUrl);
    if (
      checkoutUrl.origin !== new URL(apiBaseUrl).origin ||
      checkoutUrl.protocol !== 'https:'
    ) {
      throw new PayDataKrError('E010', '결제창 URL이 올바르지 않습니다.');
    }
    const token = checkoutUrl.searchParams.get('token')?.trim() ?? '';
    if (!token)
      throw new PayDataKrError('E010', '결제창 토큰을 받지 못했습니다.');

    return { checkoutUrl: checkoutUrl.toString(), token };
  }

  async refund(
    input: PayDataKrRefundInput,
    options?: { timeoutMs?: number },
  ): Promise<PayDataKrRefundResponse> {
    if (
      input.amount !== undefined &&
      payDataKrAmount(input.amount) === undefined
    ) {
      throw new PayDataKrError('E001', '환불 금액이 올바르지 않습니다.');
    }
    return this.request(
      '/api/refund',
      {
        method: 'POST',
        body: JSON.stringify({
          refund: { ...input, trxType: 'ONTR' },
          metadata: {},
        }),
      },
      options,
    ) as Promise<PayDataKrRefundResponse>;
  }

  async lookup(
    transactionId: string,
    options?: { timeoutMs?: number },
  ): Promise<PayDataKrLookupResponse> {
    const identifier = requiredText(transactionId, 100, '거래번호');
    return this.request(
      `/api/get/${encodeURIComponent(identifier)}`,
      { method: 'GET' },
      options,
    );
  }

  /** 조회·환불의 HTTP/JSON 오류와 본문 수신까지 포함한 제한 시간을 한 곳에서 처리한다. */
  private async request(
    path: string,
    init: RequestInit,
    options?: { timeoutMs?: number },
  ): Promise<PayDataKrLookupResponse> {
    const url = `${absoluteUrl(this.config.apiBaseUrl, '한국결제데이터 API URL')}${path}`;
    if (!this.config.payKey.trim())
      throw new PayDataKrError('E001', 'Pay Key가 필요합니다.');
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? 20_000,
    );
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Authorization: this.config.payKey,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new PayDataKrError(
          `HTTP_${response.status}`,
          '결제사 요청에 실패했습니다.',
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new PayDataKrError('E010', '결제사 응답을 해석하지 못했습니다.');
      }
      if (
        !isRecord(payload) ||
        !isRecord(payload.result) ||
        typeof payload.result.resultCd !== 'string'
      ) {
        throw new PayDataKrError(
          'E010',
          '결제사 응답 형식이 올바르지 않습니다.',
        );
      }
      if (payload.result.resultCd !== PAYDATAKR_SUCCESS) {
        throw new PayDataKrError(
          payload.result.resultCd,
          '결제사가 요청을 승인하지 않았습니다.',
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof PayDataKrError) throw error;
      throw new PayDataKrError(
        'EB001',
        '결제사 연결이 실패하거나 응답 시간이 초과되었습니다.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 콜백 값이 아닌 서버 재조회 결과의 동일 거래 객체에서 주문·금액·거래번호를 대조한다.
 * 상세 조회 응답에서 필드를 확인할 수 없으면 성공 코드만으로 승인하지 않는다.
 */
export function verifyPayDataKrLookup(
  payload: PayDataKrLookupResponse,
  expected: { trackId: string; transactionId: string; amount: number },
): void {
  // pay 객체 또는 최상위 거래 필드만 검사한다. 실제 응답 규격 확인이 필요하다.
  // 가맹점이 지정하는 metadata/udf를 승인 거래 정보로 해석하지 않는다.
  const candidates = [payload, ...(isRecord(payload.pay) ? [payload.pay] : [])];
  const matched = candidates.some(
    (record) =>
      record.trackId === expected.trackId &&
      (record.transactionId ?? record.trxId) === expected.transactionId &&
      payDataKrAmount(record.amount) === expected.amount,
  );
  if (payload.result?.resultCd !== PAYDATAKR_SUCCESS || !matched) {
    throw new PayDataKrError(
      'verification_failed',
      '결제 조회 결과의 주문번호·거래번호·금액을 확인하지 못했습니다.',
    );
  }
}
