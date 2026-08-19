import Link from 'next/link';
import { Container } from '@closed-commerce/ui';

export function SiteHeader() {
  return <header className="site-header">
    <Container className="header-inner">
      <Link href="/" className="brand"><span className="brand-mark">CC</span><span>Closed Commerce</span></Link>
      <nav className="nav" aria-label="주요 메뉴">
        <Link href="/products?ref=KGY001">상품 둘러보기</Link>
        <Link href="/b2b">기업·단체 견적</Link>
        <Link href="/account/orders">주문 조회</Link>
      </nav>
      <div className="header-actions">
        <Link href="/cart" className="button button-ghost">장바구니</Link>
        <Link href="/login" className="button button-primary">로그인</Link>
      </div>
    </Container>
  </header>;
}
