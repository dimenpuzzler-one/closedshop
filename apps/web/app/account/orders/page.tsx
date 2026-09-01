import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Container, Badge, Price } from '@closed-commerce/ui';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { getRequestUser } from '@/lib/supabase-server';
import { loadMemberDisplayName, loadMemberOrders } from '@/lib/account-data';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  pending: '주문대기',
  payment_pending: '결제대기',
  paid: '결제완료',
  preparing: '상품준비',
  shipped: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
  refunded: '환불완료',
  refund_requested: '환불요청',
};

export default async function OrdersPage() {
  if (hasSupabaseEnv() && !(await getRequestUser())) redirect('/login');

  const [result, displayName] = await Promise.all([loadMemberOrders(), loadMemberDisplayName()]);
  return (
    <>
      <section className="page-header">
        <Container>
          <div className="page-header-row">
            <div>
              <p className="breadcrumb">ACCOUNT / ORDERS</p>
              <h1>주문 조회</h1>
              <p className="muted">{displayName ? `${displayName}님의 주문 기록입니다.` : '회원님의 주문 기록입니다.'}</p>
            </div>
            <Link href="/cart" className="button button-ghost">장바구니 보기</Link>
          </div>
        </Container>
      </section>
      <section className="section">
        <Container>
          {result === null ? (
            <div className="card table-wrap">
              <table className="data-table">
                <thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th>금액</th><th>상태</th></tr></thead>
                <tbody><tr><td>CC-20260819-001</td><td>2026.08.19</td><td>한우 육포 선물세트 420g 외 1</td><td><Price amount={104000} /></td><td><Badge tone="success">결제완료</Badge></td></tr></tbody>
              </table>
            </div>
          ) : result.orders.length === 0 ? (
            <div className="card empty"><h3>주문 내역이 없습니다.</h3><p className="muted">로그인했거나 주문이 생성된 계정인지 확인해 주세요.</p></div>
          ) : (
            <div className="card table-wrap">
              <table className="data-table">
                <thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th>금액</th><th>상태</th></tr></thead>
                <tbody>
                  {result.orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{new Date(order.createdAt).toLocaleDateString('ko-KR')}</td>
                      <td>{order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || '상품 정보 없음'}</td>
                      <td><Price amount={order.paidAmount} /></td>
                      <td><Badge tone={order.status === 'delivered' ? 'success' : 'warning'}>{statusLabel[order.status] ?? order.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
