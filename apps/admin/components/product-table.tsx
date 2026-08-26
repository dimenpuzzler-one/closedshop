'use client';

import { Fragment, useState } from 'react';
import { Badge, Price } from '@closed-commerce/ui';
import type { Product } from '@closed-commerce/types';
import { ProductEditPanel } from './product-edit-panel';

const STATUS_LABEL: Record<string, string> = {
  active: '판매중',
  paused: '판매중지',
  draft: '초안',
  archived: '보관',
};

const VISIBILITY_LABEL: Record<string, string> = {
  referral: '추천 회원',
  member: '회원',
  public: '공개',
  hidden: '비공개',
};

/**
 * 상품 목록에서 "수정"을 누르면 그 줄 아래가 펼쳐지며 편집 화면이 열린다.
 * 예전에는 등록만 가능하고 이름·가격·재고·사진을 고칠 방법이 아예 없었다.
 */
export function ProductTable({ products, editable, categories }: { products: Product[]; editable: boolean; categories: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="muted">등록된 상품이 없습니다. 아래 “상품 등록 열기”에서 첫 상품을 등록해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>상품</th>
            <th>카테고리</th>
            <th>판매가</th>
            <th>노출</th>
            <th>재고</th>
            <th>사진</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const isOpen = openId === product.id;
            const stock = product.options.reduce((sum, option) => sum + option.stock, 0);
            const imageCount = product.images?.length ?? 0;
            return (
              <Fragment key={product.id}>
                <tr>
                  <td>
                    <strong>{product.name}</strong>
                    <br />
                    <span className="muted">{product.slug}</span>
                  </td>
                  <td><Badge tone="neutral">{product.category}</Badge></td>
                  <td><Price amount={product.options[0]?.price ?? product.price} /></td>
                  <td><Badge tone="accent">{VISIBILITY_LABEL[product.visibility] ?? product.visibility}</Badge></td>
                  <td>{stock}개</td>
                  <td>{imageCount ? `${imageCount}장` : <span className="muted">없음</span>}</td>
                  <td><Badge tone={product.status === 'active' ? 'success' : 'warning'}>{STATUS_LABEL[product.status] ?? product.status}</Badge></td>
                  <td>
                    {editable ? (
                      <button
                        className="button button-ghost"
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : product.id)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? '닫기' : '수정'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                {editable && isOpen ? (
                  <tr>
                    <td colSpan={8} style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <ProductEditPanel product={product} categories={categories} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
