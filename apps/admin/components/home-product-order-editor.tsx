'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@closed-commerce/types';

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => {
    const orderDifference = (a.homeSortOrder ?? 100) - (b.homeSortOrder ?? 100);
    return orderDifference || a.name.localeCompare(b.name, 'ko');
  });
}

function groupProductsByCategory(products: Product[], categories: string[]) {
  const productsByCategory = new Map<string, Product[]>();
  products.forEach((product) => {
    const current = productsByCategory.get(product.category) ?? [];
    current.push(product);
    productsByCategory.set(product.category, current);
  });

  const categoryOrder = [
    ...categories,
    ...products.filter((product) => !categories.includes(product.category)).map((product) => product.category),
  ];
  const seen = new Set<string>();
  return categoryOrder.flatMap((category) => {
    if (seen.has(category)) return [];
    seen.add(category);
    const categoryProducts = productsByCategory.get(category);
    return categoryProducts?.length ? [{ category, products: sortProducts(categoryProducts) }] : [];
  });
}

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

  const isSelling = product.status === 'active';

  return (
    <div className="home-order-row">
      <div className="home-order-product">
        <div className="home-order-product-header">
          <strong>{product.name}</strong>
          <span className={`badge ${isSelling ? 'badge-success' : 'badge-warning'}`}>{isSelling ? '판매중' : '판매중지중'}</span>
        </div>
        <span className="field-hint">{product.visibility === 'hidden' ? '홈 비노출' : '홈 노출 가능'}</span>
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

export function HomeProductOrderEditor({ products, categories, editable }: { products: Product[]; categories: string[]; editable: boolean }) {
  const groups = groupProductsByCategory(products, categories);

  return (
    <section className="card admin-section stack">
      <div>
        <h2>홈 상품 진열 순서</h2>
        <p className="muted">카테고리별로 숫자가 작을수록 먼저 보입니다. 판매중 상품만 고객몰 홈에 표시됩니다.</p>
      </div>
      {groups.length ? (
        <div className="home-order-category-list">
          {groups.map((group) => (
            <section className="home-order-category" key={group.category}>
              <div className="home-order-category-heading">
                <div>
                  <p className="eyebrow">CATEGORY</p>
                  <h3>{group.category}</h3>
                </div>
                <span className="badge badge-neutral">{group.products.length}개</span>
              </div>
              <div className="home-order-list">
                {group.products.map((product) => <ProductOrderRow key={product.id} product={product} editable={editable} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="muted">등록된 상품이 없습니다.</p>
      )}
    </section>
  );
}
