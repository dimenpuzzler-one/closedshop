import { NextResponse } from 'next/server';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError, newRequestId } from '@closed-commerce/observability';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST() {
  const requestId = newRequestId();
  try {
    if (resolveRuntimeMode({ requireServiceRole: false }) !== 'supabase') {
      return NextResponse.json({ message: '로그아웃되었습니다.', requestId });
    }
    const supabase = await createServerAppClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      logServerError('web.auth.logout', requestId, error);
      return NextResponse.json({ error: '로그아웃하지 못했습니다.', requestId }, { status: 500 });
    }
    return NextResponse.json({ message: '로그아웃되었습니다.', requestId });
  } catch (error) {
    logServerError('web.auth.logout', requestId, error);
    return NextResponse.json({ error: '로그아웃하지 못했습니다.', requestId }, { status: 500 });
  }
}
