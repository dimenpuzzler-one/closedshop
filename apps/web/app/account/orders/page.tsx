import { Container, Badge, Price } from '@closed-commerce/ui';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function loadOrders() {
  if (!hasSupabaseEnv()) return null;
  const client = await createServerAppClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return [];
  const { data: orders, error } = await client.from('orders').select('id, order_number, status, paid_amount, created_at').eq('buyer_user_id', auth.user.id).order('created_at', { ascending: false });
  if (error || !orders) return [];
  const { data: items } = orders.length ? await client.from('order_items').select('order_id, product_name_snapshot, quantity').in('order_id', orders.map((order) => order.id)) : { data: [] };
  return orders.map((order) => ({ ...order, items: (items ?? []).filter((item) => item.order_id === order.id) }));
}

const statusLabel: Record<string, string> = { pending: '주문대기', payment_pending: '결제대기', paid: '결제완료', preparing: '상품준비', shipped: '배송중', delivered: '배송완료', cancelled: '취소', refunded: '환불완료', refund_requested: '환불요청' };

export default async function OrdersPage() {
  const orders = await loadOrders();
  return <><section className="page-header"><Container><p className="breadcrumb">ACCOUNT / ORDERS</p><h1>주문 조회</h1><p className="muted">로그인한 회원의 주문·배송 상태를 확인합니다.</p></Container></section><section className="section"><Container>{orders === null ? <div className="card table-wrap"><table className="data-table"><thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th>금액</th><th>상태</th></tr></thead><tbody><tr><td>CC-20260819-001</td><td>2026.08.19</td><td>한우 육포 선물세트 420g 외 1</td><td><Price amount={104000} /></td><td><Badge tone="success">결제완료</Badge></td></tr></tbody></table></div> : orders.length === 0 ? <div className="card empty"><h3>주문 내역이 없습니다.</h3><p className="muted">로그인했거나 주문이 생성된 계정인지 확인해 주세요.</p></div> : <div className="card table-wrap"><table className="data-table"><thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th>금액</th><th>상태</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{new Date(order.created_at).toLocaleDateString('ko-KR')}</td><td>{order.items.map((item) => `${item.product_name_snapshot} × ${item.quantity}`).join(', ')}</td><td><Price amount={order.paid_amount} /></td><td><Badge tone={order.status === 'delivered' ? 'success' : 'warning'}>{statusLabel[order.status] ?? order.status}</Badge></td></tr>)}</tbody></table></div>}</Container></section></>;
}
