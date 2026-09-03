import type { Product } from '@closed-commerce/types';
import { Price } from '@closed-commerce/ui';

/**
 * 상품의 공개 기준가와 회원가를 한 곳에서 표현한다.
 * 비로그인 방문자에게는 회원가를 보내지 않고, 서버가 유지한 온라인가만 표시한다.
 */
export function ProductPrice({ product, showMemberPrice }: { product: Product; showMemberPrice: boolean }) {
  const onlinePrice = product.onlinePrice ?? 0;
  const memberPrice = product.basePrice ?? product.options[0]?.price ?? product.price;
  const hasOnlinePrice = onlinePrice > 0;
  const hasMemberPrice = memberPrice > 0;
  const hasDiscount = showMemberPrice && hasOnlinePrice && hasMemberPrice && onlinePrice > memberPrice;

  if (!showMemberPrice) {
    return (
      <div className="product-pricing">
        {hasOnlinePrice ? (
          <span className="product-price online-price online-price-reference">
            <span className="price-label">온라인 기준가</span>
            <Price amount={onlinePrice} />
          </span>
        ) : (
          <span className="product-price muted">온라인 기준가 준비 중</span>
        )}
        <span className="price-member-hint">회원가입 후 회원가 확인</span>
      </div>
    );
  }

  return (
    <div className="product-pricing">
      {hasDiscount ? (
        <span className="product-price online-price discounted">
          <span className="price-label">온라인 기준가</span>
          <Price amount={onlinePrice} />
        </span>
      ) : null}
      {hasMemberPrice ? (
        <span className="product-price member-price">
          <span className="price-label">회원가</span>
          <Price amount={memberPrice} />
        </span>
      ) : (
        <span className="product-price muted">회원가 준비 중</span>
      )}
    </div>
  );
}
