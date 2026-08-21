import Link from 'next/link';
import { DEMO_PRODUCTS } from '@closed-commerce/commerce';
import { Container, SectionHeading } from '@closed-commerce/ui';
import { ProductCard } from '@/components/product-card';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadShippingSettings } from '@/lib/store-settings';

export default async function HomePage() {
  const shipping = await loadShippingSettings();
  return <>
    <section className="hero"><Container className="hero-grid"><div><p className="eyebrow">PRIVATE SPECIALTY MARKET</p><h1>초대받은 분께만<br />열리는 선물몰.</h1><p className="hero-copy">좋은 상품을 알고 있는 사람이, 믿을 수 있는 사람에게 소개하는 비공개 특판 플랫폼입니다. 첫 상품은 명절용 프리미엄 육포 선물세트로 시작합니다.</p><div className="hero-actions"><Link href="/products?ref=KGY001" className="button button-primary button-large">추천 코드로 상품 보기</Link><Link href="/b2b" className="button button-ghost button-large">기업·단체 견적</Link></div><p className="hero-note">상품 가격과 판매 조건은 공개 검색에 노출하지 않습니다.</p></div><div className="hero-art"><span className="hero-art-label">CHUSEOK 2026 / PRIVATE DROP</span><span className="hero-art-title">A thoughtful<br />gift, shared.</span><span className="hero-art-foot"><span>Premium Jerky Set</span><span>300g — 600g</span></span></div></Container></section>
    <section className="section-tight"><Container><ShippingCutoffNotice time={shipping.shippingCutoffTime} /></Container></section>
    <section className="section"><Container><SectionHeading eyebrow="HOW IT WORKS" title="추천에서 주문까지, 흐름을 투명하게." description="Referral Code는 누가 고객을 소개했는지 기록하고, Promotion Code는 어떤 판매조건을 적용할지 결정합니다. 두 데이터를 섞지 않습니다." /><div className="grid-3"><div className="card feature-card"><span className="feature-number">01</span><h3>코드로 입장</h3><p className="muted">초대받은 Referral Code로 가입하면 최초 추천인 귀속이 고정됩니다.</p></div><div className="card feature-card"><span className="feature-number">02</span><h3>상품 선택</h3><p className="muted">회원에게만 공개되는 상품과 조건을 확인하고 필요한 수량을 담습니다.</p></div><div className="card feature-card"><span className="feature-number">03</span><h3>안전한 정산</h3><p className="muted">주문 당시 금액과 수수료율을 snapshot해 주문·추천·정산을 연결합니다.</p></div></div></Container></section>
    <section className="section-tight"><Container><div className="section-heading"><p className="eyebrow">FIRST DROP</p><h2>추석 육포 선물세트</h2><p className="muted">용도와 예산에 맞춰 300g부터 600g까지 준비했습니다.</p></div><div className="grid-4">{DEMO_PRODUCTS.map((product) => <ProductCard key={product.id} product={product} interactive={false} />)}</div></Container></section>
    <section className="section"><Container className="two-column"><div><p className="eyebrow">MEMBER ACCESS</p><h2>초대 코드가 있나요?</h2><p className="muted">코드를 입력하면 회원가입과 상품 접근을 이어서 진행할 수 있습니다.</p></div><ReferralGate compact /></Container></section>
  </>;
}
