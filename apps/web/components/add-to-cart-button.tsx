'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CartItem, Product } from '@closed-commerce/types';

const CART_KEY = 'closed-commerce-cart';

/** 장바구니에 한 개 담는다. 이미 있으면 수량만 올린다. */
function addToCart(product: Product): boolean {
  const optionId = product.options[0]?.id;
  if (!optionId) return false;
  const raw = window.localStorage.getItem(CART_KEY);
  const items: CartItem[] = raw ? (JSON.parse(raw) as CartItem[]) : [];
  const existing = items.find((item) => item.productId === product.id && item.optionId === optionId);
  if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
  else items.push({ productId: product.id, optionId, quantity: 1 });
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
  return true;
}

/**
 * 상세페이지의 구매 버튼 두 개.
 *
 * 대표님 요청대로 "장바구니 담기"와 "바로구매"를 나눈다.
 * 바로구매는 담은 뒤 주문서로 바로 넘긴다 - 장바구니를 거치지 않는 것처럼 보이지만
 * 실제로는 같은 장바구니를 쓴다. 주문 금액 계산이 한 경로로만 흐르게 하기 위해서다.
 * 두 경로가 각자 금액을 계산하면 화면과 결제 금액이 어긋난다.
 */
export function AddToCartButton({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function handleAdd() {
    if (!addToCart(product)) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1300);
  }

  function handleBuyNow() {
    if (!addToCart(product)) return;
    setBusy(true);
    router.push('/checkout');
  }

  return (
    <div className="buy-actions">
      <button className="button button-secondary" onClick={handleAdd} type="button" disabled={busy}>
        {added ? '담았어요' : '장바구니 담기'}
      </button>
      <button className="button button-primary" onClick={handleBuyNow} type="button" disabled={busy}>
        {busy ? '이동 중…' : '바로구매'}
      </button>
    </div>
  );
}

export { CART_KEY };
