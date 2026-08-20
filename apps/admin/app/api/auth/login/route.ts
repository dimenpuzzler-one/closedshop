import { NextResponse } from 'next/server';
import { canAccessAdmin, getProfileRole } from '@closed-commerce/auth';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.json({ message: '데모 관리자 로그인입니다.' });
  const body = await request.json() as { loginId?: string; email?: string; password?: string };
  const loginId = body.loginId?.trim() || body.email?.trim();
  if (!loginId || !body.password) return NextResponse.json({ error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 });
  const email = loginId.includes('@') ? loginId : `${loginId}@${process.env.ADMIN_LOGIN_EMAIL_DOMAIN ?? 'dealkey.co.kr'}`;
  const client = await createServerAppClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: body.password });
  if (error || !data.user) return NextResponse.json({ error: '이메일 또는 비밀번호를 확인해 주세요.' }, { status: 401 });
  const role = await getProfileRole(client, data.user.id);
  if (!canAccessAdmin(role)) { await client.auth.signOut(); return NextResponse.json({ error: '관리자 권한이 없습니다.' }, { status: 403 }); }
  return NextResponse.json({ message: '관리자 로그인되었습니다.' });
}
