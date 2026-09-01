'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Price } from '@closed-commerce/ui';
import type { AdminOrderRow } from '@/lib/admin-data';

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', payment_pending: '결제대기', paid: '결제완료', preparing: '준비중',
  shipped: '출고', delivered: '배송완료', cancel_requested: '취소요청', cancelled: '취소',
  refund_requested: '환불요청', partially_refunded: '부분환불', refunded: '환불',
};

/**
 * 결제까지 간 주문. 결제창을 열어만 보고 나간 주문(payment_pending)과
 * 취소된 주문은 여기 들어오지 않는다. 대표님이 "결제 완료된 것만" 보고 싶어 한 목록이다.
 */
const REAL_ORDER_STATUSES = new Set([
  'paid', 'preparing', 'shipped', 'delivered',
  'cancel_requested', 'refund_requested', 'partially_refunded', 'refunded',
]);

export function isRealOrder(status: string): boolean {
  return REAL_ORDER_STATUSES.has(status);
}

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'cancelled' || status === 'refunded' || status === 'payment_pending') return 'warning';
  if (status === 'paid' || status === 'delivered' || status === 'shipped' || status === 'preparing') return 'success';
  return 'neutral';
}

function addressText(order: AdminOrderRow): string {
  if (!order.address) return '';
  const { postalCode, addressLine1, addressLine2 } = order.address;
  return [postalCode ? `(${postalCode})` : '', addressLine1, addressLine2].filter(Boolean).join(' ');
}

/** 엑셀에서 한글이 깨지지 않도록 BOM을 붙이고, 쉼표·따옴표·줄바꿈이 든 값은 감싼다. */
function toCsv(rows: string[][]): string {
  const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return `\ufeff${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
}

function downloadCsv(orders: AdminOrderRow[]) {
  const header = [
    '주문번호', '주문일시', '주문상태', '결제상태', '구매자', '상품',
    '결제금액', '추천코드', '수령인', '연락처', '우편번호', '주소', '상세주소', '배송요청사항',
  ];
  const body = orders.map((order) => [
    order.number,
    new Date(order.createdAt).toLocaleString('ko-KR'),
    STATUS_LABEL[order.status] ?? order.status,
    order.payment,
    order.buyer,
    order.item,
    // 엑셀이 숫자로 읽도록 원 단위 정수만 넣는다.
    String(order.amount),
    order.ref,
    order.address?.recipientName ?? '',
    order.address?.phone ?? '',
    order.address?.postalCode ?? '',
    order.address?.addressLine1 ?? '',
    order.address?.addressLine2 ?? '',
    order.address?.deliveryMessage ?? '',
  ]);

  const blob = new Blob([toCsv([header, ...body])], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `딜키_주문목록_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function OrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  // 기본은 실제 주문만. 결제창만 열어보고 나간 주문까지 섞이면 목록이 금방 쓸모없어진다.
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const visible = useMemo(
    () => (showAll ? orders : orders.filter((order) => isRealOrder(order.status))),
    [orders, showAll],
  );
  const hiddenCount = orders.length - orders.filter((order) => isRealOrder(order.status)).length;

  async function patch(orderId: string, payload: Record<string, unknown>) {
    setBusyId(orderId);
    setError('');
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(`${(body as { error?: string }).error ?? '처리하지 못했습니다.'} (HTTP ${response.status})`);
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(`요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusyId(null);
    }
  }

  function action(order: AdminOrderRow) {
    if (order.status === 'payment_pending' || order.status === 'pending') {
      // 결제를 끝내지 않은 주문. 취소하면 잡아둔 재고가 즉시 풀린다.
      return <button className="button button-ghost" type="button" disabled={busyId === order.id} onClick={() => void patch(order.id, { status: 'cancelled' })}>정리(재고 반환)</button>;
    }
    if (order.status === 'paid') return <button className="button button-ghost" type="button" disabled={busyId === order.id} onClick={() => void patch(order.id, { status: 'preparing' })}>준비 시작</button>;
    if (order.status === 'preparing') return <button className="button button-ghost" type="button" disabled={busyId === order.id} onClick={() => void patch(order.id, { status: 'shipped', shippingCompany: 'CJ대한통운', trackingNumber: '입력 필요' })}>배송 처리</button>;
    if (order.status === 'shipped') return <button className="button button-ghost" type="button" disabled={busyId === order.id} onClick={() => void patch(order.id, { status: 'delivered' })}>배송 완료</button>;
    return <span className="muted">—</span>;
  }

  return (
    <>
      <div className="toolbar" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <button className={`button ${showAll ? 'button-ghost' : 'button-secondary'}`} type="button" onClick={() => setShowAll(false)}>
            실제 주문만 ({orders.filter((order) => isRealOrder(order.status)).length})
          </button>
          <button className={`button ${showAll ? 'button-secondary' : 'button-ghost'}`} type="button" onClick={() => setShowAll(true)}>
            결제대기·취소 포함 ({orders.length})
          </button>
        </div>
        <button className="button button-primary" type="button" onClick={() => downloadCsv(visible)} disabled={visible.length === 0}>
          엑셀 다운로드 ({visible.length}건)
        </button>
      </div>

      {!showAll && hiddenCount > 0 ? (
        <p className="admin-note">
          결제를 끝내지 않았거나 취소된 주문 {hiddenCount}건은 숨겼습니다. 결제대기 주문이 잡고 있는 재고는 20분 뒤 자동으로 풀립니다.
        </p>
      ) : null}
      {error ? <p className="admin-note" role="alert">{error}</p> : null}

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>주문번호</th><th>구매자</th><th>상품</th><th>배송지</th>
              <th>Referral</th><th>결제금액</th><th>결제</th><th>주문상태</th><th>액션</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order) => (
              <tr key={order.id}>
                <td><strong>{order.number}</strong><br /><span className="muted">{new Date(order.createdAt).toLocaleDateString('ko-KR')}</span></td>
                <td>{order.buyer}</td>
                <td>{order.item}</td>
                <td>
                  {order.address ? (
                    <>
                      <strong>{order.address.recipientName}</strong>
                      {order.address.phone ? <><br /><span className="muted">{order.address.phone}</span></> : null}
                      <br />{addressText(order)}
                      {order.address.deliveryMessage ? <><br /><span className="muted">요청: {order.address.deliveryMessage}</span></> : null}
                    </>
                  ) : (
                    <span className="muted">배송지 없음</span>
                  )}
                </td>
                <td><Badge tone="accent">{order.ref}</Badge></td>
                <td><Price amount={order.amount} /></td>
                <td><Badge tone={order.payment === 'paid' ? 'success' : 'warning'}>{order.payment}</Badge></td>
                <td><Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</Badge></td>
                <td>{action(order)}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr><td colSpan={9}><span className="muted">표시할 주문이 없습니다.</span></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
