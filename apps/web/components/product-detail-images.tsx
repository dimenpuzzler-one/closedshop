'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ProductImage } from '@closed-commerce/types';

/**
 * 상세 이미지 영역.
 *
 * 상품 상세 이미지는 세로로 아주 긴 한 장인 경우가 많다(실제로 올라온 것은
 * 1000 x 13,400px). 그대로 두면 레이아웃이 세로 1만 픽셀을 미리 잡아
 * 스크롤바가 실오라기처럼 되고 "끝이 없는 페이지"로 느껴진다.
 *
 * 그래서 접은 상태에서는 높이를 잘라 두고, 잘린 이미지는 화면 밖에 있게 만든다.
 * 화면 밖에 있어야 loading="lazy"가 실제로 작동한다 — CSS로 높이만 자르면
 * 브라우저는 이미지를 그대로 다 내려받는다.
 */
export function ProductDetailImages({ images, productName }: { images: ProductImage[]; productName: string }) {
  const [expanded, setExpanded] = useState(false);
  if (images.length === 0) return null;

  return (
    <div className="product-detail-images-wrap">
      <div className={`product-detail-images${expanded ? '' : ' is-collapsed'}`}>
        {images.map((image, index) => (
          <div className="product-detail-image" key={image.id}>
            <Image
              src={image.url}
              alt={image.altText || `${productName} 상세 이미지 ${index + 1}`}
              width={image.width && image.width >= 600 ? image.width : 1000}
              height={image.width && image.width >= 600 ? (image.height ?? 1400) : 1400}
              sizes="(max-width: 850px) 100vw, 860px"
              // 전부 lazy로 둔다. 예전에는 첫 장만 eager였는데, 상품 이미지가
              // 대표 1장 + 상세 1장이면 그 "첫 장"이 바로 13,400px짜리였다.
              loading="lazy"
              // 원본이 이미 폭 1000px의 웹용 이미지라 서버에서 다시 만들 것이 없다.
              unoptimized
            />
          </div>
        ))}
        {expanded ? null : <div className="product-detail-fade" aria-hidden="true" />}
      </div>

      <button type="button" className="button button-ghost product-detail-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '상세정보 접기 ⌃' : '상세정보 더보기 ⌄'}
      </button>
    </div>
  );
}
