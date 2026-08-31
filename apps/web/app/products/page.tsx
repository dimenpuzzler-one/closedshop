import Link from 'next/link';
import { Container, SectionHeading } from '@closed-commerce/ui';
import { ProductCard } from '@/components/product-card';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadCategories, loadVisibleCatalog } from '@/lib/catalog-data';
import { loadStoreSettings } from '@/lib/store-settings';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; category?: string }>;
}) {
  const params = await searchParams;
  const referralCode = params.ref?.trim().toUpperCase();
  const category = params.category?.trim() || undefined;
  const [catalog, settings, categories] = await Promise.all([
    loadVisibleCatalog(referralCode, category),
    loadStoreSettings(),
    loadCategories(),
  ]);
  const products = catalog.products;

  return (
    <>
      <section className="page-header">
        <Container>
          <p className="breadcrumb">
            <Link href="/">HOME</Link> / PRODUCTS{category ? ` / ${category}` : ''}
          </p>
          <h1>{category ?? '전체 상품'}</h1>
          <p className="muted">
            {catalog.priceVisible ? (
              <>추천 코드 <strong>{catalog.validReferralCode}</strong>로 연결된 회원 특판가입니다.</>
            ) : (
              '가격은 추천 코드로 가입한 회원에게만 공개됩니다. 상품 구성과 상세 내용은 지금 보실 수 있습니다.'
            )}
          </p>
        </Container>
      </section>

      <section className="section">
        <Container>
          <ShippingCutoffNotice time={settings.shippingCutoffTime} />

          {categories.length > 0 ? (
            <div className="category-nav">
              <Link href="/products" className={`category-chip${category ? '' : ' active'}`}>전체</Link>
              {categories.map((name) => (
                <Link
                  key={name}
                  href={`/products?category=${encodeURIComponent(name)}`}
                  className={`category-chip${category === name ? ' active' : ''}`}
                >
                  {name}
                </Link>
              ))}
            </div>
          ) : null}

          {products.length ? (
            <>
              <SectionHeading
                eyebrow="AVAILABLE NOW"
                title={category ? `${category} 상품` : '이번 특판 상품'}
                description={`${products.length}개의 상품이 있습니다.`}
              />
              <div className="grid-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    referralCode={catalog.validReferralCode}
                    showPrice={catalog.priceVisible}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="muted">{category ? `${category} 카테고리에 아직 상품이 없습니다.` : '아직 등록된 상품이 없습니다.'}</p>
          )}

          {catalog.priceVisible ? null : (
            <div className="section-tight">
              <ReferralGate />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
