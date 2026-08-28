'use client';

import { useEffect } from 'react';
import { CART_KEY } from './add-to-cart-button';

/**
 * 결제가 실제로 끝난 뒤에만 장바구니를 비운다.
 *
 * 예전에는 주문 요청을 보낸 직후에 비웠다. 코페이 인증결제는 고객이 카드사 화면에서
 * 취소할 수 있으므로, 그 시점에 비우면 취소한 고객의 장바구니가 사라진다.
 */
export function ClearCartOnSuccess() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(CART_KEY);
      window.dispatchEvent(new Event('cart-updated'));
    } catch {
      // 브라우저가 저장소를 막아둔 경우까지 화면을 깨뜨릴 이유는 없다.
    }
  }, []);
  return null;
}
