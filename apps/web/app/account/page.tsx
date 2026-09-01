import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Container, Price } from '@closed-commerce/ui';
import { loadMyPageData, type MemberReferral } from '@/lib/account-data';

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

const sourceLabel: Record<MemberReferral['source'], string> = {
  link: '추천 링크',
  manual: '관리자 입력',
  admin: '관리자 등록',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value));
}

function attributionLabel(referral: MemberReferral) {
  const values = [referral.utmSource, referral.utmMedium, referral.utmCampaign].filter(Boolean);
  return values.length ? values.join(' / ') : '추천 코드';
}

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'accent' {
  if (status === 'delivered' || status === 'paid') return 'success';
  if (status === 'cancelled' || status === 'refunded') return 'accent';
  if (status === 'pending' || status === 'payment_pending') return 'warning';
  return 'neutral';
}

export default async function AccountPage() {
  const data = await loadMyPageData();
  if (data.source === 'unauthenticated') redirect('/login');

  return (
    <>
      <section className="page-header">
        <Container>
          <p className="breadcrumb">ACCOUNT / MY PAGE</p>
          <h1>{data.profile.displayName}님의 마이페이지</h1>
          <p className="muted">주문, 장바구니, 배송지와 추천 활동을 한곳에서 관리하세요.</p>
        </Container>
      </section>

      <section className="section account-page">
        <Container className="stack">
          <div className="grid-3">
            <Link href="/account/orders" className="card account-link-card">
              <span className="eyebrow">ORDERS</span>
              <h2>주문 내역</h2>
              <p className="muted">최근 주문 {data.orders.totalCount}건의 결제·배송 상태를 확인합니다.</p>
              <span className="field-hint">주문 조회 →</span>
            </Link>
            <Link href="/cart" className="card account-link-card">
              <span className="eyebrow">CART</span>
              <h2>장바구니</h2>
              <p className="muted">담아둔 상품을 확인하고 배송지 선택 후 결제하세요.</p>
              <span className="field-hint">장바구니 보기 →</span>
            </Link>
            <Link href="/account/addresses" className="card account-link-card">
              <span className="eyebrow">SHIPPING</span>
              <h2>배송지 관리</h2>
              <p className="muted">저장된 배송지 {data.addressCount}곳{data.defaultAddressLabel ? ` · 기본 ${data.defaultAddressLabel}` : ''}</p>
              <span className="field-hint">주소록 관리 →</span>
            </Link>
          </div>

          <div className="two-column">
            <section className="card">
              <div className="section-heading">
                <p className="eyebrow">PROFILE</p>
                <h2>회원 정보</h2>
                <p className="muted">로그인 계정과 현재 추천 활동을 요약합니다.</p>
              </div>
              <dl className="account-profile-list">
                <div><dt>이름</dt><dd>{data.profile.displayName}</dd></div>
                <div><dt>이메일</dt><dd>{data.profile.email || '이메일 정보 없음'}</dd></div>
                <div><dt>추천 회원</dt><dd>{data.referrals.length}명</dd></div>
                <div><dt>저장 배송지</dt><dd>{data.addressCount}곳</dd></div>
              </dl>
            </section>

            <section className="card">
              <div className="section-heading">
                <p className="eyebrow">REFERRAL</p>
                <h2>추천 활동</h2>
                <p className="muted">내 코드로 유입된 회원과 수수료 현황입니다.</p>
              </div>
              <div className="account-metric-grid">
                <div className="account-metric"><span className="field-hint">추천 코드</span><strong>{data.referralCodes.length}개</strong></div>
                <div className="account-metric"><span className="field-hint">직접 추천</span><strong>{data.referrals.length}명</strong></div>
                <div className="account-metric"><span className="field-hint">대기 수수료</span><strong><Price amount={data.commissions.pending} /></strong></div>
                <div className="account-metric"><span className="field-hint">지급 가능</span><strong><Price amount={data.commissions.payable} /></strong></div>
              </div>
              {data.referralCodes.length ? (
                <div className="account-code-list">
                  {data.referralCodes.map((code) => (
                    <div className="account-code-row" key={code.id}>
                      <span><strong>{code.code}</strong>{code.label ? ` · ${code.label}` : ''}</span>
                      <span className="muted">{code.memberCount}명 유입 · {code.status === 'active' ? '사용 중' : code.status}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="field-hint">아직 발급된 추천 코드가 없습니다.</p>}
            </section>
          </div>

          <section className="card">
            <div className="section-heading row">
              <div><p className="eyebrow">RECENT ORDERS</p><h2>최근 주문</h2><p className="muted">최근 5건을 먼저 보여드립니다.</p></div>
              <Link href="/account/orders" className="button button-ghost">전체 주문 보기</Link>
            </div>
            {data.orders.orders.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>주문번호</th><th>주문일</th><th>상품</th><th>금액</th><th>상태</th></tr></thead>
                  <tbody>{data.orders.orders.map((order) => <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || '상품 정보 없음'}</td>
                    <td><Price amount={order.paidAmount} /></td>
                    <td><Badge tone={statusTone(order.status)}>{statusLabel[order.status] ?? order.status}</Badge></td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : <div className="empty"><h3>주문 내역이 없습니다.</h3><p className="muted">상품을 둘러보고 첫 주문을 시작해 보세요.</p></div>}
          </section>

          <section className="card">
            <div className="section-heading row">
              <div><p className="eyebrow">REFERRED MEMBERS</p><h2>내 추천코드로 들어온 회원</h2><p className="muted">직접 추천으로 귀속된 회원만 표시합니다. 유입 경로는 기록된 UTM이 있을 때 함께 보여드립니다.</p></div>
            </div>
            {data.referralNotice ? <p className="notice">{data.referralNotice}</p> : null}
            {data.referrals.length ? (
              <div className="table-wrap account-referral-table">
                <table className="data-table">
                  <thead><tr><th>회원</th><th>추천코드</th><th>유입 경로</th><th>가입일</th></tr></thead>
                  <tbody>{data.referrals.map((referral) => <tr key={referral.id}>
                    <td>{referral.displayName}</td>
                    <td><strong>{referral.referralCode}</strong>{referral.referralLabel ? <><br /><span className="field-hint">{referral.referralLabel}</span></> : null}</td>
                    <td>{sourceLabel[referral.source]}<br /><span className="field-hint">{attributionLabel(referral)}</span></td>
                    <td>{formatDate(referral.joinedAt)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : <div className="empty"><h3>아직 추천으로 가입한 회원이 없습니다.</h3><p className="muted">추천코드를 공유하면 이곳에서 유입 회원과 경로를 확인할 수 있습니다.</p></div>}
          </section>
        </Container>
      </section>
    </>
  );
}
