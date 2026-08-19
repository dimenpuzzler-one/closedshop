import { NextResponse } from 'next/server';
import { commissionUpdateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = commissionUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Commission 상태가 올바르지 않습니다.' }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 관리자 정산 변경이 처리되었습니다.' });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: before, error: readError } = await context.client.from('commissions').select('id, status, commission_amount').eq('id', id).maybeSingle();
  if (readError || !before) return NextResponse.json({ error: 'Commission을 찾을 수 없습니다.' }, { status: 404 });
  const now = new Date().toISOString();
  const update = { status: parsed.data.status, ...(parsed.data.status === 'approved' || parsed.data.status === 'payable' ? { approved_at: now } : {}), ...(parsed.data.status === 'paid' ? { paid_at: now } : {}) };
  const { error: updateError } = await context.client.from('commissions').update(update).eq('id', id);
  if (updateError) return NextResponse.json({ error: 'Commission 상태를 변경하지 못했습니다.' }, { status: 500 });
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'commission_status_changed', entity_type: 'commission', entity_id: id, before_data: before, after_data: update });
  return NextResponse.json({ message: 'Commission 상태가 변경되었습니다.' });
}
