'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { Product } from '@closed-commerce/types';
import type { AdminHomeBanner, AdminStoreSettings } from '@/lib/admin-data';

function won(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

export function HomepagePreview({
  settings,
  banners,
  products,
  categories,
}: {
  settings: AdminStoreSettings;
  banners: AdminHomeBanner[];
  products: Product[];
  categories: string[];
}) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [member, setMember] = useState(false);
  const visible = useMemo(
    () => products.filter((product) => product.status === 'active' && product.visibility !== 'hidden'),
    [products],
  );
  const previewCategories = useMemo(() => {
    const productCategories = [...new Set(visible.map((product) => product.category))];
    return [...categories.filter((category) => productCategories.includes(category)), ...productCategories.filter((category) => !categories.includes(category))];
  }, [categories, visible]);
  const firstBanner = banners.find((banner) => banner.isActive);

  return (
    <section className="card admin-section stack">
      <div className="admin-heading homepage-preview-heading">
        <div>
          <h2>홈 화면 미리보기</h2>
          <p className="muted">현재 저장된 설정과 실제 등록 상품을 보여줍니다. 저장 전 입력값은 반영되지 않습니다.</p>
        </div>
        <div className="homepage-preview-controls" aria-label="미리보기 설정">
          <button className={`button ${viewport === 'desktop' ? 'button-primary' : 'button-ghost'}`} type="button" onClick={() => setViewport('desktop')}>PC</button>
          <button className={`button ${viewport === 'mobile' ? 'button-primary' : 'button-ghost'}`} type="button" onClick={() => setViewport('mobile')}>모바일</button>
          <button className="button button-ghost" type="button" onClick={() => setMember((current) => !current)}>
            {member ? '회원 화면' : '비회원 화면'}
          </button>
        </div>
      </div>

      <div className={`homepage-preview-shell ${viewport} theme-${settings.siteTheme} width-${settings.siteWidth} density-${settings.siteDensity}`}>
        <div className="homepage-preview-canvas">
          <div className="homepage-preview-header"><strong>DEALKEY</strong><span>상품 둘러보기 · 장바구니 · 로그인</span></div>
          <div className="homepage-preview-banner">
            {firstBanner ? (
              <Image src={firstBanner.imageUrl} alt={firstBanner.altText || '홈 배너'} fill sizes={viewport === 'mobile' ? '390px' : '1000px'} unoptimized />
            ) : (
              <div className="homepage-preview-banner-fallback">
                <small>PRIVATE SPECIALTY MARKET</small>
                <strong>{settings.heroHeadline || '초대받은 분께만 열리는 특판몰.'}</strong>
              </div>
            )}
          </div>
          {previewCategories.length > 1 ? <div className="homepage-preview-chips">{previewCategories.map((category) => <span key={category}>{category}</span>)}</div> : null}
          {previewCategories.map((category) => (
            <div className="homepage-preview-category" key={category}>
              <small>CATEGORY</small>
              <h3>{category}</h3>
              <div className="homepage-preview-products">
                {visible.filter((product) => product.category === category).slice(0, 4).map((product) => {
                  const memberPrice = product.basePrice ?? product.options[0]?.price ?? product.price;
                  const imageUrl = /^https?:\/\//.test(product.imageUrl) || product.imageUrl.startsWith('/brand/') ? product.imageUrl : '';
                  return (
                    <article key={product.id}>
                      <div className="homepage-preview-product-image">
                        {imageUrl ? <Image src={imageUrl} alt="" fill sizes={viewport === 'mobile' ? '180px' : '240px'} unoptimized /> : <span>NO IMAGE</span>}
                      </div>
                      <div className="homepage-preview-product-body">
                        <small>{product.category}</small>
                        <strong>{product.name}</strong>
                        <div className="homepage-preview-price">
                          {member ? <b>회원가 {won(memberPrice)}</b> : <><b>{product.onlinePrice ? `온라인가 ${won(product.onlinePrice)}` : '온라인가 준비 중'}</b><em>회원가입 후 회원가 확인</em></>}
                        </div>
                        <span className="homepage-preview-detail">상세 보기</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
          {!visible.length ? <p className="homepage-preview-empty">홈에 노출할 판매중 상품이 없습니다.</p> : null}
        </div>
      </div>
    </section>
  );
}
