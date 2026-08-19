import { NextResponse } from 'next/server';
import { orderUpdateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = orderUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '주문 상태가 올바르지 않습니다.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 관리자 상태 변경이 처리되었습니다.' });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: before, error: readError } = await context.client.from('orders').select('id, status, order_number').eq('id', id).maybeSingle();
  if (readError || !before) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
  const now = new Date().toISOString();
  const orderUpdate: { status: string; shipped_at?: string; delivered_at?: string; cancelled_at?: string; refunded_at?: string } = { status: parsed.data.status };
  if (parsed.data.status === 'shipped') orderUpdate.shipped_at = now;
  if (parsed.data.status === 'delivered') orderUpdate.delivered_at = now;
  if (parsed.data.status === 'cancelled') orderUpdate.cancelled_at = now;
  if (parsed.data.status === 'refunded') orderUpdate.refunded_at = now;
  const { error: updateError } = await context.client.from('orders').update(orderUpdate).eq('id', id);
  if (updateError) return NextResponse.json({ error: '주문 상태를 변경하지 못했습니다.' }, { status: 500 });
  if (parsed.data.shippingCompany || parsed.data.trackingNumber || parsed.data.status === 'shipped' || parsed.data.status === 'delivered') {
    await context.client.from('shipments').upsert({ order_id: id, shipping_company: parsed.data.shippingCompany ?? null, tracking_number: parsed.data.trackingNumber ?? null, status: parsed.data.status === 'delivered' ? 'delivered' : 'shipped', shipped_at: parsed.data.status === 'shipped' ? now : null, delivered_at: parsed.data.status === 'delivered' ? now : null });
  }
  const shouldReleaseInventory = (parsed.data.status === 'cancelled' || parsed.data.status === 'refunded') && before.status !== 'cancelled' && before.status !== 'refunded';
  if (parsed.data.status === 'cancelled' || parsed.data.status === 'refunded') {
    await context.client.from('commissions').update({ status: 'reversed' }).eq('order_id', id).in('status', ['pending', 'approved', 'payable']);
  }
  if (shouldReleaseInventory) {
    const { data: items } = await context.client.from('order_items').select('product_id, quantity').eq('order_id', id);
    await Promise.all((items ?? []).map((item) => context.client.rpc('release_inventory', { p_product_id: item.product_id, p_quantity: item.quantity })));
  }
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'order_status_changed', entity_type: 'order', entity_id: id, before_data: before, after_data: { ...orderUpdate, order_number: before.order_number } });
  return NextResponse.json({ message: '주문 상태가 변경되었습니다.' });
}
