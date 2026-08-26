'use client';

import Link from 'next/link';
import { Price } from '@closed-commerce/ui';
import { useCartQuote } from './use-cart-quote';

export function CartView() {
  const { quote, state, error, update, remove } = useCartQuote();

  if (state === 'loading') return <div className="card empty"><p className="muted">장바구니를 불러오는 중입니다.</p></div>;

  if (state === 'error') {
    return (
      <div className="card empty">
        <h3>장바구니를 불러오지 못했습니다.</h3>
        <p className="muted">{error}</p>
        <Link className="button button-primary" href="/products">상품 둘러보기</Link>
      </div>
    );
  }

  if (quote && !quote.authenticated) {
    return (
      <div className="card empty">
        <h3>로그인이 필요합니다.</h3>
        <p className="muted">추천 코드로 가입한 회원만 가격과 주문을 확인할 수 있습니다.</p>
        <Link className="button button-primary" href="/login">로그인</Link>
      </div>
    );
  }

  if (!quote || quote.lines.length === 0) {
    return (
      <div className="card empty">
        <h3>장바구니가 비어 있습니다.</h3>
        <p className="muted">추천 코드로 입장해 상품을 담아 보세요.</p>
        {quote?.issues.length ? (
          <p className="muted">{quote.issues.map((issue) => issue.reason).join(' ')}</p>
        ) : null}
        <Link className="button button-primary" href="/products">상품 둘러보기</Link>
      </div>
    );
  }

  return (
    <div className="two-column">
      <div className="stack">
        {quote.issues.length ? (
          <div className="card" role="status">
            <p className="muted">{quote.issues.map((issue) => issue.reason).join(' / ')}</p>
          </div>
        ) : null}
        {quote.lines.map((line) => (
          <div className="card row" key={`${line.productId}-${line.optionId ?? 'default'}`}>
            <div>
              <h3>{line.productName}</h3>
              <p className="muted">{line.optionName}</p>
              <Price amount={line.unitPrice} />
              {line.availableStock !== undefined && line.availableStock <= 5 ? (
                <p className="muted">재고 {line.availableStock}개</p>
              ) : null}
            </div>
            <div className="row">
              <button className="button button-ghost" onClick={() => update(line.productId, line.optionId, line.quantity - 1)} type="button" aria-label="수량 줄이기">−</button>
              <strong>{line.quantity}</strong>
              <button
                className="button button-ghost"
                onClick={() =>
                  update(
                    line.productId,
                    line.optionId,
                    line.availableStock === undefined ? line.quantity + 1 : Math.min(line.quantity + 1, Math.max(line.availableStock, 1)),
                  )
                }
                type="button"
                aria-label="수량 늘리기"
                disabled={line.availableStock !== undefined && line.quantity >= line.availableStock}
              >
                ＋
              </button>
              <button className="button button-ghost" onClick={() => remove(line.productId, line.optionId)} type="button">삭제</button>
            </div>
          </div>
        ))}
      </div>
      <aside className="card stack">
        <h3>주문 예상금액</h3>
        <div className="row"><span className="muted">상품금액</span><Price amount={quote.totals.grossAmount} /></div>
        <div className="row"><span className="muted">배송비</span><Price amount={quote.totals.shippingAmount} /></div>
        <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>
          {quote.shippingPolicy.cartonQuantity}개까지 {quote.shippingPolicy.feePerCarton.toLocaleString('ko-KR')}원, 초과 시 {quote.shippingPolicy.cartonQuantity}개 단위로 추가됩니다.
          {quote.shippingPolicy.freeShippingThreshold !== undefined
            ? ` ${quote.shippingPolicy.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 구매 시 무료배송입니다.`
            : ''}
        </p>
        <hr className="divider" />
        <div className="row total-line"><strong>결제 예정</strong><strong><Price amount={quote.totals.paidAmount} /></strong></div>
        <Link className="button button-primary" href="/checkout">주문서 작성</Link>
      </aside>
    </div>
  );
}
