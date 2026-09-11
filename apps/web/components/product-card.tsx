import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@closed-commerce/types';
import { ProductPrice } from '@/components/product-price';

const DEFAULT_PRODUCT_IMAGE = '/brand/dealkey-mark-256.png';

/*
 * 목록·홈의 상품 카드에는 "담기"를 두지 않는다.
 *
 * 청약철회 제한 안내는 상세페이지의 구매 버튼 위에만 있다. 목록에서 바로 담을 수
 * 있으면 고객이 그 문구를 한 번도 보지 않고 결제까지 갈 수 있고, 그러면
 * 전자상거래법 제17조 제2항 단서의 "미리 명확하게 표시" 요건을 못 채운다.
 * 카드는 상세로 보내는 역할만 한다.
 */
export function ProductCard({ product, referralCode, showPrice = true, compact = false }: { product: Product; referralCode?: string; showPrice?: boolean; compact?: boolean }) {
  // 추천 코드는 링크에 붙이지 않아도 된다. 귀속은 가입 시 고정되고 서버가 세션에서 읽는다.
  const href = referralCode ? `/products/${product.slug}?ref=${encodeURIComponent(referralCode)}` : `/products/${product.slug}`;
  // 데모 카탈로그의 예시 경로가 없거나 이미지가 아직 등록되지 않은 상품도
  // 동일한 대표 이미지 자리에서 확인할 수 있게 브랜드 마크를 기본 이미지로 사용한다.
  const hasProductImage = /^https?:\/\//.test(product.imageUrl) || product.imageUrl.startsWith('/brand/');
  const imageUrl = hasProductImage ? product.imageUrl : DEFAULT_PRODUCT_IMAGE;
  return <article className={`card product-card${compact ? ' product-card-compact' : ''}`}>
    <Link href={href} className="product-visual" aria-label={`${product.name} 상세 보기`}>
      <Image className={`product-image${hasProductImage ? '' : ' placeholder'}`} src={imageUrl} alt={`${product.name} 대표 이미지`} fill sizes="(max-width: 850px) 50vw, 25vw" />
    </Link>
    <div className="product-body">
      <Link href={href} className="product-copy" title={product.name}>
        <span className="product-category">{product.category}</span>
        <h3 className="product-title">{product.name}</h3>
      </Link>
      {compact ? null : <p className="muted">{product.shortDescription}</p>}
      {compact ? null : <div className="product-tags">{product.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}
      <div className="product-meta">
        <ProductPrice product={product} showMemberPrice={showPrice} />
        <Link href={href} className="button button-secondary">상세 보기</Link>
      </div>
    </div>
  </article>;
}
