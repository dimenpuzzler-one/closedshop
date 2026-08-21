import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceRoleSupabaseClient, hasServiceRoleEnv } from '@closed-commerce/db';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { MockPaymentProvider } from '@closed-commerce/payment';

/** 길이 차이로도 정보가 새지 않도록 상수시간 비교를 쓴다. */
function secretMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 이미 종료된 주문은 결제완료로 되돌리지 않는다. 리플레이/오발송 방어. */
const REPLAYABLE_STATUSES = new Set(['pending', 'payment_pending', 'paid']);

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !secretMatches(secret, request.headers.get('x-payment-webhook-secret'))) {
      return NextResponse.json({ error: '인증되지 않은 webhook입니다.', requestId }, { status: 401 });
    }
    if (!hasServiceRoleEnv()) {
      return NextResponse.json({ error: '서버의 Supabase service role 설정이 필요합니다.', requestId }, { status: 503 });
    }

    const body = (await request.json()) as { orderId?: string; paymentId?: string; amount?: number };
    if (!body.orderId || !body.paymentId || typeof body.amount !== 'number') {
      return NextResponse.json({ error: 'webhook payload가 올바르지 않습니다.', requestId }, { status: 400 });
    }

    const client = createServiceRoleSupabaseClient();
    const { data: order, error: orderError } = await client
      .from('orders')
      .select('id, paid_amount, status')
      .eq('id', body.orderId)
      .maybeSingle();
    if (orderError) {
      logServerError('web.payments.webhook', requestId, orderError, { stage: 'order_read', orderId: body.orderId });
      return NextResponse.json({ error: '주문을 조회하지 못했습니다.', requestId }, { status: 500 });
    }
    if (!order || order.paid_amount !== body.amount) {
      return NextResponse.json({ error: '주문과 결제 금액이 일치하지 않습니다.', requestId }, { status: 400 });
    }
    if (!REPLAYABLE_STATUSES.has(order.status)) {
      // 취소/환불된 주문에 뒤늦게 도착한 webhook이 상태를 paid로 되돌리던 경로를 막는다.
      logServerEvent('web.payments.webhook', requestId, { stage: 'ignored', orderId: order.id, status: order.status });
      return NextResponse.json({ received: true, ignored: true, reason: `주문이 ${order.status} 상태입니다.`, requestId });
    }

    const verified = await new MockPaymentProvider().verifyPayment({ paymentId: body.paymentId, orderId: body.orderId, amount: body.amount });
    const { error: paymentError } = await client.from('payments').upsert({
      order_id: body.orderId,
      provider: 'mock',
      provider_payment_id: verified.paymentId,
      status: 'paid',
      amount: verified.amount,
      paid_at: verified.paidAt,
      raw_payload: verified,
    });
    if (paymentError) {
      logServerError('web.payments.webhook', requestId, paymentError, { stage: 'payment_upsert', orderId: body.orderId });
      return NextResponse.json({ error: '결제 정보를 저장하지 못했습니다.', requestId }, { status: 500 });
    }

    const { error: updateError } = await client.from('orders').update({ status: 'paid', paid_at: verified.paidAt }).eq('id', body.orderId);
    if (updateError) {
      logServerError('web.payments.webhook', requestId, updateError, { stage: 'order_update', orderId: body.orderId });
      return NextResponse.json({ error: '주문 상태를 갱신하지 못했습니다.', requestId }, { status: 500 });
    }

    logServerEvent('web.payments.webhook', requestId, { stage: 'done', orderId: body.orderId });
    return NextResponse.json({ received: true, requestId });
  } catch (error) {
    logServerError('web.payments.webhook', requestId, error, { stage: 'unhandled' });
    return NextResponse.json({ error: 'webhook을 처리하지 못했습니다.', requestId }, { status: 500 });
  }
}
