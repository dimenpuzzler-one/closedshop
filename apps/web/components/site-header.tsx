import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@closed-commerce/ui';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';
import { LogoutButton } from './logout-button';

/**
 * 헤더가 로그인 여부를 반영하지 않아서, 로그인한 회원에게도 계속 "로그인" 버튼이 보였다.
 * (가격은 보이는데 로그인 버튼이 있으니 로그인이 된 건지 알 수 없었다.)
 */
async function getViewerName(): Promise<string | null> {
  if (resolveRuntimeMode({ requireServiceRole: false }) !== 'supabase') return null;
  try {
    const client = await createServerAppClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await client.from('profiles').select('display_name').eq('id', data.user.id).maybeSingle();
    return profile?.display_name ?? data.user.email ?? '회원';
  } catch {
    return null;
  }
}

export async function SiteHeader() {
  const viewerName = await getViewerName();
  return (
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
          <Link href="/account/orders">주문 조회</Link>
        </nav>
        <div className="header-actions">
          <Link href="/cart" className="button button-ghost">장바구니</Link>
          {viewerName ? (
            <>
              <span className="muted header-viewer">{viewerName}님</span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="button button-primary">로그인</Link>
          )}
        </div>
      </Container>
    </header>
  );
}
