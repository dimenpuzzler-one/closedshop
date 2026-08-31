import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerClient } from '@supabase/ssr';

/**
 * 세션 쿠키 갱신.
 *
 * 예전에는 모든 요청에서 supabase.auth.getUser()를 불렀다. getUser()는 로컬에서
 * 토큰을 까보는 게 아니라 Supabase 인증 서버로 HTTP 검증 요청을 보낸다.
 * 실측(dealkey.co.kr, 서울):
 *
 *   _next/static (미들웨어 제외)      15ms
 *   /legal/terms 비로그인            451ms
 *   /legal/terms 로그인            1,027ms   <- 세션이 있다는 이유만으로 +576ms
 *   /products    로그인            2,348ms
 *
 * 정적 페이지가 1초 걸리는 건 페이지 내용과 무관한 비용이라는 뜻이다.
 * 그래서 두 가지를 바꾼다.
 *   1) 세션 쿠키가 아예 없으면 즉시 통과한다(비로그인 방문자는 갱신할 것이 없다).
 *   2) 쿠키가 있어도 access token 만료가 임박하지 않았으면 갱신을 건너뛴다.
 *
 * 만료 판단은 쿠키 안 JWT의 exp를 그대로 읽는다. 여기서 서명을 검증하지 않는 것은
 * 안전하다 — 이 값은 "지금 갱신할까"만 결정하고, 실제 인가는 페이지의 getUser()와
 * DB의 RLS가 한다. 위조된 토큰은 그쪽에서 걸린다.
 */

/** 만료까지 이 시간보다 적게 남았으면 갱신한다. */
const REFRESH_WINDOW_SECONDS = 10 * 60;

function decodeJwtExp(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Supabase 세션 쿠키에서 access token의 만료 시각을 꺼낸다.
 * 쿠키는 크기가 크면 .0 .1 처럼 쪼개져 저장되므로 이어붙여야 한다.
 * 형식을 못 읽으면 undefined를 돌려주고, 호출부는 안전한 쪽(갱신)으로 간다.
 */
function sessionExpiry(request: NextRequest): number | undefined {
  const parts = request.cookies
    .getAll()
    .filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) return undefined;

  let raw = parts.map((cookie) => cookie.value).join('');
  if (raw.startsWith('base64-')) {
    try {
      raw = atob(raw.slice('base64-'.length));
    } catch {
      return undefined;
    }
  }
  try {
    const parsed = JSON.parse(raw) as { access_token?: unknown; expires_at?: unknown };
    if (typeof parsed.expires_at === 'number') return parsed.expires_at;
    if (typeof parsed.access_token === 'string') return decodeJwtExp(parsed.access_token);
  } catch {
    return undefined;
  }
  return undefined;
}

export async function middleware(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  // 로그인하지 않은 방문자는 갱신할 세션이 없다. 당근·QR 유입 대부분이 여기에 해당한다.
  const expiresAt = sessionExpiry(request);
  if (expiresAt === undefined && request.cookies.getAll().every((c) => !c.name.startsWith('sb-'))) {
    return NextResponse.next();
  }
  // 아직 넉넉히 남았으면 인증 서버를 부르지 않는다. 만료 시각을 못 읽었을 때는 갱신한다.
  if (expiresAt !== undefined && expiresAt - Math.floor(Date.now() / 1000) > REFRESH_WINDOW_SECONDS) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
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
  await supabase.auth.getUser();
  return response;
}

/*
 * 정적으로 만들어지는 안내 문서와 robots/sitemap은 세션과 무관하다.
 * 미들웨어를 태우면 CDN에서 바로 줄 수 있는 것을 매번 함수로 돌리게 된다.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|brand/|legal/|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
