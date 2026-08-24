'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CartItem } from '@closed-commerce/types';
import { CART_KEY } from './add-to-cart-button';

export interface QuotedLine {
  productId: string;
  productName: string;
  optionId?: string;
  optionName?: string;
  unitPrice: number;
  shippingFee: number;
  quantity: number;
  availableStock?: number;
  imageUrl?: string;
  slug: string;
}

export interface CartTotals {
  grossAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
  commissionableAmount: number;
  quantity: number;
}

export interface CartQuote {
  lines: QuotedLine[];
  totals: CartTotals;
  issues: { productId: string; optionId?: string; reason: string }[];
  authenticated: boolean;
}

const EMPTY_TOTALS: CartTotals = {
  grossAmount: 0,
  discountAmount: 0,
  shippingAmount: 0,
  paidAmount: 0,
  commissionableAmount: 0,
  quantity: 0,
};

function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === 'object' && item !== null && typeof (item as CartItem).productId === 'string' && typeof (item as CartItem).quantity === 'number',
    );
  } catch {
    // 손상된 장바구니 데이터로 페이지 전체가 죽지 않게 한다.
    return [];
  }
}

/**
 * 장바구니 금액을 서버에서 받아온다.
 * 예전에는 클라이언트가 DEMO_PRODUCTS 기준으로 직접 계산해서,
 * 실제 상품(UUID)을 담으면 조회 실패 → 예외 → 페이지 크래시로 이어졌다.
 */
export function useCartQuote() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const refresh = useCallback(async (nextItems: CartItem[]) => {
    if (nextItems.length === 0) {
      setQuote({ lines: [], totals: EMPTY_TOTALS, issues: [], authenticated: true });
      setState('ready');
      return;
    }
    try {
      const response = await fetch('/api/cart/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; requestId?: string };
        setError(`${body.error ?? '장바구니를 불러오지 못했습니다.'}${body.requestId ? ` (오류번호 ${body.requestId})` : ''}`);
        setState('error');
        return;
      }
      setQuote((await response.json()) as CartQuote);
      setState('ready');
    } catch (caught) {
      setError(`장바구니를 불러오지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
      setState('error');
    }
  }, []);

  useEffect(() => {
    const load = () => {
      const next = readCart();
      setItems(next);
      void refresh(next);
    };
    load();
    window.addEventListener('cart-updated', load);
    return () => window.removeEventListener('cart-updated', load);
  }, [refresh]);

  const update = useCallback(
    (productId: string, optionId: string | undefined, quantity: number) => {
      const next = items
        .map((item) => (item.productId === productId && item.optionId === optionId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0);
      setItems(next);
      window.localStorage.setItem(CART_KEY, JSON.stringify(next));
      void refresh(next);
    },
    [items, refresh],
  );

  const remove = useCallback(
    (productId: string, optionId: string | undefined) => update(productId, optionId, 0),
    [update],
  );

  return { items, quote, state, error, update, remove, refresh };
}
