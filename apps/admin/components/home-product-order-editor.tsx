'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@closed-commerce/types';

function ProductOrderRow({ product, editable }: { product: Product; editable: boolean }) {
  const [order, setOrder] = useState(product.homeSortOrder ?? 100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeSortOrder: order }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage(result.error ?? '순서를 저장하지 못했습니다.');
        return;
      }
      setMessage('저장됨');
      router.refresh();
    } catch (caught) {
      setMessage(`저장 실패: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-order-row">
      <div className="home-order-product">
        <strong>{product.name}</strong>
        <span className="field-hint">{product.category} · {product.status === 'active' ? '홈 노출 가능' : '판매중 아님'}</span>
      </div>
      <label className="field home-order-field">
        <span className="field-label">순서</span>
        <input
          className="input"
          type="number"
          min="0"
          max="9999"
          value={order}
          disabled={!editable || busy}
          onChange={(event) => setOrder(Number(event.target.value))}
          aria-label={`${product.name} 홈 진열 순서`}
        />
      </label>
      <button className="button button-ghost" type="button" disabled={!editable || busy} onClick={() => void save()}>
        {busy ? '저장 중…' : '저장'}
      </button>
      <span className="home-order-message" role="status">{message}</span>
    </div>
  );
}

export function HomeProductOrderEditor({ products, editable }: { products: Product[]; editable: boolean }) {
  return (
    <section className="card admin-section stack">
      <div>
        <h2>홈 상품 진열 순서</h2>
        <p className="muted">숫자가 작을수록 같은 카테고리 안에서 먼저 보입니다. 홈에는 판매중 상품만 표시됩니다.</p>
      </div>
      {products.length ? (
        <div className="home-order-list">
          {products.map((product) => <ProductOrderRow key={product.id} product={product} editable={editable} />)}
        </div>
      ) : (
        <p className="muted">등록된 상품이 없습니다.</p>
      )}
    </section>
  );
}
