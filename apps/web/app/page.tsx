import Link from 'next/link';
import { Container, SectionHeading } from '@closed-commerce/ui';
import { ProductCard } from '@/components/product-card';
import { ReferralGate } from '@/components/referral-gate';
import { HomeHeroCarousel, type HomeHeroSlide } from '@/components/home-hero-carousel';
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

  const heroSlides: HomeHeroSlide[] = [
    {
      eyebrow: 'PRIVATE SPECIALTY MARKET',
      title: headline,
      description: subheadline,
      imageUrl: settings.heroBannerUrl || usableImageUrl(catalog.products[0]?.imageUrl),
      imageAlt: headline.replace(/\n/g, ' '),
      href: '/products',
      ctaLabel: '상품 둘러보기',
    },
    {
      eyebrow: 'MEMBERS ONLY',
      title: '코드가 있는 분만\n입장할 수 있어요.',
      description: '딜키는 누구나를 위한 오픈몰이 아닙니다. 초대코드로 연결된 회원에게만 특판가와 주문을 공개합니다.',
      imageUrl: usableImageUrl(catalog.products[1]?.imageUrl),
      imageAlt: catalog.products[1]?.name,
      href: catalog.priceVisible ? '/products' : '#member-access',
      ctaLabel: catalog.priceVisible ? '상품 보러 가기' : '초대코드 확인하기',
    },
    {
      eyebrow: 'DEALKEY COLLECTION',
      title: '카테고리별로\n새로운 딜을 만나보세요.',
      description: '식품부터 생활용품까지, 믿을 수 있는 제휴 상품을 카테고리별로 모아 소개합니다.',
      imageUrl: usableImageUrl(catalog.products[2]?.imageUrl),
      imageAlt: catalog.products[2]?.name,
      href: '/products',
      ctaLabel: '전체 상품 보기',
    },
  ];

  // 카테고리 순서를 그대로 따르되, 상품이 하나도 없는 카테고리는 홈에 그리지 않는다.
  const byCategory = categories
    .map((category) => ({ category, products: catalog.products.filter((product) => product.category === category) }))
    .filter((group) => group.products.length > 0);
  const ungrouped = catalog.products.filter((product) => !categories.includes(product.category));
  if (ungrouped.length > 0) byCategory.push({ category: '기타', products: ungrouped });

  return (
    <>
      <section className="home-hero-section">
        <Container>
          <HomeHeroCarousel slides={heroSlides} />
        </Container>
      </section>

      <section className="section-tight home-access-section" id="member-access">
        <Container className="home-access-grid">
          <div>
            <p className="eyebrow">PRIVATE ACCESS</p>
            <h2>{catalog.priceVisible ? '딜키 회원 전용 상품을 보고 있어요.' : '초대코드가 있다면 바로 입장하세요.'}</h2>
            <p className="muted">
              {catalog.priceVisible
                ? '카테고리를 골라 상품을 둘러보고, 마음에 드는 상품의 상세 페이지에서 주문할 수 있습니다.'
                : '초대코드를 확인하면 가입 승인 후 특판가와 주문 기능이 열립니다.'}
            </p>
          </div>
          {!catalog.priceVisible ? <ReferralGate compact /> : <Link href="/products" className="button button-secondary button-large">상품 전체 보기</Link>}
        </Container>
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

      {byCategory.map((group) => (
        <section className="section home-product-section" key={group.category}>
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
                <ProductCard key={product.id} product={product} showPrice={catalog.priceVisible} compact />
              ))}
            </div>
          </Container>
        </section>
      ))}

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
