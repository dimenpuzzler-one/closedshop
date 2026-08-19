import { NextResponse } from 'next/server';
import { promotionCreateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const parsed = promotionCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Promotion 입력값이 올바르지 않습니다.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 Promotion Code가 생성되었습니다.', code: parsed.data.code.toUpperCase() });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: code, error: codeError } = await context.client.from('promotion_codes').insert({ code: parsed.data.code.toUpperCase(), total_usage_limit: parsed.data.totalUsageLimit ?? null, per_member_usage_limit: parsed.data.perMemberUsageLimit ?? null, status: 'active' }).select('id, code').single();
  if (codeError || !code) return NextResponse.json({ error: 'Promotion Code를 생성하지 못했습니다.' }, { status: 500 });
  const { error: ruleError } = await context.client.from('promotion_rules').insert({ promotion_code_id: code.id, minimum_order_amount: parsed.data.minimumOrderAmount ?? null, minimum_quantity: parsed.data.minimumQuantity ?? null, discount_rate: parsed.data.discountRate ?? null, discount_amount: parsed.data.discountAmount ?? null });
  if (ruleError) return NextResponse.json({ error: 'Promotion 조건을 저장하지 못했습니다.' }, { status: 500 });
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'promotion_code_created', entity_type: 'promotion_code', entity_id: code.id, after_data: parsed.data });
  return NextResponse.json({ message: 'Promotion Code가 생성되었습니다.', code });
}
