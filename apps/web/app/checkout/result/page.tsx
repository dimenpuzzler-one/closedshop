import Link from 'next/link';
import { Container } from '@closed-commerce/ui';
import { COMPANY } from '@closed-commerce/config';
import { ClearCartOnSuccess } from '@/components/clear-cart-on-success';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const TITLES: Record<string, string> = {
  paid: '결제가 완료되었습니다.',
  cancelled: '결제를 취소하셨습니다.',
  failed: '결제가 완료되지 않았습니다.',
  unknown: '결제 결과를 확인할 수 없습니다.',
  processing: '결제 결과를 확인 중입니다.',
};

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string; orderNumber?: string; code?: string; requestId?: string }>;
}) {
  const params = await searchParams;
  let status = params.status && TITLES[params.status] ? params.status : 'unknown';
  // URL의 status=paid만으로 결제 완료를 표시하거나 장바구니를 비우지 않는다.
  if (status === 'paid') {
    status = 'unknown';
    if (hasSupabaseEnv() && params.orderNumber) {
      const client = await createServerAppClient();
      const { data: auth } = await client.auth.getUser();
      if (auth.user) {
        const { data: order } = await client.from('orders')
          .select('status')
          .eq('order_number', params.orderNumber)
          .eq('buyer_user_id', auth.user.id)
          .maybeSingle();
        if (order && ['paid', 'preparing', 'shipped', 'delivered'].includes(order.status)) status = 'paid';
        else if (order?.status === 'payment_pending') status = 'processing';
      }
    }
  }
  const paid = status === 'paid';

  return (
    <section className="section">
      <Container>
        <div className="card stack" style={{ maxWidth: 620, margin: '0 auto', padding: '2rem' }}>
          <p className="eyebrow">{paid ? 'ORDER COMPLETE' : 'PAYMENT'}</p>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)' }}>{TITLES[status]}</h1>

          {paid ? (
            <>
              {/* 결제가 끝난 뒤에만 장바구니를 비운다. */}
              <ClearCartOnSuccess />
              <p className="muted">
                주문번호 <strong>{params.orderNumber}</strong>
              </p>
              <p className="muted">
                주문 내역은 주문 조회에서 확인하실 수 있습니다. 배송이 시작되면 안내해 드립니다.
              </p>
            </>
          ) : (
            <>
              <p className="muted">{params.message ?? '결제가 처리되지 않았습니다.'}</p>
              <p className="muted">
                주문 내역에서 결제 상태를 확인해 주세요. 결제 문자를 받았는데 주문이 확인되지 않으면
                다시 결제하기 전에 아래 연락처로 문의해 주세요.
              </p>
              <p className="muted">
                고객센터 <a href={`tel:${COMPANY.phone}`}>{COMPANY.phone}</a> · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
              </p>
            </>
          )}

          {params.requestId ? <p className="field-hint">처리번호 {params.requestId}</p> : null}

          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            {paid ? (
              <>
                <Link href="/account/orders" className="button button-primary">주문 조회</Link>
                <Link href="/products" className="button button-ghost">계속 쇼핑하기</Link>
              </>
            ) : (
              <>
                <Link href="/cart" className="button button-primary">장바구니로 돌아가기</Link>
                <Link href="/products" className="button button-ghost">상품 보기</Link>
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
