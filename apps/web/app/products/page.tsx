import { Container, SectionHeading } from '@closed-commerce/ui';
import { ProductCard } from '@/components/product-card';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadVisibleCatalog } from '@/lib/catalog-data';
import { loadShippingSettings } from '@/lib/store-settings';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referralCode = params.ref?.trim().toUpperCase();
  const [catalog, shipping] = await Promise.all([loadVisibleCatalog(referralCode), loadShippingSettings()]);
  const products = catalog.products;
  return <><section className="page-header"><Container><p className="breadcrumb">HOME / PRODUCTS</p><h1>Private product drop</h1><p className="muted">{catalog.authenticated ? <>추천 코드 {catalog.validReferralCode ? <strong>{catalog.validReferralCode}</strong> : '미입력 또는 유효하지 않음'}으로 연결된 회원 전용 상품입니다.</> : '가입·로그인 후 추천인 귀속 상품을 확인할 수 있습니다.'}</p></Container></section><section className="section"><Container><ShippingCutoffNotice time={shipping.shippingCutoffTime} />{products.length ? <><SectionHeading eyebrow="AVAILABLE NOW" title="이번 특판 상품" description="상품별 판매상태와 노출정책을 적용한 결과입니다." /><div className="grid-4">{products.map((product) => <ProductCard key={product.id} product={product} referralCode={catalog.validReferralCode} />)}</div></> : <ReferralGate />}</Container></section></>;
}
