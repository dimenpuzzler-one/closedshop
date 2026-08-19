'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { getProductById } from '@closed-commerce/commerce';
import type { CartItem } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';
import { CART_KEY } from './add-to-cart-button';

export function CheckoutForm({ referralCode = 'KGY001' }: { referralCode?: string }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const raw = window.localStorage.getItem(CART_KEY);
    setItems(raw ? JSON.parse(raw) as CartItem[] : []);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    const form = new FormData(event.currentTarget);
    const body = {
      buyerUserId: 'user-demo',
      referralCode,
      promotionCode: String(form.get('promotionCode') || '').trim() || undefined,
      items,
      address: {
        recipientName: String(form.get('recipientName') || ''),
        phone: String(form.get('phone') || ''),
        postalCode: String(form.get('postalCode') || ''),
        addressLine1: String(form.get('addressLine1') || ''),
        addressLine2: String(form.get('addressLine2') || '') || undefined,
        deliveryMessage: String(form.get('deliveryMessage') || '') || undefined,
      },
    };
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { message?: string; orderNumber?: string; error?: string };
    if (!response.ok) { setStatus('error'); setMessage(result.error ?? '주문을 처리하지 못했습니다.'); return; }
    window.localStorage.removeItem(CART_KEY);
    setStatus('success');
    setMessage(`${result.orderNumber} 주문이 접수되었습니다. mock 결제가 완료된 데모 주문입니다.`);
  }

  if (items.length === 0 && status !== 'success') return <div className="card empty"><h3>주문할 상품이 없습니다.</h3><Link href="/products?ref=KGY001" className="button button-primary">상품 담으러 가기</Link></div>;
  if (status === 'success') return <div className="card empty"><p className="eyebrow">ORDER COMPLETE</p><h2>주문이 접수됐어요.</h2><p className="muted">{message}</p><Link className="button button-primary" href="/account/orders">주문 조회</Link></div>;

  return <form className="two-column" onSubmit={submit}>
    <div className="card stack"><div><p className="eyebrow">SHIPPING</p><h2>배송지 입력</h2></div><div className="form-grid"><label className="field"><span className="field-label">받는 분</span><input className="input" name="recipientName" required /></label><label className="field"><span className="field-label">연락처</span><input className="input" name="phone" required /></label><label className="field"><span className="field-label">우편번호</span><input className="input" name="postalCode" required /></label><label className="field"><span className="field-label">Promotion Code</span><input className="input" name="promotionCode" placeholder="예: CHUSEOK10" /></label><label className="field full"><span className="field-label">주소</span><input className="input" name="addressLine1" required /></label><label className="field full"><span className="field-label">상세주소</span><input className="input" name="addressLine2" /></label><label className="field full"><span className="field-label">배송 메모</span><textarea className="textarea" name="deliveryMessage" /></label></div><div className="notice">결제 성공 후 Commission은 pending으로 생성되고, 구매확정 또는 환불가능기간이 지나면 approved/payable로 전환됩니다.</div><div className="form-actions"><button className="button button-primary button-large" disabled={status === 'submitting'}>{status === 'submitting' ? '주문 처리 중…' : 'mock 결제로 주문하기'}</button></div>{status === 'error' ? <p className="form-message form-error">{message}</p> : null}</div>
    <aside className="card stack"><h3>주문 상품</h3>{items.map((item) => { const product = getProductById(item.productId); return product ? <div className="row" key={item.productId}><span>{product.name} × {item.quantity}</span><Price amount={product.price * item.quantity} /></div> : null; })}<hr className="divider" /><div className="row total-line"><strong>상품 합계</strong><strong><Price amount={items.reduce((sum, item) => { const product = getProductById(item.productId); return sum + (product?.price ?? 0) * item.quantity; }, 0)} /></strong></div></aside>
  </form>;
}
