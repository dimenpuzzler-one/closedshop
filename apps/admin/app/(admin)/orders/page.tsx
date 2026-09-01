import { loadAdminOrders } from '@/lib/admin-data';
import { OrdersTable } from '@/components/orders-table';

export default async function AdminOrdersPage() {
  const result = await loadAdminOrders();
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">COMMERCE</p>
          <h1>주문 관리</h1>
          <p className="muted">결제·배송·환불 상태와 배송지를 함께 확인하고, 엑셀로 내려받습니다.</p>
        </div>
        <span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span>
      </div>

      {result.source === 'unavailable' ? (
        <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 주문이 표시됩니다.</div>
      ) : null}

      <OrdersTable orders={result.orders} />

      <div className="admin-section admin-note">
        환불이 발생하면 관련 Commission을 `reversed`로 전환하고, 주문 당시의 commission_base는 변경하지 않습니다.
        주문 자체는 지우지 않습니다. 정산·감사 기록이 주문에 걸려 있어서, 지우면 매출과 수수료 내역이 어긋납니다.
      </div>
    </>
  );
}
