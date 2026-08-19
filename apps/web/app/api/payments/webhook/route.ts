import { NextResponse } from 'next/server';
import { hasServiceRoleEnv } from '@closed-commerce/db';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { createServiceRoleSupabaseClient } from '@closed-commerce/db';

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-payment-webhook-secret') !== secret) return NextResponse.json({ error: '인증되지 않은 webhook입니다.' }, { status: 401 });
  if (!hasServiceRoleEnv()) return NextResponse.json({ error: '서버의 Supabase service role 설정이 필요합니다.' }, { status: 503 });
  const body = await request.json() as { orderId?: string; paymentId?: string; amount?: number };
  if (!body.orderId || !body.paymentId || typeof body.amount !== 'number') return NextResponse.json({ error: 'webhook payload가 올바르지 않습니다.' }, { status: 400 });
  const client = createServiceRoleSupabaseClient();
  const { data: order } = await client.from('orders').select('id, paid_amount').eq('id', body.orderId).maybeSingle();
  if (!order || order.paid_amount !== body.amount) return NextResponse.json({ error: '주문과 결제 금액이 일치하지 않습니다.' }, { status: 400 });
  const verified = await new MockPaymentProvider().verifyPayment({ paymentId: body.paymentId, orderId: body.orderId, amount: body.amount });
  await client.from('payments').upsert({ order_id: body.orderId, provider: 'mock', provider_payment_id: verified.paymentId, status: 'paid', amount: verified.amount, paid_at: verified.paidAt, raw_payload: verified });
  await client.from('orders').update({ status: 'paid', paid_at: verified.paidAt }).eq('id', body.orderId);
  return NextResponse.json({ received: true });
}
