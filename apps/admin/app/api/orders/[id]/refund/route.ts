import { NextResponse } from 'next/server';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { refundSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = refundSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '환불 금액과 사유를 확인해 주세요.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 환불 처리가 완료되었습니다.' });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const [{ data: order }, { data: payment }, { data: previousRefunds }] = await Promise.all([
    context.client.from('orders').select('id, paid_amount, status').eq('id', id).maybeSingle(),
    context.client.from('payments').select('id, provider_payment_id, amount, status').eq('order_id', id).maybeSingle(),
    context.client.from('refunds').select('amount').eq('order_id', id).in('status', ['requested', 'approved', 'completed']),
  ]);
  if (!order || !payment || !payment.provider_payment_id) return NextResponse.json({ error: '환불 가능한 주문 또는 결제를 찾을 수 없습니다.' }, { status: 404 });
  if (order.status === 'cancelled' || order.status === 'refunded') return NextResponse.json({ error: '이미 취소 또는 전액 환불된 주문입니다.' }, { status: 400 });
  const refundedSoFar = (previousRefunds ?? []).reduce((sum, refund) => sum + refund.amount, 0);
  const remainingAmount = Math.max(0, payment.amount - refundedSoFar);
  if (parsed.data.amount > remainingAmount) return NextResponse.json({ error: `환불 가능 금액은 ${remainingAmount.toLocaleString()}원입니다.` }, { status: 400 });
  const refund = await new MockPaymentProvider().refundPayment({ paymentId: payment.provider_payment_id, amount: parsed.data.amount, reason: parsed.data.reason });
  const { error: refundError } = await context.client.from('refunds').insert({ order_id: id, payment_id: payment.id, amount: refund.refundedAmount, reason: parsed.data.reason, status: 'completed', completed_at: refund.refundedAt });
  if (refundError) return NextResponse.json({ error: '환불 내역을 저장하지 못했습니다.' }, { status: 500 });
  const totalRefunded = refundedSoFar + parsed.data.amount;
  const nextOrderStatus = totalRefunded === payment.amount ? 'refunded' : 'partially_refunded';
  await context.client.from('orders').update({ status: nextOrderStatus, refunded_at: refund.refundedAt }).eq('id', id);
  await context.client.from('payments').update({ status: totalRefunded === payment.amount ? 'refunded' : 'paid', refunded_at: refund.refundedAt }).eq('id', payment.id);
  await context.client.from('commissions').update({ status: 'reversed' }).eq('order_id', id).in('status', ['pending', 'approved', 'payable']);
  if (nextOrderStatus === 'refunded') {
    const { data: items } = await context.client.from('order_items').select('product_id, quantity').eq('order_id', id);
    await Promise.all((items ?? []).map((item) => context.client.rpc('release_inventory', { p_product_id: item.product_id, p_quantity: item.quantity })));
  }
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'order_refunded', entity_type: 'order', entity_id: id, after_data: { amount: refund.refundedAmount, reason: parsed.data.reason } });
  return NextResponse.json({ message: '환불이 처리되었습니다.', refund });
}
