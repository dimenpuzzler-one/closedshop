import Link from 'next/link';
import { Container, SectionHeading } from '@closed-commerce/ui';
import { ReferralGate } from '@/components/referral-gate';
import { HomeHeroCarousel, type HomeHeroSlide } from '@/components/home-hero-carousel';
import { HomeCategoryGrid, HomeFeatureStrip, HomeMiniProduct, HomeProductGrid, categoryHref } from '@/components/home-catalog-sections';
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

/** 데모 카탈로그의 예시 경로가 실제 파일이 없을 때 빈 배너가 되지 않게 한다. */
function usableImageUrl(url?: string): string | undefined {
  return url && /^https?:\/\//.test(url) ? url : undefined;
}

export default async function HomePage() {
  // 예전에는 이 화면이 상품 4개를 고정 진열했다. 카테고리가 늘면 홈이 못 따라간다.
  const [settings, catalog, categories] = await Promise.all([
    loadStoreSettings(),
    loadVisibleCatalog(),
    loadCategories(),
  ]);

  const headline = settings.heroHeadline || '초대받은 분께만\n열리는 특판몰.';
  const subheadline =
    settings.heroSubheadline ||
    '좋은 상품을 아는 사람이, 믿을 수 있는 사람에게 소개하는 비공개 특판 플랫폼입니다.';
  const embed = toYoutubeEmbed(settings.heroYoutubeUrl);

  const fallbackSlides: HomeHeroSlide[] = [
    {
      id: 'private-specialty-market',
      eyebrow: 'PRIVATE SPECIALTY MARKET',
      title: headline,
      description: subheadline,
      imageUrl: usableImageUrl(catalog.products[0]?.imageUrl),
      imageAlt: headline.replace(/\n/g, ' '),
      primaryAction: { label: '회원가 열기', href: '#member-access' },
      secondaryAction: { label: '상품 둘러보기', href: '/products' },
    },
    {
      id: 'members-only',
      eyebrow: 'MEMBERS ONLY',
      title: '코드가 있는 분만\n입장할 수 있어요.',
      description: '딜키는 누구나를 위한 오픈몰이 아닙니다. 초대코드로 연결된 회원에게만 특판가와 주문을 공개합니다.',
      imageUrl: usableImageUrl(catalog.products[1]?.imageUrl),
      imageAlt: catalog.products[1]?.name,
      primaryAction: { label: '회원가 열기', href: '#member-access' },
      secondaryAction: { label: '상품 둘러보기', href: '/products' },
    },
    {
      id: 'dealkey-collection',
      eyebrow: 'DEALKEY COLLECTION',
      title: '카테고리별로\n새로운 딜을 만나보세요.',
      description: '식품부터 생활용품까지, 믿을 수 있는 제휴 상품을 카테고리별로 모아 소개합니다.',
      imageUrl: usableImageUrl(catalog.products[2]?.imageUrl),
      imageAlt: catalog.products[2]?.name,
      primaryAction: { label: '회원가 열기', href: '#member-access' },
      secondaryAction: { label: '상품 둘러보기', href: '/products' },
    },
  ];
  const configuredSlides: HomeHeroSlide[] = settings.homeBanners.map((banner) => ({
    id: banner.id,
    imageUrl: banner.imageUrl,
    imageAlt: banner.altText,
    imageOnly: true,
  }));
  const heroSlides = configuredSlides.length > 0 ? configuredSlides : fallbackSlides;

  const featuredProducts = catalog.products.slice(0, 4);
  const collectionProducts = catalog.products.slice(0, 6);
  const productCategories = [...new Set(catalog.products.map((product) => product.category))];

  return (
    <>
      <section className="home-hero-section">
        <Container className="home-hero-container">
          <HomeHeroCarousel slides={heroSlides} intervalSeconds={settings.heroSlideIntervalSeconds} />
        </Container>
      </section>

      <section className="home-features-section"><Container><HomeFeatureStrip /></Container></section>

      <section className="section home-category-section">
        <Container>
          <div className="home-section-title-row"><div><p className="eyebrow">CATEGORY</p><h2>지금 인기 카테고리</h2><p className="muted">소중한 사람을 위한 특별한 선택, 딜키가 제안합니다.</p></div><Link href="/products" className="button button-ghost">전체보기 <span aria-hidden="true">›</span></Link></div>
          <HomeCategoryGrid categories={categories} products={catalog.products} />
        </Container>
      </section>

      <section className="section home-best-section">
        <Container>
          <div className="home-section-title-row"><div><p className="eyebrow">BEST PRODUCTS</p><h2>지금 가장 인기 있는 상품</h2><p className="muted">지금 사랑받는 베스트 상품을 특별한 회원가로 만나보세요.</p></div><Link href="/products" className="button button-ghost">전체보기 <span aria-hidden="true">›</span></Link></div>
          <HomeProductGrid products={featuredProducts} showPrice={catalog.priceVisible} referralCode={catalog.validReferralCode} />
        </Container>
      </section>

      <section className="section home-member-section" id="member-access">
        <Container>
          <div className="home-member-card">
            <div className="home-member-copy">
              <p className="eyebrow">SAME PRODUCT, A SPECIAL PRICE</p>
              <h2>회원가는 얼마나 다를까요?</h2>
              <p className="muted">지금 바로 비교해보세요. 딜키 회원만의 특별한 가격, 직접 확인해보세요.</p>
              {!catalog.priceVisible ? <ReferralGate compact /> : <Link href="/products" className="button button-primary button-large">회원가 상품 보기 <span aria-hidden="true">›</span></Link>}
            </div>
            <div className="home-mini-products" aria-label="인기 상품 미리보기">
              {featuredProducts.slice(0, 3).map((product, index) => <HomeMiniProduct key={product.id} product={product} showPrice={catalog.priceVisible} referralCode={catalog.validReferralCode} index={index} />)}
            </div>
          </div>
        </Container>
      </section>

      <section className="section home-steps-section">
        <Container>
          <div className="home-section-title-row home-steps-heading"><div><p className="eyebrow">딜키 이용 방법</p><h2>회원가가 열리는 4단계</h2><p className="muted">초대코드만 있으면, 특별한 가격이 기다리고 있습니다.</p></div></div>
          <div className="home-steps-grid">
            {[['01', '⌁', '초대코드 입력', '초대받은 코드를 입력하고 회원가입을 시작합니다.'], ['02', '♙', '회원가입', '간단한 정보로 딜키 회원이 되어주세요.'], ['03', '♙', '회원가 확인', '로그인하면 특별한 회원가가 열립니다.'], ['04', '🛒', '원하는 상품 주문', '특별한 가격으로 마음을 전해보세요.']].map(([number, icon, title, description]) => <div className="home-step" key={number}><span className="home-step-number">{number}</span><span className="home-step-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{description}</p></div>)}
          </div>
        </Container>
      </section>

      <section className="section home-collection-section">
        <Container>
          <div className="home-section-title-row"><div><p className="eyebrow">SPECIAL COLLECTION</p><h2>특별한 순간을 위한 추천 상품</h2><p className="muted">소중한 분께, 더 특별한 마음을 전해보세요.</p></div></div>
          <div className="home-collection-tabs"><Link className="active" href="/products">명절 선물 BEST</Link>{productCategories.slice(0, 5).map((category) => <Link key={category} href={categoryHref(category)}>{category}</Link>)}</div>
          <HomeProductGrid products={collectionProducts} showPrice={catalog.priceVisible} referralCode={catalog.validReferralCode} compact />
        </Container>
      </section>

      <section className="section home-business-section">
        <Container>
          <div className="home-business-card">
            <div><p className="eyebrow">BUSINESS SOLUTION</p><h2>기업·단체 견적</h2><p className="muted">입력한 수량, 납기, 예산을 바탕으로<br />딜키가 가장 합리적인 제안을 드립니다.</p><Link href="/b2b" className="button button-primary">견적 문의하기 <span aria-hidden="true">›</span></Link></div>
            <ul className="home-business-points"><li>대량구매 특별가</li><li>맞춤형 구성·견적</li><li>빠른 견적 상담</li><li>기업 전용 배송</li></ul>
            <div className="home-business-art"><span>소중한 마음이<br />더 큰 가치를 만듭니다.</span><strong>DEALKEY</strong></div>
          </div>
        </Container>
      </section>

      <section className="home-final-cta"><Container><div><h2>아직 회원가를 못 보셨나요?</h2><p>지금 초대코드를 입력하고, 딜키의 특별한 가격을 경험해보세요.</p></div>{!catalog.priceVisible ? <ReferralGate compact /> : <Link href="/products" className="button button-primary button-large">회원가 상품 보기 <span aria-hidden="true">›</span></Link>}</Container></section>

      {embed ? (
        <section className="section home-video-section">
          <Container>
            <SectionHeading eyebrow="DEALKEY STORY" title="딜키가 고른 상품 이야기" description="상품의 쓰임과 제휴 소식을 영상으로 만나보세요." />
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

      {catalog.products.length === 0 ? (
        <section className="section-tight">
          <Container><p className="muted">아직 등록된 상품이 없습니다.</p></Container>
        </section>
      ) : null}

    </>
  );
}
