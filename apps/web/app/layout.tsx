import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { AttributionTracker } from '@/components/attribution-tracker';
import { Container } from '@closed-commerce/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Closed Commerce | 초대받은 분을 위한 특판몰',
  description: '추천 코드로 입장하는 비공개 특판 선물몰',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko">
    <body>
      <SiteHeader />
      <AttributionTracker />
      <main>{children}</main>
      <footer className="footer">
        <Container className="footer-inner">
          <div className="footer-company">
            <strong>도미니언 (Dominion) | 대표 이정복</strong>
            <span>사업자등록번호 818-06-03297 | 통신판매업 신고 제 2025-고양일산동-1946호</span>
            <span>경기도 고양시 일산동구 중앙로 1123, 제상가동 2층 207호</span>
            <span>고객센터 <a href="tel:010-4159-1942">010-4159-1942</a> | <a href="mailto:luxury194219@gmail.com">luxury194219@gmail.com</a></span>
          </div>
          <div className="footer-legal" aria-label="정책 안내">
            <span>이용약관</span><span aria-hidden="true">|</span><span>개인정보처리방침</span><span aria-hidden="true">|</span><span>환불·교환 안내</span>
          </div>
          <div className="footer-copy">© 2026 Dominion. All rights reserved.</div>
        </Container>
      </footer>
    </body>
  </html>;
}
