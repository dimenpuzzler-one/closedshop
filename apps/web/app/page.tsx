import Link from 'next/link';
import Image from 'next/image';
import { Container, SectionHeading } from '@closed-commerce/ui';
import { ProductCard } from '@/components/product-card';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadCategories, loadVisibleCatalog } from '@/lib/catalog-data';
import { loadStoreSettings } from '@/lib/store-settings';

// 세션(가격 노출 여부)과 live 카탈로그를 읽으므로 빌드 시점에 고정되면 안 된다.
export const dynamic = 'force-dynamic';

/** 유튜브 링크를 임베드 주소로 바꾼다. 운영자가 어떤 형태로 붙여넣어도 받아준다. */
function toYoutubeEmbed(raw: string): string | undefined {
  const url = raw.trim();
  if (!url) return undefined;
  const match =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url);
  return match?.[1] ? `https://www.youtube.com/embed/${match[1]}` : undefined;
}

export default async function HomePage() {
  // 예전에는 이 화면이 상품 4개를 고정 진열했다. 카테고리가 늘면 홈이 못 따라간다.
  const [settings, catalog, categories] = await Promise.all([
    loadStoreSettings(),
    loadVisibleCatalog(),
    loadCategories(),
  ]);

  const headline = settings.heroHeadline || '초대받은 분께만 열리는 특판몰.';
  const subheadline =
    settings.heroSubheadline ||
    '좋은 상품을 아는 사람이, 믿을 수 있는 사람에게 소개하는 비공개 특판 플랫폼입니다.';
  const embed = toYoutubeEmbed(settings.heroYoutubeUrl);

  // 카테고리 순서를 그대로 따르되, 상품이 하나도 없는 카테고리는 홈에 그리지 않는다.
  const byCategory = categories
    .map((category) => ({ category, products: catalog.products.filter((product) => product.category === category) }))
    .filter((group) => group.products.length > 0);
  const ungrouped = catalog.products.filter((product) => !categories.includes(product.category));
  if (ungrouped.length > 0) byCategory.push({ category: '기타', products: ungrouped });

  return (
    <>
      <section className="hero">
        <Container className="hero-grid">
          <div>
            <p className="eyebrow">PRIVATE SPECIALTY MARKET</p>
            <h1>{headline}</h1>
            <p className="hero-copy">{subheadline}</p>
            <div className="hero-actions">
              <Link href="/products" className="button button-primary button-large">상품 전체 보기</Link>
              <Link href="/b2b" className="button button-ghost button-large">기업·단체 견적</Link>
            </div>
            <p className="hero-note">상품 가격과 판매 조건은 추천 코드로 가입한 회원에게만 공개합니다.</p>
          </div>
          {settings.heroBannerUrl ? (
            <div className="hero-banner">
              <Image src={settings.heroBannerUrl} alt={headline} width={860} height={620} sizes="(max-width: 850px) 100vw, 50vw" priority unoptimized />
            </div>
          ) : (
            <div className="hero-art">
              <span className="hero-art-label">PRIVATE DROP</span>
              <span className="hero-art-title">A thoughtful<br />deal, shared.</span>
              <span className="hero-art-foot"><span>Dealkey</span><span>Members only</span></span>
            </div>
          )}
        </Container>
      </section>

      <section className="section-tight">
        <Container><ShippingCutoffNotice time={settings.shippingCutoffTime} /></Container>
      </section>

      {categories.length > 1 ? (
        <section className="section-tight">
          <Container>
            <div className="category-nav">
              {categories.map((category) => (
                <Link key={category} href={`/products?category=${encodeURIComponent(category)}`} className="category-chip">
                  {category}
                </Link>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {embed ? (
        <section className="section-tight">
          <Container>
            <div className="hero-video">
              <iframe
                src={embed}
                title="소개 영상"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </Container>
        </section>
      ) : null}

      {byCategory.map((group) => (
        <section className="section-tight" key={group.category}>
          <Container>
            <div className="section-heading row">
              <div>
                <p className="eyebrow">CATEGORY</p>
                <h2>{group.category}</h2>
              </div>
              <Link href={`/products?category=${encodeURIComponent(group.category)}`} className="button button-ghost">
                더 보기
              </Link>
            </div>
            <div className="grid-4">
              {group.products.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} showPrice={catalog.priceVisible} />
              ))}
            </div>
          </Container>
        </section>
      ))}

      {catalog.products.length === 0 ? (
        <section className="section-tight">
          <Container><p className="muted">아직 등록된 상품이 없습니다.</p></Container>
        </section>
      ) : null}

      <section className="section">
        <Container>
          <SectionHeading
            eyebrow="HOW IT WORKS"
            title="추천에서 주문까지, 흐름을 투명하게."
            description="Referral Code는 누가 고객을 소개했는지 기록하고, Promotion Code는 어떤 판매조건을 적용할지 결정합니다. 두 데이터를 섞지 않습니다."
          />
          <div className="grid-3">
            <div className="card feature-card"><span className="feature-number">01</span><h3>코드로 입장</h3><p className="muted">초대받은 Referral Code로 가입하면 최초 추천인 귀속이 고정됩니다.</p></div>
            <div className="card feature-card"><span className="feature-number">02</span><h3>가격 확인</h3><p className="muted">추천 코드로 가입한 회원에게만 특판가와 판매 조건이 공개됩니다.</p></div>
            <div className="card feature-card"><span className="feature-number">03</span><h3>안전한 정산</h3><p className="muted">주문 당시 금액과 수수료율을 snapshot해 주문·추천·정산을 연결합니다.</p></div>
          </div>
        </Container>
      </section>

      {catalog.priceVisible ? null : (
        <section className="section">
          <Container className="two-column">
            <div>
              <p className="eyebrow">MEMBER ACCESS</p>
              <h2>초대 코드가 있나요?</h2>
              <p className="muted">코드를 입력하면 회원가입 후 특판가를 확인하고 주문할 수 있습니다.</p>
            </div>
            <ReferralGate compact />
          </Container>
        </section>
      )}
    </>
  );
}
