import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@closed-commerce/ui';

const LEGAL_LINKS: Array<[string, string]> = [
  ['/legal/terms', '이용약관'],
  ['/legal/privacy', '개인정보처리방침'],
  ['/legal/refund', '환불·교환 안내'],
];

/**
 * 법적 고지 페이지의 공통 뼈대.
 * 세 문서가 서로 오가야 하고(약관이 방침을 인용하는 식) 시행일 표기가 빠지면
 * 어느 버전에 동의한 것인지 다툼이 생긴다. 그래서 시행일을 구조에 넣는다.
 */
export function LegalLayout({
  title,
  effectiveDate,
  current,
  children,
}: {
  title: string;
  effectiveDate: string;
  current: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="page-header">
        <Container>
          <p className="breadcrumb"><Link href="/">HOME</Link> / {title}</p>
          <h1>{title}</h1>
          <p className="muted">시행일: {effectiveDate}</p>
        </Container>
      </section>
      <section className="section">
        <Container>
          <nav className="category-nav" aria-label="약관 문서">
            {LEGAL_LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={`category-chip${current === href ? ' active' : ''}`}>
                {label}
              </Link>
            ))}
          </nav>
          <article className="legal-doc">{children}</article>
        </Container>
      </section>
    </>
  );
}

/** 형님이 확정해야 채워지는 칸. 빈칸인 채로 조용히 배포되면 안 되니 눈에 띄게 남긴다. */
export function NeedsReview({ children }: { children: ReactNode }) {
  return <mark className="legal-todo">확인 필요 · {children}</mark>;
}
