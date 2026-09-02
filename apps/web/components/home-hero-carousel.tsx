'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface HomeHeroSlide {
  eyebrow: string;
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  href?: string;
  ctaLabel?: string;
}

export function HomeHeroCarousel({ slides }: { slides: HomeHeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = slides.length;

  useEffect(() => {
    if (slideCount < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideCount);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  if (slideCount === 0) return null;

  const goTo = (index: number) => setActiveIndex((index + slideCount) % slideCount);

  return (
    <section className="home-hero" aria-roledescription="carousel" aria-label="딜키 소개 배너">
      <div className="home-hero-track">
        {slides.map((slide, index) => {
          const active = index === activeIndex;
          return (
            <article
              className={`home-hero-slide${active ? ' active' : ''}`}
              key={`${slide.eyebrow}-${slide.title}`}
              aria-hidden={!active}
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slideCount}`}
            >
              <div className="home-hero-copy">
                <p className="eyebrow">{slide.eyebrow}</p>
                <h1>{slide.title}</h1>
                <p className="hero-copy">{slide.description}</p>
                {slide.href ? (
                  <Link href={slide.href} className="button button-primary button-large" tabIndex={active ? 0 : -1}>
                    {slide.ctaLabel ?? '상품 둘러보기'}
                  </Link>
                ) : null}
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
            </article>
          );
        })}
      </div>
      {slideCount > 1 ? (
        <div className="home-hero-controls" aria-label="배너 선택">
          <button type="button" className="home-hero-arrow" onClick={() => goTo(activeIndex - 1)} aria-label="이전 배너">‹</button>
          <div className="home-hero-dots">
            {slides.map((slide, index) => (
              <button
                type="button"
                className={`home-hero-dot${index === activeIndex ? ' active' : ''}`}
                key={`${slide.eyebrow}-dot`}
                onClick={() => goTo(index)}
                aria-label={`${index + 1}번 배너 보기`}
                aria-current={index === activeIndex ? 'true' : undefined}
              />
            ))}
          </div>
          <button type="button" className="home-hero-arrow" onClick={() => goTo(activeIndex + 1)} aria-label="다음 배너">›</button>
        </div>
      ) : null}
    </section>
  );
}
