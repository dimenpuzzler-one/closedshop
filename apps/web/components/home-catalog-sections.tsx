import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';
import { ProductPrice } from '@/components/product-price';

const CATEGORY_META: Record<string, { icon: string; description: string }> = {
  선물세트: { icon: '🎁', description: '마음을 전하는 프리미엄 선물' },
  식품: { icon: '🥩', description: '신선하고 맛있는 먹거리' },
  건강: { icon: '🌿', description: '오늘도 건강한 하루' },
  생활: { icon: '☕', description: '일상을 더 특별하게' },
  뷰티: { icon: '✦', description: '아름다움을 위한 선택' },
  '기업·단체': { icon: '◆', description: '대량구매 · 맞춤 견적' },
};

const CATEGORY_FALLBACK = [
  { background: 'category-tone-sand', decoration: 'category-decor-bow' },
  { background: 'category-tone-red', decoration: 'category-decor-orb' },
  { background: 'category-tone-green', decoration: 'category-decor-leaf' },
  { background: 'category-tone-cream', decoration: 'category-decor-vase' },
  { background: 'category-tone-gold', decoration: 'category-decor-bottle' },
  { background: 'category-tone-slate', decoration: 'category-decor-box' },
];

const PRODUCT_FALLBACK = ['product-tone-red', 'product-tone-wine', 'product-tone-green', 'product-tone-citrus', 'product-tone-sand', 'product-tone-black'];

function usableImageUrl(url?: string): string | undefined {
  return url && (/^https?:\/\//.test(url) || url.startsWith('/brand/')) ? url : undefined;
}

function categoryMeta(name: string) {
  return CATEGORY_META[name] ?? { icon: '✦', description: '딜키가 엄선한 특별한 상품' };
}

export function categoryHref(name: string) {
  return `/products?category=${encodeURIComponent(name)}`;
}

export function HomeFeatureStrip() {
  const features = [
    ['🔥', '고민만 하는 사이 품절!'],
    ['🎁', '기간한정 파격 특가!'],
    ['♛', '선물하기 좋은 상품'],
    ['🌿', '건강한 라이프스타일'],
    ['◆', '지금 인기 상품!'],
    ['♥', '오직 회원만!'],
  ];
  return (
    <div className="home-feature-strip" aria-label="딜키 쇼핑 혜택">
      {features.map(([icon, label]) => <span className="home-feature-chip" key={label}><span aria-hidden="true">{icon}</span>{label}</span>)}
    </div>
  );
}

export function HomeCategoryGrid({ categories, products }: { categories: string[]; products: Product[] }) {
  const productCategoryNames = new Set(products.map((product) => product.category));
  // 상품에 남아 있는 예전/오타 카테고리는 운영 설정에 등록된 카테고리가
  // 아니므로 홈의 카테고리 카드에 다시 나타나면 안 된다.
  const names = [...new Set(categories)]
    .filter((name) => Boolean(name) && productCategoryNames.has(name))
    .slice(0, 6);
  if (names.length === 0) return null;

  return (
    <div className="home-category-grid">
      {names.map((name, index) => {
        const meta = categoryMeta(name);
        const categoryProduct = products.find((product) => product.category === name);
        const imageUrl = usableImageUrl(categoryProduct?.imageUrl);
        const fallback = CATEGORY_FALLBACK[index % CATEGORY_FALLBACK.length];
        if (!fallback) return null;
        return (
          <Link href={categoryHref(name)} className="home-category-card" key={name}>
            <span className={`home-category-art ${fallback.background}`}>
              {imageUrl ? <Image src={imageUrl} alt="" fill sizes="(max-width: 580px) 50vw, (max-width: 1100px) 33vw, 17vw" /> : <><span className={fallback.decoration} aria-hidden="true" /> <strong aria-hidden="true">{meta.icon}</strong></>}
            </span>
            <span className="home-category-copy"><strong>{name}</strong><small>{meta.description}</small></span>
            <span className="home-category-arrow" aria-hidden="true">›</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * 운영 설정에 등록된 카테고리 순서대로 상품을 나눠 보여준다.
 * catalog.products 자체가 home_sort_order 순으로 정렬되어 있으므로
 * 각 그룹에서도 운영자가 정한 상품 순서를 그대로 유지한다.
 */
export function HomeCategoryProductSections({
  categories,
  products,
  showPrice,
  referralCode,
}: {
  categories: string[];
  products: Product[];
  showPrice: boolean;
  referralCode?: string;
}) {
  const productByCategory = new Map<string, Product[]>();
  products.forEach((product) => {
    const current = productByCategory.get(product.category) ?? [];
    current.push(product);
    productByCategory.set(product.category, current);
  });

  const groups = [...new Set(categories)]
    .map((category) => ({ category, products: productByCategory.get(category) ?? [] }))
    .filter((group) => group.products.length > 0);

  if (groups.length === 0) {
    return <div className="home-empty-products">아직 등록된 상품이 없습니다.</div>;
  }

  return (
    <div className="home-category-product-sections">
      {groups.map((group) => (
        <section className="home-category-product-section" key={group.category}>
          <div className="home-section-title-row">
            <div>
              <p className="eyebrow">CATEGORY</p>
              <h2>{group.category}</h2>
              <p className="muted">이 카테고리에서 지금 만날 수 있는 상품입니다.</p>
            </div>
            <Link href={categoryHref(group.category)} className="button button-ghost">
              전체보기 <span aria-hidden="true">›</span>
            </Link>
          </div>
          <HomeProductGrid products={group.products} showPrice={showPrice} referralCode={referralCode} />
        </section>
      ))}
    </div>
  );
}

function HomeProductTile({ product, index, showPrice, referralCode, compact = false }: { product: Product; index: number; showPrice: boolean; referralCode?: string; compact?: boolean }) {
  const href = referralCode ? `/products/${product.slug}?ref=${encodeURIComponent(referralCode)}` : `/products/${product.slug}`;
  const imageUrl = usableImageUrl(product.imageUrl);
  const badge = index % 3 === 1 ? 'HOT' : index % 3 === 2 ? 'NEW' : 'BEST';
  const weight = product.weight || product.options[0]?.value;
  return (
    <article className={`home-product-tile${compact ? ' home-product-tile-compact' : ''}`}>
      <Link href={href} className={`home-product-art ${PRODUCT_FALLBACK[index % PRODUCT_FALLBACK.length]}`} aria-label={`${product.name} 상세 보기`}>
        {imageUrl ? <Image src={imageUrl} alt={product.name} fill sizes={compact ? '(max-width: 580px) 50vw, (max-width: 1100px) 33vw, 17vw' : '(max-width: 580px) 50vw, 25vw'} /> : <><span className="home-product-brand">DEALKEY</span><strong>{product.name}</strong><span className="home-product-shine" aria-hidden="true" /></>}
        {compact ? null : <span className="home-product-badge">{badge}</span>}
        <span className="home-product-heart" aria-hidden="true">♡</span>
      </Link>
      <div className="home-product-info">
        <Link href={href} className="home-product-name"><h3>{product.name}</h3></Link>
        {weight ? <p className="home-product-spec">{weight}</p> : null}
        <div className="home-product-footer">
          <ProductPrice product={product} showMemberPrice={showPrice} />
          {compact ? <span className="home-product-lock">▣ 회원 전용가</span> : <Link href={href} className="button button-secondary">상세 보기</Link>}
        </div>
      </div>
    </article>
  );
}

export function HomeProductGrid({ products, showPrice, referralCode, compact = false }: { products: Product[]; showPrice: boolean; referralCode?: string; compact?: boolean }) {
  if (products.length === 0) return <div className="home-empty-products">아직 등록된 상품이 없습니다.</div>;
  return <div className={`home-product-grid${compact ? ' home-product-grid-compact' : ''}`}>{products.map((product, index) => <HomeProductTile key={product.id} product={product} index={index} showPrice={showPrice} referralCode={referralCode} compact={compact} />)}</div>;
}

export function HomeMiniProduct({ product, showPrice, referralCode, index }: { product: Product; showPrice: boolean; referralCode?: string; index: number }) {
  const href = referralCode ? `/products/${product.slug}?ref=${encodeURIComponent(referralCode)}` : `/products/${product.slug}`;
  const imageUrl = usableImageUrl(product.imageUrl);
  return (
    <Link href={href} className="home-mini-product">
      <span className={`home-mini-art ${PRODUCT_FALLBACK[index % PRODUCT_FALLBACK.length]}`}>
        {imageUrl ? <Image src={imageUrl} alt="" fill sizes="120px" /> : <span aria-hidden="true">{product.category === '식품' ? '🥩' : product.category === '건강' ? '🌿' : '✦'}</span>}
      </span>
      <span className="home-mini-copy"><strong>{product.name}</strong><small>{showPrice ? <><span>회원가 </span><Price amount={product.basePrice ?? product.options[0]?.price ?? product.price} /></> : '회원 전용가'}</small></span>
    </Link>
  );
}
