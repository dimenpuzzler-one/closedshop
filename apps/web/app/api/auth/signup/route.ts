import { NextResponse } from 'next/server';
import { DEMO_REFERRAL_CODES } from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, hasServiceRoleEnv, hasSupabaseEnv } from '@closed-commerce/db';
import { referralCodeSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string; displayName?: string; referralCode?: string };
  const email = body.email?.trim();
  const password = body.password;
  const displayName = body.displayName?.trim();
  const parsedCode = referralCodeSchema.safeParse({ code: body.referralCode ?? '' });
  if (!email || !password || !displayName || !parsedCode.success) return NextResponse.json({ error: '이름, 이메일, 비밀번호, 유효한 Referral Code를 입력해 주세요.' }, { status: 400 });
  const normalizedCode = parsedCode.data.code.toUpperCase();
  if (!hasSupabaseEnv()) {
    const demoCode = DEMO_REFERRAL_CODES.find((code) => code.code === normalizedCode && code.status === 'active');
    if (!demoCode) return NextResponse.json({ error: '유효하지 않거나 만료된 Referral Code입니다.' }, { status: 400 });
    return NextResponse.json({ message: `데모 가입이 완료되었습니다. ${normalizedCode} 추천인 귀속이 고정됩니다.` });
  }

  const supabase = await createServerAppClient();
  const { data: referral } = await supabase.from('referral_codes').select('id, owner_user_id').eq('code', normalizedCode).eq('status', 'active').maybeSingle();
  if (!referral) return NextResponse.json({ error: '현재 사용할 수 없는 Referral Code입니다.' }, { status: 400 });
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? '회원가입에 실패했습니다.' }, { status: 400 });
  const writeClient = data.session || !hasServiceRoleEnv() ? supabase : createServiceRoleSupabaseClient();
  const { error: profileError } = await writeClient.from('profiles').upsert({ id: data.user.id, display_name: displayName, role: 'customer' });
  const { error: relationshipError } = await writeClient.from('referral_relationships').insert({ referred_user_id: data.user.id, referrer_user_id: referral.owner_user_id, referral_code_id: referral.id, source: 'link' });
  if (profileError || relationshipError) return NextResponse.json({ error: '회원 프로필 또는 Referral 귀속을 저장하지 못했습니다.' }, { status: 503 });
  await writeClient.from('analytics_events').insert({ user_id: data.user.id, event_name: 'signup', referral_code: normalizedCode, referrer_user_id: referral.owner_user_id, properties: { source: 'web' } });
  return NextResponse.json({ message: data.session ? '회원가입과 로그인이 완료되었습니다.' : '가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.' });
}
