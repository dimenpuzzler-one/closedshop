import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container, Price, Badge } from '@closed-commerce/ui';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ReferralGate } from '@/components/referral-gate';
import { loadProductBySlug } from '@/lib/catalog-data';

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const catalog = await loadProductBySlug(slug, query.ref?.trim().toUpperCase());
  const product = catalog.product;
  if (!product && !catalog.authenticated) {
    return <section className="section"><Container><div className="stack"><div><p className="eyebrow">MEMBER ACCESS</p><h1>상품 상세는 로그인 후 확인할 수 있어요.</h1><p className="muted">추천 코드로 가입한 뒤 로그인하면 특판 상품과 판매 조건을 확인할 수 있습니다.</p></div><ReferralGate /></div></Container></section>;
  }
  if (!product) notFound();
  const validReferral = catalog.validReferralCode;
  return <><section className="page-header"><Container><p className="breadcrumb"><Link href={`/products?ref=${validReferral ?? ''}`}>PRODUCTS</Link> / {product.name}</p><h1>{product.name}</h1><p className="muted">{product.shortDescription}</p></Container></section><section className="section"><Container className="two-column"><div className="hero-art" style={{ minHeight: 460 }}><span className="hero-art-label">PRIVATE DROP / {product.weight}</span><span className="hero-art-title">Premium<br />Jerky.</span><span className="hero-art-foot"><span>{product.tags.join(' · ')}</span><span>Limited stock</span></span></div><div className="stack"><div className="card stack"><div className="row"><Badge tone="success">{product.visibility} access</Badge><span className="muted">재고 {product.options[0]?.stock ?? 0}개</span></div><h2>{product.name}</h2><p className="muted">{product.description}</p><div className="row"><span className="product-price"><Price amount={product.price} /></span><span className="muted">{product.weight}</span></div><hr className="divider" /><p className="muted">{product.shippingFee ? `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원` : '무료배송'}</p>{validReferral ? <AddToCartButton product={product} /> : <ReferralGate compact />}</div><div className="notice">추천인 귀속과 결제 금액은 주문 생성 시점에 서버에서 검증·snapshot됩니다.</div></div></Container></section></>;
}
