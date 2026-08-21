'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Price } from '@closed-commerce/ui';
import { CART_KEY } from './add-to-cart-button';
import { useCartQuote } from './use-cart-quote';

type OrderResult = { message?: string; orderNumber?: string; error?: string; requestId?: string };

/** FormData.get()은 string | File을 돌려준다. File이 String()에 들어가면 "[object File]"이 된다. */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

async function readResponse(response: Response): Promise<OrderResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as OrderResult;
    } catch {
      return { error: `주문 응답을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const bodyText = await response.text().catch(() => '');
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${bodyText.slice(0, 160)}`.trim() };
}

export function CheckoutForm() {
  const { quote, state } = useCartQuote();
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setStatus('submitting');
    setMessage('');

    try {
      const form = new FormData(formElement);
      // 추천 코드와 구매자 id는 보내지 않는다.
      // 서버가 세션과 가입 시 고정된 귀속(referral_relationships)에서 직접 결정한다.
      // 예전에는 URL의 ?ref= 값을 그대로 보냈고, 기본값이 KGY001로 하드코딩되어 있어
      // 다른 코드로 가입한 회원은 주문이 항상 400으로 막혔다.
      const body = {
        promotionCode: text(form, 'promotionCode') || undefined,
        items: (quote?.lines ?? []).map((line) => ({ productId: line.productId, optionId: line.optionId, quantity: line.quantity })),
        address: {
          recipientName: text(form, 'recipientName'),
          phone: text(form, 'phone'),
          postalCode: text(form, 'postalCode'),
          addressLine1: text(form, 'addressLine1'),
          addressLine2: text(form, 'addressLine2') || undefined,
          deliveryMessage: text(form, 'deliveryMessage') || undefined,
        },
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await readResponse(response);

      if (!response.ok) {
        setStatus('error');
        setMessage(`${result.error ?? '주문을 처리하지 못했습니다.'}${result.requestId ? ` (오류번호 ${result.requestId})` : ''}`);
        return;
      }
      window.localStorage.removeItem(CART_KEY);
      window.dispatchEvent(new Event('cart-updated'));
      setStatus('success');
      setMessage(`${result.orderNumber ?? ''} 주문이 접수되었습니다.`.trim());
    } catch (caught) {
      setStatus('error');
      setMessage(`주문을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  if (status === 'success') {
    return (
      <div className="card empty">
        <p className="eyebrow">ORDER COMPLETE</p>
        <h2>주문이 접수됐어요.</h2>
        <p className="muted">{message}</p>
        <Link className="button button-primary" href="/account/orders">주문 조회</Link>
      </div>
    );
  }

  if (state === 'loading') return <div className="card empty"><p className="muted">주문 정보를 불러오는 중입니다.</p></div>;

  if (quote && !quote.authenticated) {
    return (
      <div className="card empty">
        <h3>로그인이 필요합니다.</h3>
        <Link href="/login" className="button button-primary">로그인</Link>
      </div>
    );
  }

  if (!quote || quote.lines.length === 0) {
    return (
      <div className="card empty">
        <h3>주문할 상품이 없습니다.</h3>
        <Link href="/products" className="button button-primary">상품 담으러 가기</Link>
      </div>
    );
  }

  return (
    <form className="two-column" onSubmit={submit}>
      <div className="card stack">
        <div><p className="eyebrow">SHIPPING</p><h2>배송지 입력</h2></div>
        <div className="form-grid">
          <label className="field"><span className="field-label">받는 분</span><input className="input" name="recipientName" required /></label>
          <label className="field"><span className="field-label">연락처</span><input className="input" name="phone" required /></label>
          <label className="field"><span className="field-label">우편번호</span><input className="input" name="postalCode" required /></label>
          <label className="field"><span className="field-label">Promotion Code</span><input className="input" name="promotionCode" placeholder="선택 입력" /></label>
          <label className="field full"><span className="field-label">주소</span><input className="input" name="addressLine1" required /></label>
          <label className="field full"><span className="field-label">상세주소</span><input className="input" name="addressLine2" /></label>
          <label className="field full"><span className="field-label">배송 메모</span><textarea className="textarea" name="deliveryMessage" /></label>
        </div>
        <div className="notice">결제 성공 후 Commission은 pending으로 생성되고, 구매확정 또는 환불가능기간이 지나면 approved/payable로 전환됩니다.</div>
        <div className="form-actions">
          <button className="button button-primary button-large" disabled={status === 'submitting'}>
            {status === 'submitting' ? '주문 처리 중…' : 'mock 결제로 주문하기'}
          </button>
        </div>
        {status === 'error' ? <p className="form-message form-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{message}</p> : null}
      </div>
      <aside className="card stack">
        <h3>주문 상품</h3>
        {quote.lines.map((line) => (
          <div className="row" key={`${line.productId}-${line.optionId ?? 'default'}`}>
            <span>{line.productName} × {line.quantity}</span>
            <Price amount={line.unitPrice * line.quantity} />
          </div>
        ))}
        <hr className="divider" />
        <div className="row"><span className="muted">상품 합계</span><Price amount={quote.totals.grossAmount} /></div>
        <div className="row"><span className="muted">배송비</span><Price amount={quote.totals.shippingAmount} /></div>
        <div className="row total-line"><strong>결제 예정</strong><strong><Price amount={quote.totals.paidAmount} /></strong></div>
      </aside>
    </form>
  );
}
