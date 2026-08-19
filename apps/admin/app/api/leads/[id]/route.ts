import { NextResponse } from 'next/server';
import { leadUpdateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = leadUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Lead 상태가 올바르지 않습니다.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 Lead 상태 변경이 처리되었습니다.' });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: before, error: readError } = await context.client.from('b2b_leads').select('id, status, company_name').eq('id', id).maybeSingle();
  if (readError || !before) return NextResponse.json({ error: 'Lead를 찾을 수 없습니다.' }, { status: 404 });
  const { error: updateError } = await context.client.from('b2b_leads').update({ status: parsed.data.status }).eq('id', id);
  if (updateError) return NextResponse.json({ error: 'Lead 상태를 변경하지 못했습니다.' }, { status: 500 });
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'lead_status_changed', entity_type: 'b2b_lead', entity_id: id, before_data: before, after_data: parsed.data });
  return NextResponse.json({ message: 'Lead 상태가 변경되었습니다.' });
}
