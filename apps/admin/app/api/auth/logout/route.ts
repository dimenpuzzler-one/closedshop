import { NextResponse } from 'next/server';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError, newRequestId } from '@closed-commerce/observability';
import { createServerAppClient } from '@/lib/supabase-server';

/**
 * 관리자 세션을 Supabase Auth에서 종료하고 로그인 화면으로 돌아간다.
 * 쿠키만 지우는 방식은 서버 세션이 남을 수 있으므로 반드시 signOut을 호출한다.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    if (resolveRuntimeMode({ requireServiceRole: false }) === 'supabase') {
      const supabase = await createServerAppClient();
      const { error } = await supabase.auth.signOut();
      if (error) logServerError('admin.auth.logout', requestId, error);
    }
  } catch (error) {
    // 로그아웃은 실패하더라도 로그인 화면으로 보내서 재인증을 유도한다.
    logServerError('admin.auth.logout', requestId, error);
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('loggedOut', '1');
  return NextResponse.redirect(loginUrl, { status: 303 });
}
