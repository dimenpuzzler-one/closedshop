import {
  isPayDataKrCancellation,
  payDataKrResultCode,
  payDataKrResultMessage,
  PAYDATAKR_SUCCESS,
  type PayDataKrPaymentResult,
} from '@closed-commerce/payment';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { cancelPendingOrder, finalizePayDataKrOrder } from '@/lib/order-service';

function acknowledgement(result: '0000' | '9999'): Response {
  return new Response(`result=${result}`, {
    status: result === '0000' ? 200 : 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
/** 한국결제데이터가 결제 결과를 JSON으로 통지하는 주소. 문서 규격상 재통보는 없다. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return acknowledgement('9999');
    const result = body as PayDataKrPaymentResult;
    const resultCode = payDataKrResultCode(result);
    const orderNumber = result.trackId?.trim() ?? '';
    logServerEvent('payment.paydatakr.webhook', requestId, {
      stage: 'received',
      resultCode,
      orderNumber,
      transactionId: result.transactionId,
    });

    if (isPayDataKrCancellation(resultCode) || resultCode !== PAYDATAKR_SUCCESS) {
      if (orderNumber) await cancelPendingOrder(orderNumber, `결제 실패 ${resultCode}: ${payDataKrResultMessage(result)}`, requestId);
      return acknowledgement('0000');
    }

    await finalizePayDataKrOrder({ result, source: 'webhook' }, requestId);
    return acknowledgement('0000');
  } catch (error) {
    logServerError('payment.paydatakr.webhook', requestId, error, { stage: 'unhandled' });
    return acknowledgement('9999');
  }
}
