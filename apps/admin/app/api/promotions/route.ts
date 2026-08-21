import { NextResponse } from 'next/server';
import { promotionCreateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

export const POST = withAdmin(
  'admin.promotions.create',
  async ({ requestId, client, userId }, request) => {
    const parsed = promotionCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? 'Promotion 입력값이 올바르지 않습니다.',
        'validation_failed',
        parsed.error.flatten(),
      );
    }
    const code = parsed.data.code.toUpperCase();
    const { data: created, error: codeError } = await client
      .from('promotion_codes')
      .insert({
        code,
        total_usage_limit: parsed.data.totalUsageLimit ?? null,
        per_member_usage_limit: parsed.data.perMemberUsageLimit ?? null,
        status: 'active',
      })
      .select('id, code')
      .single();
    if (codeError || !created) {
      if (codeError?.code === '23505') throw new ApiError(409, `이미 존재하는 Promotion Code입니다: ${code}`, 'duplicate_code');
      failFromSupabase('Promotion Code를 생성하지 못했습니다.', codeError, 'promotion_insert_failed');
    }

    const { error: ruleError } = await client.from('promotion_rules').insert({
      promotion_code_id: created.id,
      minimum_order_amount: parsed.data.minimumOrderAmount ?? null,
      minimum_quantity: parsed.data.minimumQuantity ?? null,
      discount_rate: parsed.data.discountRate ?? null,
      discount_amount: parsed.data.discountAmount ?? null,
    });
    if (ruleError) {
      // 조건 없는 Promotion Code가 남으면 주문 시 "조건을 찾을 수 없습니다"로 실패한다. 되돌린다.
      await client.from('promotion_codes').delete().eq('id', created.id);
      failFromSupabase('Promotion 조건을 저장하지 못했습니다. 코드 생성은 취소되었습니다.', ruleError, 'promotion_rule_insert_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'promotion_code_created',
      entity_type: 'promotion_code',
      entity_id: created.id,
      after_data: { ...parsed.data, requestId },
    });
    return NextResponse.json({ message: `Promotion Code ${created.code}가 생성되었습니다.`, code: created, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: 'Promotion Code가 생성되었습니다.' }) },
);
