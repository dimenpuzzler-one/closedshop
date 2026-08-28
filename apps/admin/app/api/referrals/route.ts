import { NextResponse } from 'next/server';
import { referralCreateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

export const POST = withAdmin(
  'admin.referrals.create',
  async ({ requestId, client, userId }, request) => {
    const parsed = referralCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, 'Referral Code 입력값이 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }
    const code = parsed.data.code.toUpperCase();
    const { data: created, error } = await client
      .from('referral_codes')
      .insert({
        code,
        owner_user_id: parsed.data.ownerUserId,
        // 코드만 쌓이면 어느 게 릴스 광고용이고 어느 게 지인용인지 알 수 없다.
        label: parsed.data.label?.trim() || null,
        campaign_id: parsed.data.campaignId ?? null,
        status: 'active',
      })
      .select('id, code')
      .single();
    if (error || !created) {
      if (error?.code === '23505') throw new ApiError(409, `이미 존재하는 Referral Code입니다: ${code}`, 'duplicate_code');
      if (error?.code === '23503') throw new ApiError(400, '해당 User ID의 프로필이 없습니다. 먼저 회원 가입이 되어 있어야 합니다.', 'owner_not_found');
      failFromSupabase('Referral Code를 생성하지 못했습니다.', error, 'referral_insert_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'referral_code_created',
      entity_type: 'referral_code',
      entity_id: created.id,
      after_data: { ...parsed.data, requestId },
    });
    return NextResponse.json({ message: `Referral Code ${created.code}가 생성되었습니다.`, code: created, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: 'Referral Code가 생성되었습니다.' }) },
);
