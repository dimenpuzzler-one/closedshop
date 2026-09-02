'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export interface HomeHeroSlide {
  id: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  imageAlt?: string;
  /** true면 좌우 분할 없이 이미지 한 장이 배너 전체를 차지한다. */
  imageOnly?: boolean;
}

export function HomeHeroCarousel({ slides, intervalSeconds = 6 }: { slides: HomeHeroSlide[]; intervalSeconds?: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = slides.length;
  const imageOnly = slides.every((slide) => slide.imageOnly && slide.imageUrl);
  const visibleIndex = activeIndex < slideCount ? activeIndex : 0;

  useEffect(() => {
    if (slideCount < 2) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideCount);
    }, Math.min(30, Math.max(2, intervalSeconds)) * 1000);
    return () => window.clearInterval(timer);
  }, [intervalSeconds, slideCount]);

  if (slideCount === 0) return null;

  const goTo = (index: number) => setActiveIndex((index + slideCount) % slideCount);

  return (
    <section className={`home-hero${imageOnly ? ' image-banners' : ''}`} aria-roledescription="carousel" aria-label="딜키 소개 배너">
      <div className="home-hero-track">
        {slides.map((slide, index) => {
          const active = index === visibleIndex;
          return (
            <article
              className={`home-hero-slide${slide.imageOnly ? ' image-only' : ''}${active ? ' active' : ''}`}
              key={slide.id}
              aria-hidden={!active}
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slideCount}`}
            >
              {slide.imageOnly && slide.imageUrl ? (
                <div className="home-hero-full-media">
                  <Image
                    src={slide.imageUrl}
                    alt={slide.imageAlt ?? ''}
                    fill
                    sizes="100vw"
                    priority={index === 0}
                    unoptimized
                  />
                </div>
              ) : (
                <>
                  <div className="home-hero-copy">
                    <p className="eyebrow">{slide.eyebrow}</p>
                    <h1>{slide.title}</h1>
                    <p className="hero-copy">{slide.description}</p>
                  </div>
                  <div className={`home-hero-media${slide.imageUrl ? '' : ' abstract'}`}>
                    {slide.imageUrl ? (
                      <Image
                        src={slide.imageUrl}
                        alt={slide.imageAlt ?? ''}
                        fill
                        sizes="(max-width: 850px) 100vw, 55vw"
                        priority={index === 0}
                        unoptimized
                      />
                    ) : (
                      <>
                        <span className="home-hero-media-label">DEALKEY</span>
                        <span className="home-hero-media-title">A thoughtful<br />deal, shared.</span>
                        <span className="home-hero-media-foot">Members only</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
      {slideCount > 1 ? (
        <div className="home-hero-controls" aria-label="배너 선택">
          <button type="button" className="home-hero-arrow" onClick={() => goTo(visibleIndex - 1)} aria-label="이전 배너">‹</button>
          <div className="home-hero-dots">
            {slides.map((slide, index) => (
              <button
                type="button"
                className={`home-hero-dot${index === visibleIndex ? ' active' : ''}`}
                key={`${slide.id}-dot`}
                onClick={() => goTo(index)}
                aria-label={`${index + 1}번 배너 보기`}
                aria-current={index === visibleIndex ? 'true' : undefined}
              />
            ))}
          </div>
          <button type="button" className="home-hero-arrow" onClick={() => goTo(visibleIndex + 1)} aria-label="다음 배너">›</button>
        </div>
      ) : null}
    </section>
  );
}
