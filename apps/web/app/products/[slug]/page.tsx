import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Container, Price, Badge } from '@closed-commerce/ui';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ProductImageGallery } from '@/components/product-image-gallery';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadProductBySlug } from '@/lib/catalog-data';
import { loadShippingSettings } from '@/lib/store-settings';

const VISIBILITY_LABEL: Record<string, string> = {
  referral: '추천 회원 전용',
  member: '회원 전용',
  public: '공개 판매',
  hidden: '비공개',
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [catalog, shipping] = await Promise.all([
    loadProductBySlug(slug, query.ref?.trim().toUpperCase()),
    loadShippingSettings(),
  ]);
  const product = catalog.product;

  if (!product && !catalog.authenticated) {
    return (
      <section className="section">
        <Container>
          <div className="stack">
            <div>
              <p className="eyebrow">MEMBER ACCESS</p>
              <h1>상품 상세는 로그인 후 확인할 수 있어요.</h1>
              <p className="muted">추천 코드로 가입한 뒤 로그인하면 특판 상품과 판매 조건을 확인할 수 있습니다.</p>
            </div>
            <ReferralGate />
          </div>
        </Container>
      </section>
    );
  }
  if (!product) notFound();

  const validReferral = catalog.validReferralCode;
  const images = product.images ?? [];
  const heroImage = images[0];
  // 상세 이미지는 상단 갤러리가 아니라 아래 상세 영역에 세로로 크게 쌓는다.
  const detailImages = images.slice(1);
  const stock = product.options[0]?.stock ?? 0;
  const price = product.options[0]?.price ?? product.price;

  return (
    <>
      <section className="page-header">
        <Container>
          <p className="breadcrumb">
            <Link href="/products">PRODUCTS</Link> / {product.name}
          </p>
          <h1>{product.name}</h1>
          <p className="muted">{product.shortDescription}</p>
        </Container>
      </section>

      {/* 상단: 대표 이미지 + 구매 카드 */}
      <section className="section">
        <Container className="two-column">
          <div className="product-hero">
            {heroImage ? (
              <ProductImageGallery key={product.id} images={images} productName={product.name} />
            ) : (
              <div className="hero-art" style={{ minHeight: 460 }}>
                <span className="hero-art-label">PRIVATE DROP</span>
                <span className="hero-art-title">
                  Premium
                  <br />
                  Gift Set.
                </span>
                <span className="hero-art-foot">
                  <span>사진 준비 중</span>
                </span>
              </div>
            )}
          </div>

          <div className="stack">
            <ShippingCutoffNotice time={shipping.shippingCutoffTime} />
            <div className="card stack">
              <div className="row">
                <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
                  <Badge tone="neutral">{product.category}</Badge>
                  <Badge tone="success">{VISIBILITY_LABEL[product.visibility] ?? product.visibility}</Badge>
                </div>
                <span className="muted">{stock > 0 ? `재고 ${stock.toLocaleString('ko-KR')}개` : '품절'}</span>
              </div>
              <h2>{product.name}</h2>
              <p className="muted">{product.shortDescription}</p>
              <div className="row">
                <span className="product-price"><Price amount={price} /></span>
                {product.weight ? <span className="muted">{product.weight}</span> : null}
              </div>
              {product.options.length > 0 ? (
                <div className="product-option-list">
                  {product.options.map((option) => (
                    <div className="row" key={option.id}>
                      <span>{option.name}: {option.value}</span>
                      <strong><Price amount={option.price} /></strong>
                    </div>
                  ))}
                </div>
              ) : null}
              <hr className="divider" />
              <p className="muted">
                {product.shippingFee ? `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원` : '무료배송'}
              </p>
              {validReferral ? <AddToCartButton product={product} /> : <ReferralGate compact />}
            </div>
          </div>
        </Container>
      </section>

      {/* 아래: 상세 설명 + 상세 이미지 (일반 쇼핑몰 상세페이지처럼 세로로 길게) */}
      <section className="section-tight product-detail-section">
        <Container>
          <div className="product-detail-tabs" aria-hidden="true">
            <span className="product-detail-tab active">상품 상세</span>
            <span className="product-detail-tab">배송·교환 안내</span>
          </div>

          <div className="product-detail-body">
            {product.description ? (
              // 관리자가 줄바꿈으로 입력한 설명이 한 덩어리로 뭉치지 않게 그대로 살린다.
              <p className="product-detail-text">{product.description}</p>
            ) : (
              <p className="muted">상세 설명이 아직 등록되지 않았습니다.</p>
            )}

            {detailImages.length > 0 ? (
              <div className="product-detail-images">
                {detailImages.map((image, index) => (
                  <div className="product-detail-image" key={image.id}>
                    <Image
                      src={image.url}
                      alt={image.altText || `${product.name} 상세 이미지 ${index + 1}`}
                      width={image.width && image.width >= 600 ? image.width : 1000}
                      height={image.width && image.width >= 600 ? (image.height ?? 1400) : 1400}
                      sizes="(max-width: 850px) 100vw, 860px"
                      quality={95}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="product-detail-body" id="shipping-info">
            <h3>배송·교환 안내</h3>
            <dl className="product-spec-list">
              <div>
                <dt>배송비</dt>
                <dd>{product.shippingFee ? `${product.shippingFee.toLocaleString('ko-KR')}원` : '무료배송'}</dd>
              </div>
              <div>
                <dt>배송 마감</dt>
                <dd>{shipping.shippingCutoffTime} (이후 주문은 다음 출고 일정으로 처리될 수 있습니다)</dd>
              </div>
              <div>
                <dt>구성</dt>
                <dd>{product.options.map((option) => `${option.name}: ${option.value}`).join(' / ') || '단일 구성'}</dd>
              </div>
              <div>
                <dt>교환·반품</dt>
                <dd>식품 특성상 단순 변심에 의한 교환·반품이 제한될 수 있습니다. 고객센터로 문의해 주세요.</dd>
              </div>
            </dl>
          </div>

          <p className="muted">추천인 귀속과 결제 금액은 주문 생성 시점에 서버에서 검증·snapshot됩니다.</p>
        </Container>
      </section>
    </>
  );
}
