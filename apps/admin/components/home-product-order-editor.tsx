'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@closed-commerce/types';

interface ProductGroup {
  category: string;
  products: Product[];
}

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => {
    const orderDifference = (a.homeSortOrder ?? 100) - (b.homeSortOrder ?? 100);
    return orderDifference || a.name.localeCompare(b.name, 'ko');
  });
}

function groupProductsByCategory(products: Product[], categories: string[]): ProductGroup[] {
  const productsByCategory = new Map<string, Product[]>();
  products.forEach((product) => {
    const current = productsByCategory.get(product.category) ?? [];
    current.push(product);
    productsByCategory.set(product.category, current);
  });

  const categoryOrder = [
    ...categories,
    // 아직 운영 설정에 등록되지 않은 상품은 관리자에서 확인할 수만 있게
    // 마지막에 남겨 둔다. 고객 홈에서는 이런 카테고리를 숨긴다.
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

function ProductOrderRow({
  product,
  index,
  groupLength,
  editable,
  busy,
  onMove,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  product: Product;
  index: number;
  groupLength: number;
  editable: boolean;
  busy: boolean;
  onMove: (targetIndex: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const isSelling = product.status === 'active';

  return (
    <div
      className="home-order-row"
      draggable={editable && !busy}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="home-order-product">
        <div className="home-order-product-header">
          <span className="home-order-drag-handle" aria-hidden="true">☷</span>
          <strong>{product.name}</strong>
          <span className={`badge ${isSelling ? 'badge-success' : 'badge-warning'}`}>{isSelling ? '판매중' : '판매중지중'}</span>
        </div>
        <span className="field-hint">{product.visibility === 'hidden' ? '홈 비노출' : '홈 노출 가능'}</span>
      </div>
      <label className="field home-order-field">
        <span className="field-label">노출 순서</span>
        <select
          className="select"
          value={index}
          disabled={!editable || busy}
          onChange={(event) => onMove(Number(event.target.value))}
          aria-label={`${product.name} 홈 진열 순서`}
        >
          {Array.from({ length: groupLength }, (_, position) => (
            <option value={position} key={position}>{position + 1}번째</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function HomeProductOrderEditor({ products, categories, editable }: { products: Product[]; categories: string[]; editable: boolean }) {
  const [groups, setGroups] = useState<ProductGroup[]>(() => groupProductsByCategory(products, categories));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState<{ groupIndex: number; productIndex: number } | null>(null);
  const router = useRouter();

  // 저장 후 router.refresh()로 서버 상품 순서를 다시 받아오면 로컬 순서도 맞춘다.
  useEffect(() => {
    setGroups(groupProductsByCategory(products, categories));
  }, [products, categories]);

  async function persistGroupOrder(groupIndex: number, nextProducts: Product[], previousGroups: ProductGroup[]) {
    setBusy(true);
    setMessage('');
    try {
      const responses = await Promise.all(
        nextProducts.map((product) => fetch(`/api/products/${product.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homeSortOrder: product.homeSortOrder }),
        })),
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const result = (await failed.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? '상품 순서를 저장하지 못했습니다.');
      }
      setGroups((current) => current.map((group, index) => index === groupIndex ? { ...group, products: nextProducts } : group));
      setMessage('상품 순서를 저장했습니다.');
      router.refresh();
    } catch (caught) {
      setGroups(previousGroups);
      setMessage(`상품 순서를 저장하지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }

  function moveProduct(groupIndex: number, fromIndex: number, toIndex: number) {
    if (!editable || busy || fromIndex === toIndex) return;
    const group = groups[groupIndex];
    if (!group || toIndex < 0 || toIndex >= group.products.length) return;
    const previousGroups = groups;
    const nextProducts = [...group.products];
    const [moved] = nextProducts.splice(fromIndex, 1);
    if (!moved) return;
    nextProducts.splice(toIndex, 0, moved);
    const normalized = nextProducts.map((product, index) => ({ ...product, homeSortOrder: index * 10 }));
    setGroups(groups.map((candidate, index) => index === groupIndex ? { ...candidate, products: normalized } : candidate));
    void persistGroupOrder(groupIndex, normalized, previousGroups);
  }

  return (
    <section className="card admin-section stack">
      <div>
        <h2>홈 상품 진열 순서</h2>
        <p className="muted">카테고리별 드롭다운에서 노출 순서를 선택하거나 상품 행을 드래그해 순서를 바꿀 수 있습니다. 변경 즉시 저장되며, 판매중 상품만 고객몰 홈에 표시됩니다.</p>
      </div>
      {!editable ? <p className="admin-note">현재 데모 워크스페이스에서는 순서 변경이 비활성화되어 있습니다. Supabase 운영 데이터에 연결하면 드롭다운과 드래그로 바로 저장할 수 있습니다.</p> : null}
      {message ? <p className="admin-note" role="status">{message}</p> : null}
      {groups.length ? (
        <div className="home-order-category-list">
          {groups.map((group, groupIndex) => (
            <section className="home-order-category" key={group.category}>
              <div className="home-order-category-heading">
                <div>
                  <p className="eyebrow">CATEGORY</p>
                  <h3>{group.category}</h3>
                </div>
                <span className="badge badge-neutral">{group.products.length}개</span>
              </div>
              <div className="home-order-list">
                {group.products.map((product, productIndex) => (
                  <ProductOrderRow
                    key={product.id}
                    product={product}
                    index={productIndex}
                    groupLength={group.products.length}
                    editable={editable}
                    busy={busy}
                    onMove={(targetIndex) => moveProduct(groupIndex, productIndex, targetIndex)}
                    onDragStart={() => setDragging({ groupIndex, productIndex })}
                    onDrop={() => {
                      if (dragging?.groupIndex === groupIndex) moveProduct(groupIndex, dragging.productIndex, productIndex);
                    }}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}
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
