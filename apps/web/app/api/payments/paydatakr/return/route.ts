import { NextResponse } from 'next/server';
import {
  isPayDataKrCancellation,
  normalizePayDataKrResult,
  payDataKrResultCode,
  payDataKrResultMessage,
  PAYDATAKR_SUCCESS,
} from '@closed-commerce/payment';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { finalizePayDataKrOrder, OrderServiceError } from '@/lib/order-service';

/** 한국결제데이터 SDK callback(JSON)과 구형 returnUrl(form POST)을 모두 받는다. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const jsonMode = new URL(request.url).searchParams.get('mode') === 'json';
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  const redirectTo = (params: Record<string, string>) => {
    const url = new URL('/checkout/result', origin);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return NextResponse.redirect(url, 303);
  };
  const jsonResponse = (body: Record<string, string>, status = 200) =>
    NextResponse.json({ ...body, requestId }, { status });

  try {
    let raw: unknown;
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      raw = await request.json();
    } else {
      const form = await request.formData();
      const values: Record<string, string> = {};
      form.forEach((value, key) => {
        if (typeof value === 'string') values[key] = value;
      });
      raw = values;
    }

    const result = normalizePayDataKrResult(raw);
    const resultCode = payDataKrResultCode(result);
    const orderNumber = typeof result.trackId === 'string' ? result.trackId.trim() : '';
    const message = payDataKrResultMessage(result);
    logServerEvent('payment.paydatakr.return', requestId, {
      stage: 'received',
      resultCode,
      orderNumber,
      transactionId: result.transactionId,
    });

    // 인증되지 않은 실패 통보로 재고를 해제하지 않는다. 미완료 주문은 만료 작업에서 정리한다.
    if (isPayDataKrCancellation(resultCode)) {
      return jsonMode
        ? jsonResponse({ status: 'cancelled', message: '결제를 취소하셨습니다.' })
        : redirectTo({ status: 'cancelled', message: '결제를 취소하셨습니다.', requestId });
    }
    if (resultCode !== PAYDATAKR_SUCCESS) {
      const failure = {
        status: 'failed',
        message: message || '결제가 승인되지 않았습니다.',
        code: resultCode,
      };
      return jsonMode ? jsonResponse(failure) : redirectTo({ ...failure, requestId });
    }

    const finalized = await finalizePayDataKrOrder({ result: raw, source: 'return' }, requestId);
    return jsonMode
      ? jsonResponse({ status: 'paid', orderNumber: finalized.orderNumber })
      : redirectTo({ status: 'paid', orderNumber: finalized.orderNumber, requestId });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      logServerError('payment.paydatakr.return', requestId, error, { stage: 'finalize', status: error.status });
      return jsonMode
        ? jsonResponse({ status: error.status === 409 ? 'processing' : 'failed', message: error.message }, error.status)
        : redirectTo({ status: error.status === 409 ? 'processing' : 'failed', message: error.message, requestId });
    }
    logServerError('payment.paydatakr.return', requestId, error, { stage: 'unhandled' });
    const failure = {
      status: 'failed',
      message: '결제 결과를 처리하지 못했습니다. 결제가 되었다면 고객센터로 문의해 주세요.',
    };
    return jsonMode ? jsonResponse(failure, 500) : redirectTo({ ...failure, requestId });
  }
}

export function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL('/checkout/result?status=unknown', origin), 303);
}
