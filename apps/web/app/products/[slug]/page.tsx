import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Container, Price, Badge } from '@closed-commerce/ui';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ReferralGate } from '@/components/referral-gate';
import { ShippingCutoffNotice } from '@/components/shipping-cutoff-notice';
import { loadProductBySlug } from '@/lib/catalog-data';
import { loadShippingSettings } from '@/lib/store-settings';

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [catalog, shipping] = await Promise.all([loadProductBySlug(slug, query.ref?.trim().toUpperCase()), loadShippingSettings()]);
  const product = catalog.product;
  if (!product && !catalog.authenticated) {
    return <section className="section"><Container><div className="stack"><div><p className="eyebrow">MEMBER ACCESS</p><h1>상품 상세는 로그인 후 확인할 수 있어요.</h1><p className="muted">추천 코드로 가입한 뒤 로그인하면 특판 상품과 판매 조건을 확인할 수 있습니다.</p></div><ReferralGate /></div></Container></section>;
  }
  if (!product) notFound();
  const validReferral = catalog.validReferralCode;
  const images = product.images ?? [];
  return <><section className="page-header"><Container><p className="breadcrumb"><Link href={`/products?ref=${validReferral ?? ''}`}>PRODUCTS</Link> / {product.name}</p><h1>{product.name}</h1><p className="muted">{product.shortDescription}</p></Container></section><section className="section"><Container className="two-column"><div className="product-gallery">{images.length ? images.map((image, index) => <div className={`product-gallery-image ${index === 0 ? 'featured' : ''}`} key={image.id}><Image src={image.url} alt={image.altText || product.name} fill sizes={index === 0 ? '(max-width: 850px) 100vw, 60vw' : '(max-width: 850px) 50vw, 30vw'} /></div>) : <div className="hero-art" style={{ minHeight: 460 }}><span className="hero-art-label">PRIVATE DROP / {product.weight}</span><span className="hero-art-title">Premium<br />Jerky.</span><span className="hero-art-foot"><span>{product.tags.join(' · ')}</span><span>Limited stock</span></span></div>}</div><div className="stack"><ShippingCutoffNotice time={shipping.shippingCutoffTime} /><div className="card stack"><div className="row"><div className="row"><Badge tone="neutral">{product.category}</Badge><Badge tone="success">{product.visibility} access</Badge></div><span className="muted">재고 {product.options[0]?.stock ?? 0}개</span></div><h2>{product.name}</h2><p className="muted">{product.description}</p><div className="row"><span className="product-price"><Price amount={product.options[0]?.price ?? product.price} /></span><span className="muted">{product.weight}</span></div>{product.options.length > 0 ? <div className="product-option-list">{product.options.map((option) => <div className="row" key={option.id}><span>{option.name}: {option.value}</span><strong><Price amount={option.price} /></strong></div>)}</div> : null}<hr className="divider" /><p className="muted">{product.shippingFee ? `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원` : '무료배송'}</p>{validReferral ? <AddToCartButton product={product} /> : <ReferralGate compact />}</div><div className="notice">추천인 귀속과 결제 금액은 주문 생성 시점에 서버에서 검증·snapshot됩니다.</div></div></Container></section></>;
}
