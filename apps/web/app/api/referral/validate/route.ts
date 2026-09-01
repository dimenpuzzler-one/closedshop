import { NextResponse } from 'next/server';
import { DEMO_REFERRAL_CODES } from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, hasServiceRoleEnv, resolveRuntimeMode } from '@closed-commerce/db';
import { newRequestId } from '@closed-commerce/observability';
import { findValidReferralCode } from '@closed-commerce/referral';
import { referralCodeSchema } from '@closed-commerce/validation';

/**
 * 회원가입 폼으로 넘어가기 전에 초대코드를 확인한다.
 * 가입 API에서도 같은 검사를 다시 수행한다(브라우저 검사는 UX 보조일 뿐 보안 경계가 아니다).
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const body = (await request.json()) as { code?: string };
    const parsed = referralCodeSchema.safeParse({ code: body.code ?? '' });
    if (!parsed.success) {
      return NextResponse.json({ error: '초대코드를 입력해 주세요.', requestId }, { status: 400 });
    }
    const normalizedCode = parsed.data.code.toUpperCase();
    const mode = resolveRuntimeMode({ requireServiceRole: false });

    if (mode === 'demo') {
      const valid = findValidReferralCode(DEMO_REFERRAL_CODES, normalizedCode);
      if (!valid) return NextResponse.json({ error: '현재 사용할 수 없는 초대코드입니다.', requestId }, { status: 400 });
      return withVerifiedReferralCookie(normalizedCode, requestId);
    }
    if (mode !== 'supabase' || !hasServiceRoleEnv()) {
      return NextResponse.json({ error: '가입 승인 시스템 설정이 완료되지 않았습니다.', requestId }, { status: 503 });
    }

    const adminClient = createServiceRoleSupabaseClient();
    const { data: referral, error } = await adminClient
      .from('referral_codes')
      .select('starts_at, expires_at')
      .eq('code', normalizedCode)
      .eq('status', 'active')
      .maybeSingle();
    if (error) return NextResponse.json({ error: '초대코드를 확인하지 못했습니다.', requestId }, { status: 503 });

    const now = Date.now();
    const withinWindow =
      referral &&
      (!referral.starts_at || new Date(referral.starts_at).getTime() <= now) &&
      (!referral.expires_at || new Date(referral.expires_at).getTime() >= now);
    if (!referral || !withinWindow) {
      return NextResponse.json({ error: '현재 사용할 수 없는 초대코드입니다.', requestId }, { status: 400 });
    }
    return withVerifiedReferralCookie(normalizedCode, requestId);
  } catch {
    return NextResponse.json({ error: '초대코드를 확인하지 못했습니다.', requestId }, { status: 500 });
  }
}

function withVerifiedReferralCookie(referralCode: string, requestId: string) {
  const response = NextResponse.json({ valid: true, referralCode, requestId });
  response.cookies.set('referral_signup_verified', referralCode, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: '/signup',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
