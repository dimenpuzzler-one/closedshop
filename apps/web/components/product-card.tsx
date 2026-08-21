import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';
import { AddToCartButton } from './add-to-cart-button';

export function ProductCard({ product, referralCode = 'KGY001', interactive = true }: { product: Product; referralCode?: string; interactive?: boolean }) {
  return <article className="card product-card">
    <Link href={`/products/${product.slug}?ref=${encodeURIComponent(referralCode)}`} className="product-visual" aria-label={`${product.name} 상세 보기`}>
      {product.imageUrl ? <Image className="product-image" src={product.imageUrl} alt={product.name} fill sizes="(max-width: 850px) 50vw, 25vw" /> : null}
      <span className="product-weight">{product.weight}</span>
    </Link>
    <div className="product-body">
      <Link href={`/products/${product.slug}?ref=${encodeURIComponent(referralCode)}`}><span className="product-category">{product.category}</span><h3>{product.name}</h3></Link>
      <p className="muted">{product.shortDescription}</p>
      <div className="product-tags">{product.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <div className="product-meta">
        <span className="product-price"><Price amount={product.options[0]?.price ?? product.price} /></span>
        {interactive ? <AddToCartButton product={product} compact /> : <Link href={`/products/${product.slug}?ref=${encodeURIComponent(referralCode)}`} className="button button-secondary">상세 보기</Link>}
      </div>
    </div>
  </article>;
}
