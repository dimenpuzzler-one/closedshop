'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CartItem, Product } from '@closed-commerce/types';

const CART_KEY = 'closed-commerce-cart';
const MAX_QUANTITY = 99;

/**
 * 장바구니에 담는다. 이미 담긴 상품이면 수량을 더한다.
 *
 * 예전에는 무조건 1개씩만 담겼다. 두 개를 사려면 담은 뒤 장바구니에 들어가
 * 수량을 올려야 했고, "바로구매"는 장바구니를 건너뛰므로 아예 1개밖에 못 샀다.
 */
function addToCart(product: Product, quantity: number): boolean {
  const optionId = product.options[0]?.id;
  if (!optionId) return false;
  const raw = window.localStorage.getItem(CART_KEY);
  const items: CartItem[] = raw ? (JSON.parse(raw) as CartItem[]) : [];
  const existing = items.find((item) => item.productId === product.id && item.optionId === optionId);
  if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
  else items.push({ productId: product.id, optionId, quantity });
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
  return true;
}

/**
 * 상세페이지의 수량 선택 + 구매 버튼 두 개.
 *
 * 대표님 요청대로 "장바구니 담기"와 "바로구매"를 나눈다.
 * 바로구매는 담은 뒤 주문서로 바로 넘긴다 - 장바구니를 거치지 않는 것처럼 보이지만
 * 실제로는 같은 장바구니를 쓴다. 주문 금액 계산이 한 경로로만 흐르게 하기 위해서다.
 * 두 경로가 각자 금액을 계산하면 화면과 결제 금액이 어긋난다.
 */
export function AddToCartButton({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const router = useRouter();

  // 남은 재고를 넘겨 담아봐야 결제 직전에 막힌다. 고를 때부터 못 넘게 한다.
  // 상세페이지 상단의 "재고 N개"와 같은 값을 쓴다(첫 옵션 기준).
  const stock = product.options[0]?.stock ?? 0;
  const limit = Math.max(1, Math.min(MAX_QUANTITY, stock));
  const soldOut = stock <= 0;

  function step(delta: number) {
    setQuantity((current) => Math.min(limit, Math.max(1, current + delta)));
  }

  function handleAdd() {
    if (soldOut || !addToCart(product, quantity)) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1300);
  }

  function handleBuyNow() {
    if (soldOut || !addToCart(product, quantity)) return;
    setBusy(true);
    router.push('/checkout');
  }

  if (soldOut) {
    return (
      <div className="buy-actions">
        <button className="button button-secondary" type="button" disabled>품절</button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '0.75rem' }}>
      <div className="row quantity-row" style={{ gap: '0.75rem', alignItems: 'center' }}>
        <span className="field-label" style={{ margin: 0 }}>수량</span>
        <div className="quantity-stepper row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => step(-1)}
            disabled={busy || quantity <= 1}
            aria-label="수량 줄이기"
          >
            −
          </button>
          <input
            className="input quantity-input"
            type="number"
            min={1}
            max={limit}
            value={quantity}
            aria-label="구매 수량"
            style={{ width: '4.5rem', textAlign: 'center' }}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              // 빈 칸이나 글자를 넣으면 NaN이 된다. 그때는 1로 되돌린다.
              setQuantity(Number.isFinite(next) ? Math.min(limit, Math.max(1, Math.trunc(next))) : 1);
            }}
          />
          <button
            className="button button-ghost"
            type="button"
            onClick={() => step(1)}
            disabled={busy || quantity >= limit}
            aria-label="수량 늘리기"
          >
            +
          </button>
        </div>
        <span className="muted">최대 {limit.toLocaleString('ko-KR')}개</span>
      </div>

      <div className="buy-actions">
        <button className="button button-secondary" onClick={handleAdd} type="button" disabled={busy}>
          {added ? '담았어요' : '장바구니 담기'}
        </button>
        <button className="button button-primary" onClick={handleBuyNow} type="button" disabled={busy}>
          {busy ? '이동 중…' : '바로구매'}
        </button>
      </div>
    </div>
  );
}

export { CART_KEY };
