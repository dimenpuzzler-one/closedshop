import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolveRuntimeMode } from '@closed-commerce/db';

/**
 * 관리자 인가가 layout(AdminShell)에만 있었다.
 * Next.js App Router는 layout과 page를 병렬로 실행하므로,
 * 비로그인 요청에서도 page의 service role 조회가 그대로 돌았다.
 * (화면에는 안 나오지만 DB는 매번 전체 스캔을 했다.)
 *
 * 미들웨어에서 세션 없는 요청을 먼저 끊어 그 경로 자체를 없앤다.
 * 역할(profiles.role) 확인은 DB 조회가 필요하므로 기존대로 layout/route에서 한다.
 */

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/robots.txt'];

export async function middleware(request: NextRequest) {
  const mode = resolveRuntimeMode({ requireServiceRole: true });
  if (mode === 'demo') return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // 운영에서 환경변수가 빠진 상태. 조용히 통과시키면 무인증 관리자 화면이 된다.
    return NextResponse.json({ error: '관리자 앱 환경변수가 설정되지 않았습니다.' }, { status: 503 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '관리자 로그인이 필요합니다.', code: 'unauthorized' }, { status: 401 });
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
