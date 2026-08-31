import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container, Price, Badge } from '@closed-commerce/ui';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ProductImageGallery } from '@/components/product-image-gallery';
import { ProductDetailImages } from '@/components/product-detail-images';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadProductBySlug } from '@/lib/catalog-data';
import { loadStoreSettings } from '@/lib/store-settings';

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
  const [catalog, settings] = await Promise.all([
    loadProductBySlug(slug, query.ref?.trim().toUpperCase()),
    loadStoreSettings(),
  ]);
  const product = catalog.product;

  if (!product) notFound();

  // 가격을 볼 자격이 있을 때만 금액과 장바구니를 노출한다.
  // 자격이 없어도 상품 사진·구성·상세 설명은 그대로 보여준다 —
  // 당근·QR·지인 공유 유입은 대부분 비로그인 상태로 이 링크를 받는다.
  const priceVisible = catalog.priceVisible;
  const images = product.images ?? [];
  /*
   * 대표 사진과 상세 이미지를 순서가 아니라 생김새로 가른다.
   *
   * 예전에는 첫 장을 무조건 대표로 썼다. 그런데 운영자가 세로로 긴 상세 이미지
   * 한 장만 올리는 경우가 많고(실제로 850x13,304px), 그러면 그 긴 이미지가
   * 대표 사진 자리에 들어가 목록 썸네일까지 뭉개지고 1.8MB를 화면 맨 위에서 받는다.
   * 세로가 가로의 3배를 넘으면 상세 이미지로 본다.
   */
  const isDetailShaped = (image: (typeof images)[number]) =>
    Boolean(image.width && image.height && image.height / image.width >= 3);
  const galleryImages = images.filter((image) => !isDetailShaped(image));
  const longImages = images.filter(isDetailShaped);
  // 대표로 쓸 만한 사진이 하나도 없으면 긴 이미지의 윗부분을 잘라 대표로 쓴다.
  // 같은 파일이라 추가 다운로드는 없고, 화면 맨 위가 비지 않는다.
  const heroFallback = galleryImages.length === 0 && longImages[0] ? [longImages[0]] : [];
  const gallery = galleryImages.length > 0 ? galleryImages : heroFallback;
  const heroImage = gallery[0];
  const detailImages = longImages;
  const stock = product.options[0]?.stock ?? 0;
  const price = product.options[0]?.price ?? product.price;
  const shippingPolicy = settings.shippingPolicy;
  const shippingCopy = `${shippingPolicy.cartonQuantity}개까지 ${shippingPolicy.feePerCarton.toLocaleString('ko-KR')}원, 초과 시 ${shippingPolicy.cartonQuantity}개 단위로 추가${
    shippingPolicy.freeShippingThreshold !== undefined
      ? ` (${shippingPolicy.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 무료배송)`
      : ''
  }`;

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
              <ProductImageGallery key={product.id} images={gallery} productName={product.name} croppedTop={galleryImages.length === 0} />
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
            <ShippingCutoffNotice time={settings.shippingCutoffTime} />
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
                {priceVisible
                  ? <span className="product-price"><Price amount={price} /></span>
                  : <span className="product-price muted">회원 전용 가격</span>}
                {product.weight ? <span className="muted">{product.weight}</span> : null}
              </div>
              {product.options.length > 0 ? (
                <div className="product-option-list">
                  {product.options.map((option) => (
                    <div className="row" key={option.id}>
                      <span>{option.name}: {option.value}</span>
                      {priceVisible ? <strong><Price amount={option.price} /></strong> : <span className="muted">가격 비공개</span>}
                    </div>
                  ))}
                </div>
              ) : null}
              <hr className="divider" />
              <p className="muted">배송비 {shippingCopy}</p>
              {/*
                전자상거래법 제17조 제2항 단서: 청약철회 제한 사유를 "미리 명확하게 표시"하지
                않으면 판매자는 제한을 주장할 수 없다. 결제 직전, 구매 버튼 바로 위에 둔다.
              */}
              {product.withdrawalRestriction ? (
                <p className="withdrawal-notice" role="note">
                  <strong>청약철회 제한</strong>
                  <span>{product.withdrawalRestriction}</span>
                </p>
              ) : null}
              {priceVisible ? <AddToCartButton product={product} /> : <ReferralGate compact />}
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

            <ProductDetailImages images={detailImages} productName={product.name} />
          </div>

          <div className="product-detail-body" id="shipping-info">
            <h3>배송·교환 안내</h3>
            <dl className="product-spec-list">
              <div>
                <dt>배송비</dt>
                <dd>{shippingCopy}</dd>
              </div>
              <div>
                <dt>배송 마감</dt>
                <dd>{settings.shippingCutoffTime} (이후 주문은 다음 출고 일정으로 처리될 수 있습니다)</dd>
              </div>
              <div>
                <dt>구성</dt>
                <dd>{product.options.map((option) => `${option.name}: ${option.value}`).join(' / ') || '단일 구성'}</dd>
              </div>
              <div>
                <dt>교환·반품</dt>
                <dd>
                  {product.withdrawalRestriction
                    ? product.withdrawalRestriction
                    : '상품 수령일부터 7일 이내에 청약철회를 요청하실 수 있습니다.'}
                  {' '}자세한 내용은 <Link href="/legal/refund">환불·교환 안내</Link>를 확인해 주세요.
                </dd>
              </div>
            </dl>
          </div>

          <p className="muted">추천인 귀속과 결제 금액은 주문 생성 시점에 서버에서 검증·snapshot됩니다.</p>
        </Container>
      </section>
    </>
  );
}
