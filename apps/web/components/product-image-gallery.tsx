'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ProductImage } from '@closed-commerce/types';

interface ProductImageGalleryProps {
  images: ProductImage[];
  productName: string;
}

export function ProductImageGallery({ images, productName }: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const imageCount = images.length;
  const safeIndex = activeIndex < imageCount ? activeIndex : 0;
  const activeImage = images[safeIndex];

  if (!activeImage) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + imageCount) % imageCount);
  };

  return (
    <div className="product-image-gallery">
      <div className="product-hero-image product-gallery-stage">
        <Image
          key={activeImage.id}
          src={activeImage.url}
          alt={activeImage.altText || `${productName} 이미지 ${safeIndex + 1}`}
          fill
          sizes="(max-width: 850px) 100vw, 60vw"
          quality={95}
          priority={safeIndex === 0}
        />

        {imageCount > 1 ? (
          <>
            <button
              type="button"
              className="product-gallery-arrow previous"
              aria-label="이전 상품 이미지"
              onClick={() => move(-1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="product-gallery-arrow next"
              aria-label="다음 상품 이미지"
              onClick={() => move(1)}
            >
              <span aria-hidden="true">›</span>
            </button>
            <span className="product-gallery-counter" aria-live="polite">
              {safeIndex + 1} / {imageCount}
            </span>
          </>
        ) : null}
      </div>

      {imageCount > 1 ? (
        <div className="product-gallery-thumbnails" aria-label="상품 이미지 선택">
          {images.map((image, index) => (
            <button
              type="button"
              className={`product-gallery-thumbnail${index === safeIndex ? ' active' : ''}`}
              aria-label={`${productName} 이미지 ${index + 1} 보기`}
              aria-pressed={index === safeIndex}
              onClick={() => setActiveIndex(index)}
              key={image.id}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="76px"
                quality={80}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
