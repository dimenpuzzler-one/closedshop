import { createHash } from 'node:crypto';
import {
  describeKorpayCode,
  isUserCancellation,
  KORPAY_CARD_ISSUERS,
  KORPAY_PAYMENT_SUCCESS,
} from './korpay-codes';

/**
 * 코페이 인증결제.
 *
 * 흐름이 두 단계로 나뉜다.
 *   1) 서버가 결제창 파라미터(해시 포함)를 만들어 브라우저에 준다.
 *   2) 고객이 카드 인증을 마치면 코페이가 returnUrl로 POST한다.
 *   3) 서버가 그 paymentKey로 승인 API를 호출해야 실제로 돈이 빠진다.
 *
 * 2번과 3번 사이는 10분 안에 끝나야 한다. 그 사이에 우리 서버가 죽으면
 * 고객은 인증만 하고 결제는 안 된 상태가 되므로, 승인 실패 시 재고를 반드시 되돌려야 한다.
 */

/** mkey는 절대 브라우저로 나가면 안 된다. 해시 생성은 서버에서만 한다. */
export interface KorpayConfig {
  merchantId: string;
  mkey: string;
  /** 예: https://payments.korpay.com/v1 */
  baseUrl: string;
}

export interface KorpayCheckoutParams {
  merchantId: string;
  productName: string;
  orderNumber: string;
  amount: string;
  payMethod: 'card';
  returnUrl: string;
  ediDate: string;
  hashKey: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerPost?: string;
  language: 'ko';
}

/** 코페이가 returnUrl로 보내는 인증 결과(x-www-form-urlencoded). */
export interface KorpayAuthResult {
  resultCode: string;
  message?: string;
  paymentKey?: string;
  merchantId?: string;
  orderNumber?: string;
  amount?: string;
  reserved?: string;
}

export interface KorpayApproval {
  resultCode: string;
  message?: string;
  tid?: string;
  merchantId?: string;
  orderNumber?: string;
  productName?: string;
  currency?: string;
  amount?: number;
  approvedAt?: string;
  payMethod?: string;
  reserved?: string | null;
  card?: {
    cardNumber?: string;
    approvalCode?: string;
    installment?: string;
    approvalNumber?: string;
    usePointAmt?: string;
    remainPointAmt?: string;
  };
}

export class KorpayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cancelledByUser = false,
  ) {
    super(message);
    this.name = 'KorpayError';
  }
}

/** yyyyMMddHHmmss. 코페이는 한국 시간 기준 전문 일시를 기대한다. */
export function korpayEdiDate(now = new Date()): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    String(seoul.getUTCFullYear()) +
    pad(seoul.getUTCMonth() + 1) +
    pad(seoul.getUTCDate()) +
    pad(seoul.getUTCHours()) +
    pad(seoul.getUTCMinutes()) +
    pad(seoul.getUTCSeconds())
  );
}

/** (merchantId + ediDate + amount + mkey)의 SHA-256. 가이드 2.1 하단. */
export function korpayHashKey(input: { merchantId: string; ediDate: string; amount: string; mkey: string }): string {
  return createHash('sha256')
    .update(`${input.merchantId}${input.ediDate}${input.amount}${input.mkey}`, 'utf8')
    .digest('hex');
}

/**
 * 주문번호는 영문과 숫자만 허용된다(가이드 2.1).
 * 예전 형식이 CC-20260828-A1B2C3이라 하이픈 때문에 그대로 보내면 거절된다.
 */
export function toKorpayOrderNumber(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length === 0) throw new KorpayError('E001', '주문번호를 만들지 못했습니다.');
  return cleaned.slice(0, 40);
}

/**
 * 상품명에 쓸 수 없는 문자를 걸러낸다.
 * 허용: 한글/영문/숫자/공백과 - _ ( ) [ ] , . & + /
 * 걸러내지 않으면 결제창 호출 자체가 E001로 떨어진다.
 */
export function toKorpayProductName(raw: string): string {
  const cleaned = raw.replace(/[^\w\sㄱ-ㅎ가-힣\-_()[\],.&+/]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '상품').slice(0, 50);
}

export class KorpayPaymentProvider {
  constructor(private readonly config: KorpayConfig) {}

  /** 결제창에 넘길 파라미터. hashKey는 서명이라 브라우저로 나가도 되지만 mkey는 안 된다. */
  buildCheckoutParams(input: {
    orderNumber: string;
    productName: string;
    amount: number;
    returnUrl: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerPost?: string;
    now?: Date;
  }): KorpayCheckoutParams {
    const ediDate = korpayEdiDate(input.now);
    const amount = String(Math.trunc(input.amount));
    return {
      merchantId: this.config.merchantId,
      productName: toKorpayProductName(input.productName),
      orderNumber: toKorpayOrderNumber(input.orderNumber),
      amount,
      payMethod: 'card',
      returnUrl: input.returnUrl,
      ediDate,
      hashKey: korpayHashKey({ merchantId: this.config.merchantId, ediDate, amount, mkey: this.config.mkey }),
      customerName: input.customerName ? toKorpayProductName(input.customerName).slice(0, 30) : undefined,
      customerEmail: input.customerEmail?.slice(0, 60),
      // 전화번호는 숫자만 받는다.
      customerPhone: input.customerPhone?.replace(/\D/g, '').slice(0, 20),
      customerAddress: input.customerAddress ? toKorpayProductName(input.customerAddress).slice(0, 100) : undefined,
      customerPost: input.customerPost?.replace(/\D/g, '').slice(0, 6),
      language: 'ko',
    };
  }

  /**
   * 승인 요청. 이 호출이 성공해야 실제로 결제가 된다.
   * 인증만 끝난 상태에서 이걸 안 부르면 고객 돈은 안 빠지고 주문만 남는다.
   */
  async confirm(paymentKey: string, options?: { timeoutMs?: number }): Promise<KorpayApproval> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/payments/confirm?paymentKey=${encodeURIComponent(paymentKey)}`;
    const controller = new AbortController();
    // 세션 유효시간이 10분이라 무한정 기다리면 안 된다.
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, signal: controller.signal });
    } catch (error) {
      throw new KorpayError('EB001', `결제사에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload: KorpayApproval;
    try {
      payload = JSON.parse(text) as KorpayApproval;
    } catch {
      throw new KorpayError('E010', `결제사 응답을 해석하지 못했습니다. (HTTP ${response.status}) ${text.slice(0, 200)}`);
    }

    if (payload.resultCode !== KORPAY_PAYMENT_SUCCESS) {
      throw new KorpayError(
        payload.resultCode,
        describeKorpayCode(payload.resultCode, payload.message),
        isUserCancellation(payload.resultCode),
      );
    }
    return payload;
  }
}

export function korpayIssuerName(approvalCode: string | undefined): string | undefined {
  return approvalCode ? KORPAY_CARD_ISSUERS[approvalCode] : undefined;
}

export { describeKorpayCode, isUserCancellation, KORPAY_CARD_ISSUERS } from './korpay-codes';
export { KORPAY_PAYMENT_SUCCESS, KORPAY_USER_CANCELLED, KORPAY_AUTH_SUCCESS } from './korpay-codes';
