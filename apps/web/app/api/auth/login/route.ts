import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  if (!body.email || !body.password) return NextResponse.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
  if (!hasSupabaseEnv()) return NextResponse.json({ message: '데모 로그인되었습니다. 상품과 주문 흐름을 확인할 수 있습니다.' });
  const supabase = await createServerAppClient();
  const { error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error) return NextResponse.json({ error: '이메일 또는 비밀번호를 확인해 주세요.' }, { status: 401 });
  return NextResponse.json({ message: '로그인되었습니다.' });
}
