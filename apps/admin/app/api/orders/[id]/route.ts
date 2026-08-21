import { NextResponse } from 'next/server';
import { orderUpdateSchema } from '@closed-commerce/validation';
import { logServerError } from '@closed-commerce/observability';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

export const PATCH = withAdminParams<{ id: string }>(
  'admin.orders.update',
  async ({ requestId, client, userId }, request, { id }) => {
    const parsed = orderUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, '주문 상태가 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());

    const { data: before, error: readError } = await client.from('orders').select('id, status, order_number').eq('id', id).maybeSingle();
    if (readError) failFromSupabase('주문을 조회하지 못했습니다.', readError, 'order_read_failed');
    if (!before) throw new ApiError(404, `주문을 찾을 수 없습니다: ${id}`, 'order_not_found');

    const now = new Date().toISOString();
    const orderUpdate: { status: string; shipped_at?: string; delivered_at?: string; cancelled_at?: string; refunded_at?: string } = {
      status: parsed.data.status,
    };
    if (parsed.data.status === 'shipped') orderUpdate.shipped_at = now;
    if (parsed.data.status === 'delivered') orderUpdate.delivered_at = now;
    if (parsed.data.status === 'cancelled') orderUpdate.cancelled_at = now;
    if (parsed.data.status === 'refunded') orderUpdate.refunded_at = now;

    const { error: updateError } = await client.from('orders').update(orderUpdate).eq('id', id);
    if (updateError) failFromSupabase('주문 상태를 변경하지 못했습니다.', updateError, 'order_update_failed');

    if (parsed.data.shippingCompany || parsed.data.trackingNumber || parsed.data.status === 'shipped' || parsed.data.status === 'delivered') {
      const { error: shipmentError } = await client.from('shipments').upsert({
        order_id: id,
        shipping_company: parsed.data.shippingCompany ?? null,
        tracking_number: parsed.data.trackingNumber ?? null,
        status: parsed.data.status === 'delivered' ? 'delivered' : 'shipped',
        shipped_at: parsed.data.status === 'shipped' ? now : null,
        delivered_at: parsed.data.status === 'delivered' ? now : null,
      });
      // 주문 상태는 이미 바뀌었으므로 여기서 실패해도 요청 전체를 되돌리지 않는다. 다만 조용히 넘기지도 않는다.
      if (shipmentError) logServerError('admin.orders.update', requestId, shipmentError, { stage: 'shipment_upsert', orderId: id });
    }

    const wasClosed = before.status === 'cancelled' || before.status === 'refunded';
    const isClosing = parsed.data.status === 'cancelled' || parsed.data.status === 'refunded';

    if (isClosing) {
      const { error: commissionError } = await client
        .from('commissions')
        .update({ status: 'reversed' })
        .eq('order_id', id)
        .in('status', ['pending', 'approved', 'payable']);
      if (commissionError) logServerError('admin.orders.update', requestId, commissionError, { stage: 'commission_reverse', orderId: id });
    }

    if (isClosing && !wasClosed) {
      const { data: items, error: itemsError } = await client.from('order_items').select('product_id, quantity').eq('order_id', id);
      if (itemsError) logServerError('admin.orders.update', requestId, itemsError, { stage: 'items_read', orderId: id });
      const results = await Promise.all(
        (items ?? []).map((item) => client.rpc('release_inventory', { p_product_id: item.product_id, p_quantity: item.quantity })),
      );
      // 예전에는 결과를 버려서 재고가 안 풀려도 아무도 몰랐다.
      results.forEach((result, index) => {
        if (result.error) {
          logServerError('admin.orders.update', requestId, result.error, { stage: 'release_inventory', orderId: id, itemIndex: index });
        }
      });
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'order_status_changed',
      entity_type: 'order',
      entity_id: id,
      before_data: before,
      after_data: { ...orderUpdate, order_number: before.order_number, requestId },
    });
    return NextResponse.json({ message: `주문 상태가 ${parsed.data.status}로 변경되었습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '관리자 상태 변경이 처리되었습니다.' }) },
);
