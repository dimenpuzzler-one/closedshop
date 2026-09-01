import Link from 'next/link';
import { formatWon } from '@closed-commerce/config';
import { Badge, Card, Price, StatCard } from '@closed-commerce/ui';
import { loadAdminOrders, loadAdminSummary, loadDashboardMetrics } from '@/lib/admin-data';
import { isRealOrder } from '@/lib/order-status';

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', payment_pending: '결제대기', paid: '결제완료', preparing: '준비중',
  shipped: '출고', delivered: '배송완료', cancel_requested: '취소요청', cancelled: '취소',
  refund_requested: '환불요청', partially_refunded: '부분환불', refunded: '환불',
};

export default async function AdminDashboardPage() {
  const [summary, metrics, orderResult] = await Promise.all([
    loadAdminSummary(),
    loadDashboardMetrics(),
    loadAdminOrders(),
  ]);

  // 결제창만 열어보고 나간 주문과 취소된 주문은 여기 보여줄 이유가 없다.
  // 대시보드는 "실제로 팔린 것"을 보는 화면이다.
  const recentOrders = orderResult.orders.filter((order) => isRealOrder(order.status));

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>운영 대시보드</h1>
          <p className="muted">오늘 팔린 것, 보내야 할 것, 정산할 것을 한 화면에서 확인합니다.</p>
        </div>
        <span className={`badge ${metrics.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{metrics.source}</span>
      </div>

      <div className="admin-grid-4">
        <StatCard label="오늘 주문" value={`${metrics.todayOrders}건`} detail="한국 시간 기준" />
        <StatCard label="오늘 매출" value={formatWon(metrics.todaySales)} detail="취소·환불 제외" tone="accent" />
        <StatCard
          label="미출고"
          value={`${metrics.unshippedOrders}건`}
          detail={metrics.unshippedOrders > 0 ? '결제됐지만 아직 안 보냄' : '밀린 주문 없음'}
          tone={metrics.unshippedOrders > 0 ? 'accent' : 'success'}
        />
        <StatCard label="정산 예정" value={formatWon(metrics.payableCommission)} detail={`확정 대기 ${formatWon(metrics.pendingCommission)}`} tone="success" />
      </div>

      <div className="admin-grid-2">
        <Card>
          <div className="toolbar"><h2>상품별 판매량</h2><Link className="button button-ghost" href="/products">상품 관리</Link></div>
          {metrics.topProducts.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>상품</th><th>수량</th><th>매출</th></tr></thead>
                <tbody>
                  {metrics.topProducts.map((product) => (
                    <tr key={product.name}>
                      <td>{product.name}</td>
                      <td>{product.quantity}개</td>
                      <td><Price amount={product.sales} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">아직 판매된 상품이 없습니다.</p>
          )}
        </Card>

        <Card>
          <div className="toolbar"><h2>추천 코드별 매출</h2><Link className="button button-ghost" href="/referrals">Referral 관리</Link></div>
          {metrics.topReferrals.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>용도 / 코드</th><th>주문</th><th>매출</th></tr></thead>
                <tbody>
                  {metrics.topReferrals.map((referral) => (
                    <tr key={referral.code}>
                      <td>
                        <strong>{referral.label ?? referral.code}</strong>
                        {referral.label ? <><br /><span className="muted">{referral.code}</span></> : null}
                      </td>
                      <td>{referral.orders}건</td>
                      <td><Price amount={referral.sales} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">아직 추천을 통한 주문이 없습니다.</p>
          )}
        </Card>
      </div>

      <div className="admin-grid-2">
        <Card>
          <div className="toolbar"><h2>최근 주문</h2><Link className="button button-ghost" href="/orders">전체 보기</Link></div>
          {recentOrders.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>주문번호</th><th>구매자</th><th>금액</th><th>상태</th></tr></thead>
                <tbody>
                  {recentOrders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td>{order.number}</td>
                      <td>{order.buyer}</td>
                      <td><Price amount={order.amount} /></td>
                      <td>
                        <Badge tone={order.status === 'paid' || order.status === 'delivered' ? 'success' : 'warning'}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">아직 결제까지 끝난 주문이 없습니다.</p>
          )}
        </Card>

        <Card>
          <div className="toolbar"><h2>회원·문의</h2><Link className="button button-ghost" href="/members">회원 관리</Link></div>
          <div className="admin-grid-2">
            <StatCard label="활성 회원" value={`${summary.members}명`} detail="profiles 기준" />
            <StatCard label="B2B 문의" value={`${summary.leads}건`} detail="종료 제외" />
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            누적 매출 {formatWon(summary.sales)} · 결제완료 기준입니다.
          </p>
        </Card>
      </div>

      {metrics.source === 'unavailable' ? (
        <div className="admin-section admin-note">
          Supabase 환경변수(`NEXT_PUBLIC_SUPABASE_URL`, publishable key, 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`)와 migration 적용이 필요합니다.
        </div>
      ) : (
        <div className="admin-section admin-note">
          추천 수수료율은 주문 시점에 snapshot됩니다. 현재 기본값은 1단계 8%, 2단계 3%입니다.
          &ldquo;정산 예정&rdquo;은 승인·지급대기 상태의 합계이고, &ldquo;확정 대기&rdquo;는 아직 반품 가능성이 남아 승인되지 않은 금액입니다.
        </div>
      )}
    </>
  );
}
