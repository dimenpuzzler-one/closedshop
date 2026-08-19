import { NextResponse } from 'next/server';
import { referralCreateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const parsed = referralCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Referral Code 입력값이 올바르지 않습니다.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 Referral Code가 생성되었습니다.', code: parsed.data.code.toUpperCase() });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: code, error } = await context.client.from('referral_codes').insert({ code: parsed.data.code.toUpperCase(), owner_user_id: parsed.data.ownerUserId, campaign_id: parsed.data.campaignId ?? null, status: 'active' }).select('id, code').single();
  if (error || !code) return NextResponse.json({ error: 'Referral Code를 생성하지 못했습니다.' }, { status: 500 });
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'referral_code_created', entity_type: 'referral_code', entity_id: code.id, after_data: parsed.data });
  return NextResponse.json({ message: 'Referral Code가 생성되었습니다.', code });
}
