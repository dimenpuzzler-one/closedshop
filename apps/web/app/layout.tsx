import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY } from '@closed-commerce/config';
import { SiteHeader } from '@/components/site-header';
import { AttributionTracker } from '@/components/attribution-tracker';
import { Container } from '@closed-commerce/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dealkey | 초대받은 분을 위한 특판몰',
  description: '추천 코드로 입장하는 비공개 특판 선물몰',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko">
    {/*
      폰트를 globals.css의 @import로 걸었더니 두 페이지 모두 이게 가장 느린 리소스가 됐다
      (실측 181~188ms). @import는 globals.css를 먼저 받아 파싱한 뒤에야 발견되므로
      직렬로 이어붙는다. link로 올리면 HTML 파싱 중에 바로 발견돼 병렬로 나간다.
      next/font/google은 빌드 시점에 폰트를 받아와서 네트워크가 막힌 빌드 환경에서
      빌드 자체가 깨지므로 쓰지 않는다.

      아래 eslint 규칙은 pages/_document.js 기준으로 만들어진 것이고,
      App Router의 루트 layout에 넣은 link는 전 페이지에 적용된다. 여기서는 오탐이다.
    */}
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap"
      />
    </head>
    <body>
      <SiteHeader />
      <AttributionTracker />
      <main>{children}</main>
      <footer className="footer">
        <Container className="footer-inner">
          <div className="footer-company">
            <strong>{COMPANY.name} ({COMPANY.nameEn}) | 대표 {COMPANY.ceo}</strong>
            <span>사업자등록번호 {COMPANY.businessNumber} | 통신판매업 신고 제 {COMPANY.mailOrderNumber}호</span>
            <span>{COMPANY.address}</span>
            <span>
              고객센터 <a href={`tel:${COMPANY.phone}`}>{COMPANY.phone}</a> | <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </span>
          </div>
          {/* 예전에는 링크가 아니라 <span>이라 아무 데도 가지 않았다. 통신판매업자는 이 문서들을 실제로 제공해야 한다. */}
          <div className="footer-legal" aria-label="정책 안내">
            <Link href="/legal/terms">이용약관</Link>
            <span aria-hidden="true">|</span>
            <Link href="/legal/privacy"><strong>개인정보처리방침</strong></Link>
            <span aria-hidden="true">|</span>
            <Link href="/legal/refund">환불·교환 안내</Link>
          </div>
          <div className="footer-copy">© 2026 {COMPANY.nameEn}. All rights reserved.</div>
        </Container>
      </footer>
    </body>
  </html>;
}
