import { NextResponse } from 'next/server';
import {
  isPayDataKrCancellation,
  payDataKrResultCode,
  payDataKrResultMessage,
  PAYDATAKR_SUCCESS,
  type PayDataKrPaymentResult,
} from '@closed-commerce/payment';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { cancelPendingOrder, finalizePayDataKrOrder, OrderServiceError } from '@/lib/order-service';

/** 한국결제데이터가 결제 결과를 고객 브라우저로 POST하는 주소. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  const redirectTo = (params: Record<string, string>) => {
    const url = new URL('/checkout/result', origin);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    // PG가 POST로 들어오므로 결과 페이지는 GET으로 연다.
    return NextResponse.redirect(url, 303);
  };

  try {
    const form = await request.formData();
    const result: PayDataKrPaymentResult = {};
    form.forEach((value, key) => {
      if (typeof value === 'string') result[key] = value;
    });
    const resultCode = payDataKrResultCode(result);
    const orderNumber = result.trackId?.trim() ?? '';
    const message = payDataKrResultMessage(result);
    logServerEvent('payment.paydatakr.return', requestId, {
      stage: 'received',
      resultCode,
      orderNumber,
      transactionId: result.transactionId,
    });

    if (isPayDataKrCancellation(resultCode)) {
      if (orderNumber) await cancelPendingOrder(orderNumber, '고객 취소', requestId);
      return redirectTo({ status: 'cancelled', message: '결제를 취소하셨습니다.', requestId });
    }
    if (resultCode !== PAYDATAKR_SUCCESS) {
      if (orderNumber) await cancelPendingOrder(orderNumber, `결제 실패 ${resultCode}`, requestId);
      return redirectTo({
        status: 'failed',
        message: message || '결제가 승인되지 않았습니다.',
        code: resultCode,
        requestId,
      });
    }

    const finalized = await finalizePayDataKrOrder({ result, source: 'return' }, requestId);
    return redirectTo({ status: 'paid', orderNumber: finalized.orderNumber, requestId });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      logServerError('payment.paydatakr.return', requestId, error, { stage: 'finalize', status: error.status });
      return redirectTo({ status: 'failed', message: error.message, requestId });
    }
    logServerError('payment.paydatakr.return', requestId, error, { stage: 'unhandled' });
    return redirectTo({
      status: 'failed',
      message: '결제 결과를 처리하지 못했습니다. 결제가 되었다면 고객센터로 문의해 주세요.',
      requestId,
    });
  }
}
export function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL('/checkout/result?status=unknown', origin), 303);
}
