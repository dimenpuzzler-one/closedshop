import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';

/*
 * 목록·홈의 상품 카드에는 "담기"를 두지 않는다.
 *
 * 청약철회 제한 안내는 상세페이지의 구매 버튼 위에만 있다. 목록에서 바로 담을 수
 * 있으면 고객이 그 문구를 한 번도 보지 않고 결제까지 갈 수 있고, 그러면
 * 전자상거래법 제17조 제2항 단서의 "미리 명확하게 표시" 요건을 못 채운다.
 * 카드는 상세로 보내는 역할만 한다.
 */
export function ProductCard({ product, referralCode, showPrice = true }: { product: Product; referralCode?: string; showPrice?: boolean }) {
  // 추천 코드는 링크에 붙이지 않아도 된다. 귀속은 가입 시 고정되고 서버가 세션에서 읽는다.
  const href = referralCode ? `/products/${product.slug}?ref=${encodeURIComponent(referralCode)}` : `/products/${product.slug}`;
  return <article className="card product-card">
    <Link href={href} className="product-visual" aria-label={`${product.name} 상세 보기`}>
      {product.imageUrl ? <Image className="product-image" src={product.imageUrl} alt={product.name} fill sizes="(max-width: 850px) 50vw, 25vw" /> : null}
      <span className="product-weight">{product.weight}</span>
    </Link>
    <div className="product-body">
      <Link href={href}><span className="product-category">{product.category}</span><h3>{product.name}</h3></Link>
      <p className="muted">{product.shortDescription}</p>
      <div className="product-tags">{product.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <div className="product-meta">
        {showPrice
          ? <span className="product-price"><Price amount={product.options[0]?.price ?? product.price} /></span>
          : <span className="product-price muted">회원 전용 가격</span>}
        <Link href={href} className="button button-secondary">상세 보기</Link>
      </div>
    </div>
  </article>;
}
