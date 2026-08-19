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
          <span>Closed Commerce · 비공개 특판 유통 플랫폼</span>
          <span>가격·배송·수수료 조건은 상품별로 달라질 수 있습니다.</span>
        </Container>
      </footer>
    </body>
  </html>;
}
