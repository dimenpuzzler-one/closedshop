import { NextResponse } from 'next/server';
import { describeKorpayCode, isUserCancellation, KORPAY_AUTH_SUCCESS } from '@closed-commerce/payment';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { cancelPendingOrder, finalizeKorpayOrder, OrderServiceError } from '@/lib/order-service';

/**
 * 코페이가 카드 인증을 마치고 고객 브라우저를 통해 POST하는 주소.
 *
 * 이 요청은 고객 브라우저에서 오므로 값을 그대로 믿으면 안 된다. 금액도 주문번호도
 * 위조될 수 있다. 그래서 여기서는 주문번호로 우리 DB의 주문을 찾고, 저장된 금액을
 * 기준으로 승인을 요청한다.
 *
 * 인증 후 10분 안에 승인 API를 불러야 하므로 여기서 오래 끌면 안 된다.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;

  const redirectTo = (params: Record<string, string>) => {
    const url = new URL('/checkout/result', origin);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    // 브라우저가 POST로 왔으므로 303으로 보내야 결과 페이지가 GET으로 열린다.
    return NextResponse.redirect(url, 303);
  };

  try {
    const form = await request.formData();
    const value = (key: string) => {
      const raw = form.get(key);
      return typeof raw === 'string' ? raw : undefined;
    };

    const resultCode = value('resultCode') ?? '';
    const orderNumber = value('orderNumber') ?? '';
    const paymentKey = value('paymentKey') ?? '';
    const amount = value('amount');
    const message = value('message');

    logServerEvent('payment.korpay.return', requestId, { resultCode, orderNumber, hasPaymentKey: Boolean(paymentKey) });

    // 고객이 결제창에서 직접 취소한 경우. 오류가 아니라 정상적인 이탈이다.
    if (isUserCancellation(resultCode)) {
      if (orderNumber) await cancelPendingOrder(orderNumber, '고객 취소', requestId);
      return redirectTo({ status: 'cancelled', message: '결제를 취소하셨습니다.', requestId });
    }

    if (resultCode !== KORPAY_AUTH_SUCCESS) {
      const description = describeKorpayCode(resultCode, message);
      logServerError('payment.korpay.return', requestId, new Error(`auth failed: ${resultCode}`), { orderNumber, resultCode });
      if (orderNumber) await cancelPendingOrder(orderNumber, `인증 실패 ${resultCode}`, requestId);
      return redirectTo({ status: 'failed', message: description, code: resultCode, requestId });
    }

    if (!orderNumber || !paymentKey) {
      logServerError('payment.korpay.return', requestId, new Error('missing orderNumber or paymentKey'), { orderNumber, resultCode });
      if (orderNumber) await cancelPendingOrder(orderNumber, '결제 정보 누락', requestId);
      return redirectTo({ status: 'failed', message: '결제 정보가 올바르지 않습니다. 결제가 되었다면 고객센터로 문의해 주세요.', requestId });
    }

    const result = await finalizeKorpayOrder({ orderNumber, paymentKey, amount }, requestId);
    return redirectTo({ status: 'paid', orderNumber: result.orderNumber, requestId });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      logServerError('payment.korpay.return', requestId, error, { stage: 'finalize', status: error.status });
      return redirectTo({ status: 'failed', message: error.message, requestId });
    }
    logServerError('payment.korpay.return', requestId, error, { stage: 'unhandled' });
    return redirectTo({
      status: 'failed',
      message: '결제 결과를 처리하지 못했습니다. 결제가 되었다면 고객센터로 문의해 주세요.',
      requestId,
    });
  }
}

/** 고객이 결과 주소를 새로고침하면 GET으로 들어온다. 결과 화면으로만 보낸다. */
export function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL('/checkout/result?status=unknown', origin), 303);
}
