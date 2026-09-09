import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@closed-commerce/ui';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { createServerAppClient, getRequestUser } from '@/lib/supabase-server';

/**
 * 헤더가 로그인 여부를 반영하지 않아서, 로그인한 회원에게도 계속 "로그인" 버튼이 보였다.
 * (가격은 보이는데 로그인 버튼이 있으니 로그인이 된 건지 알 수 없었다.)
 */
async function getViewerName(): Promise<string | null> {
  if (resolveRuntimeMode({ requireServiceRole: false }) !== 'supabase') return null;
  try {
    // getRequestUser는 같은 요청 안에서 캐시된다.
    // 예전에는 헤더가 카탈로그와 따로 auth.getUser()를 불러 인증 서버 왕복이 한 번 더 늘었다.
    const user = await getRequestUser();
    if (!user) return null;
    const client = await createServerAppClient();
    const { data: profile } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    return profile?.display_name ?? '회원';
  } catch {
    return null;
  }
}

export async function SiteHeader() {
  const viewerName = await getViewerName();
  return (
    <>
      <div className="announcement-bar"><Container className="announcement-inner"><span><span aria-hidden="true">⚿</span> 초대코드가 있으신가요? 회원 전용 가격이 열립니다.</span><Link href="/#member-access">초대코드 입력하기 <span aria-hidden="true">›</span></Link><small>오늘도 특별한 기회를, DEALKEY</small></Container></div>
      <header className="site-header">
        <Container className="header-inner">
          <Link href="/" className="brand" aria-label="딜키 홈">
            <span className="brand-mark">
              <Image src="/brand/dealkey-mark.png" alt="" width={36} height={33} priority />
            </span>
            <span className="brand-word">Dealkey</span>
          </Link>
          <nav className="nav" aria-label="주요 메뉴">
            <Link href="/products">상품 둘러보기</Link>
            <Link href="/b2b">기업·단체 견적</Link>
          </nav>
          <div className="header-actions">
            <Link href="/products" className="header-search" aria-label="상품 둘러보기"><span>찾고 있는 상품이 있나요?</span><span aria-hidden="true">⌕</span></Link>
            <Link href="/cart" className="button button-ghost header-cart"><span aria-hidden="true">🛒</span><span className="header-cart-label">장바구니</span></Link>
          {viewerName ? (
            <Link
              href="/account"
              className="header-viewer"
              aria-label={`${viewerName}님 마이페이지`}
              title="마이페이지"
            >
              <span>{viewerName}님</span>
              <small>마이페이지</small>
            </Link>
          ) : (
            <>
              <Link href="/#member-access" className="button button-ghost">회원가입</Link>
              <Link href="/login" className="button button-primary">로그인</Link>
            </>
          )}
          </div>
      </Container>
      </header>
    </>
  );
}
