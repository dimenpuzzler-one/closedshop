'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { calculateCartTotals, getProductById } from '@closed-commerce/commerce';
import type { CartItem } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';
import { CART_KEY } from './add-to-cart-button';

export function CartView() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      const raw = window.localStorage.getItem(CART_KEY);
      setItems(raw ? JSON.parse(raw) as CartItem[] : []);
      setHydrated(true);
    };
    load();
    window.addEventListener('cart-updated', load);
    return () => window.removeEventListener('cart-updated', load);
  }, []);

  const totals = useMemo(() => calculateCartTotals(items), [items]);

  function update(productId: string, quantity: number) {
    const next = items.map((item) => item.productId === productId ? { ...item, quantity } : item).filter((item) => item.quantity > 0);
    setItems(next);
    window.localStorage.setItem(CART_KEY, JSON.stringify(next));
  }

  if (!hydrated) return <div className="card empty"><p className="muted">장바구니를 불러오는 중입니다.</p></div>;
  if (items.length === 0) return <div className="card empty"><h3>장바구니가 비어 있습니다.</h3><p className="muted">추천 코드로 입장해 상품을 담아 보세요.</p><Link className="button button-primary" href="/products?ref=KGY001">상품 둘러보기</Link></div>;

  return <div className="two-column">
    <div className="stack">{items.map((item) => {
      const product = getProductById(item.productId);
      if (!product) return null;
      return <div className="card row" key={`${item.productId}-${item.optionId}`}>
        <div><h3>{product.name}</h3><p className="muted">{product.options[0]?.value}</p><Price amount={product.price} /></div>
        <div className="row"><button className="button button-ghost" onClick={() => update(item.productId, item.quantity - 1)} type="button">−</button><strong>{item.quantity}</strong><button className="button button-ghost" onClick={() => update(item.productId, item.quantity + 1)} type="button">＋</button></div>
      </div>;
    })}</div>
    <aside className="card stack"><h3>주문 예상금액</h3><div className="row"><span className="muted">상품금액</span><Price amount={totals.grossAmount} /></div><div className="row"><span className="muted">배송비</span><Price amount={totals.shippingAmount} /></div><hr className="divider" /><div className="row total-line"><strong>결제 예정</strong><strong><Price amount={totals.paidAmount} /></strong></div><Link className="button button-primary" href="/checkout?ref=KGY001">주문서 작성</Link></aside>
  </div>;
}
