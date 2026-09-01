import { NextResponse } from 'next/server';
import { DEMO_REFERRAL_CODES } from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, hasServiceRoleEnv, resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { referralCodeSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body = (await request.json()) as { email?: string; password?: string; displayName?: string; referralCode?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };
    const email = body.email?.trim();
    const password = body.password;
    const displayName = body.displayName?.trim();
    const parsedCode = referralCodeSchema.safeParse({ code: body.referralCode ?? '' });
    if (!email || !password || !displayName || !parsedCode.success) {
      return NextResponse.json({ error: '이름, 이메일, 비밀번호, 유효한 Referral Code를 입력해 주세요.', requestId }, { status: 400 });
    }
    const normalizedCode = parsedCode.data.code.toUpperCase();

    const mode = resolveRuntimeMode({ requireServiceRole: false });
    if (mode === 'demo') {
      const demoCode = DEMO_REFERRAL_CODES.find((code) => code.code === normalizedCode && code.status === 'active');
      if (!demoCode) return NextResponse.json({ error: '유효하지 않거나 만료된 Referral Code입니다.', requestId }, { status: 400 });
      return NextResponse.json({ message: `[DEMO] 가입이 완료되었습니다. ${normalizedCode} 추천인 귀속이 고정됩니다.`, requestId });
    }
    if (mode === 'unavailable') {
      return NextResponse.json({ error: '가입 시스템 설정이 완료되지 않았습니다.', requestId }, { status: 503 });
    }

    /**
     * 귀속(referral_relationships) 저장은 계정 생성만큼 중요하다.
     * 예전에는 signUp 성공 후 귀속 저장이 실패해도 auth 사용자가 그대로 남았고,
     * 그 계정은 주문 시 403이 되며 같은 이메일로 재가입도 불가능한 상태가 됐다.
     * 서비스 롤 키가 없으면 이 실패가 사실상 확정이므로 아예 시작하지 않는다.
     */
    if (!hasServiceRoleEnv()) {
      logServerError('web.auth.signup', requestId, new Error('service role key missing'), { stage: 'precheck' });
      return NextResponse.json({ error: '가입 처리를 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.', requestId }, { status: 503 });
    }

    const supabase = await createServerAppClient();
    const adminClient = createServiceRoleSupabaseClient();

    // 추천 코드 조회는 서버 전용 클라이언트로 한다.
    // 예전에는 세션(익명) 클라이언트로 읽었고, 그래서 RLS가 anon에게
    // referral_codes 전체 SELECT를 허용해야만 했다 — 폐쇄몰의 초대코드 목록이
    // 공개 키로 열리는 상태였다. 이제 그 정책을 없앨 수 있다.
    const { data: referral } = await adminClient
      .from('referral_codes')
      .select('id, owner_user_id, starts_at, expires_at')
      .eq('code', normalizedCode)
      .eq('status', 'active')
      .maybeSingle();
    const now = Date.now();
    const withinWindow =
      referral &&
      (!referral.starts_at || new Date(referral.starts_at).getTime() <= now) &&
      (!referral.expires_at || new Date(referral.expires_at).getTime() >= now);
    if (!referral || !withinWindow) {
      return NextResponse.json({ error: '현재 사용할 수 없는 Referral Code입니다.', requestId }, { status: 400 });
    }

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? '회원가입에 실패했습니다.', requestId }, { status: 400 });
    }

    const { error: profileError } = await adminClient.from('profiles').upsert({ id: data.user.id, display_name: displayName, role: 'customer' });
    const { error: relationshipError } = profileError
      ? { error: null }
      : await adminClient.from('referral_relationships').insert({
          referred_user_id: data.user.id,
          referrer_user_id: referral.owner_user_id,
          referral_code_id: referral.id,
          source: 'link',
        });

    if (profileError || relationshipError) {
      logServerError('web.auth.signup', requestId, profileError ?? relationshipError, { stage: 'attach', userId: data.user.id });
      // 고아 계정을 남기지 않는다. 지우지 못하면 그 사실도 로그에 남긴다.
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (deleteError) logServerError('web.auth.signup', requestId, deleteError, { stage: 'rollback_delete_user', userId: data.user.id });
      return NextResponse.json(
        { error: '회원 프로필 또는 Referral 귀속을 저장하지 못했습니다. 다시 시도해 주세요.', requestId },
        { status: 503 },
      );
    }

    await adminClient.from('analytics_events').insert({
      user_id: data.user.id,
      event_name: 'signup',
      referral_code: normalizedCode,
      referrer_user_id: referral.owner_user_id,
      utm_source: body.utmSource?.trim() || null,
      utm_medium: body.utmMedium?.trim() || null,
      utm_campaign: body.utmCampaign?.trim() || null,
      properties: { source: 'web' },
    });
    logServerEvent('web.auth.signup', requestId, { stage: 'done', userId: data.user.id, referralCode: normalizedCode });

    return NextResponse.json({
      message: data.session ? '회원가입과 로그인이 완료되었습니다.' : '가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.',
      // 세션이 바로 생겼는지에 따라 화면이 갈린다.
      // 생겼으면 상품 목록으로 보내고, 아니면 "메일 확인" 안내를 남긴다.
      authenticated: Boolean(data.session),
      requestId,
    });
  } catch (error) {
    logServerError('web.auth.signup', requestId, error, { stage: 'unhandled' });
    return NextResponse.json({ error: '회원가입을 처리하지 못했습니다.', requestId }, { status: 500 });
  }
}
