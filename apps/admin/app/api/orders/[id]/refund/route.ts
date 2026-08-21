import { NextResponse } from 'next/server';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { refundSchema } from '@closed-commerce/validation';
import { logServerError } from '@closed-commerce/observability';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

export const POST = withAdminParams<{ id: string }>(
  'admin.orders.refund',
  async ({ requestId, client, userId }, request, { id }) => {
    const parsed = refundSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, '환불 금액과 사유를 확인해 주세요.', 'validation_failed', parsed.error.flatten());

    const [{ data: order, error: orderError }, { data: payment, error: paymentError }, { data: previousRefunds, error: refundsError }] =
      await Promise.all([
        client.from('orders').select('id, paid_amount, status').eq('id', id).maybeSingle(),
        client.from('payments').select('id, provider_payment_id, amount, status').eq('order_id', id).maybeSingle(),
        client.from('refunds').select('amount').eq('order_id', id).in('status', ['requested', 'approved', 'completed']),
      ]);
    if (orderError || paymentError || refundsError) {
      failFromSupabase('환불 대상 정보를 조회하지 못했습니다.', orderError ?? paymentError ?? refundsError, 'refund_read_failed');
    }
    if (!order) throw new ApiError(404, `주문을 찾을 수 없습니다: ${id}`, 'order_not_found');
    if (!payment || !payment.provider_payment_id) throw new ApiError(404, '이 주문에는 환불할 결제 건이 없습니다.', 'payment_not_found');
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new ApiError(400, `이미 ${order.status === 'cancelled' ? '취소' : '전액 환불'}된 주문입니다.`, 'order_already_closed');
    }

    const refundedSoFar = (previousRefunds ?? []).reduce((sum, refund) => sum + refund.amount, 0);
    const remainingAmount = Math.max(0, payment.amount - refundedSoFar);
    if (parsed.data.amount > remainingAmount) {
      throw new ApiError(
        400,
        `환불 가능 금액은 ${remainingAmount.toLocaleString('ko-KR')}원입니다. (결제 ${payment.amount.toLocaleString('ko-KR')}원 / 기환불 ${refundedSoFar.toLocaleString('ko-KR')}원)`,
        'refund_amount_exceeds_remaining',
      );
    }

    const refund = await new MockPaymentProvider().refundPayment({
      paymentId: payment.provider_payment_id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    });

    const { error: refundError } = await client.from('refunds').insert({
      order_id: id,
      payment_id: payment.id,
      amount: refund.refundedAmount,
      reason: parsed.data.reason,
      status: 'completed',
      completed_at: refund.refundedAt,
    });
    if (refundError) failFromSupabase('환불 내역을 저장하지 못했습니다.', refundError, 'refund_insert_failed');

    const totalRefunded = refundedSoFar + parsed.data.amount;
    const isFullRefund = totalRefunded >= payment.amount;
    const nextOrderStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    const { error: orderUpdateError } = await client
      .from('orders')
      .update({ status: nextOrderStatus, refunded_at: refund.refundedAt })
      .eq('id', id);
    if (orderUpdateError) logServerError('admin.orders.refund', requestId, orderUpdateError, { stage: 'order_update', orderId: id });

    const { error: paymentUpdateError } = await client
      .from('payments')
      .update({ status: isFullRefund ? 'refunded' : 'paid', refunded_at: refund.refundedAt })
      .eq('id', payment.id);
    if (paymentUpdateError) logServerError('admin.orders.refund', requestId, paymentUpdateError, { stage: 'payment_update', orderId: id });

    // 부분환불에서도 커미션 전액을 reversed로 돌린다. 기존 동작을 유지하되 의도를 남긴다.
    // 비율 차감으로 바꾸려면 정산 정책 확정이 먼저다.
    const { error: commissionError } = await client
      .from('commissions')
      .update({ status: 'reversed' })
      .eq('order_id', id)
      .in('status', ['pending', 'approved', 'payable']);
    if (commissionError) logServerError('admin.orders.refund', requestId, commissionError, { stage: 'commission_reverse', orderId: id });

    if (isFullRefund) {
      const { data: items } = await client.from('order_items').select('product_id, quantity').eq('order_id', id);
      const results = await Promise.all(
        (items ?? []).map((item) => client.rpc('release_inventory', { p_product_id: item.product_id, p_quantity: item.quantity })),
      );
      results.forEach((result, index) => {
        if (result.error) logServerError('admin.orders.refund', requestId, result.error, { stage: 'release_inventory', orderId: id, itemIndex: index });
      });
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'order_refunded',
      entity_type: 'order',
      entity_id: id,
      after_data: { amount: refund.refundedAmount, reason: parsed.data.reason, nextOrderStatus, requestId },
    });
    return NextResponse.json({ message: `${refund.refundedAmount.toLocaleString('ko-KR')}원 환불이 처리되었습니다.`, refund, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '환불 처리가 완료되었습니다.' }) },
);
