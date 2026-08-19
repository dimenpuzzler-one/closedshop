'use client';

import { useState } from 'react';
import type { CartItem, Product } from '@closed-commerce/types';

const CART_KEY = 'closed-commerce-cart';

export function AddToCartButton({ product, compact = false }: { product: Product; compact?: boolean }) {
  const [added, setAdded] = useState(false);

  function add() {
    const raw = window.localStorage.getItem(CART_KEY);
    const items: CartItem[] = raw ? JSON.parse(raw) as CartItem[] : [];
    const optionId = product.options[0]?.id;
    if (!optionId) return;
    const existing = items.find((item) => item.productId === product.id && item.optionId === optionId);
    if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
    else items.push({ productId: product.id, optionId, quantity: 1 });
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('cart-updated'));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1300);
  }

  return <button className={`button ${compact ? 'button-secondary' : 'button-primary'}`} onClick={add} type="button">
    {added ? '담았어요' : compact ? '담기' : '장바구니 담기'}
  </button>;
}

export { CART_KEY };
