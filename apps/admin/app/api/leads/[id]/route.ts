import { NextResponse } from 'next/server';
import { leadUpdateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

export const PATCH = withAdminParams<{ id: string }>(
  'admin.leads.update',
  async ({ requestId, client, userId }, request, { id }) => {
    const parsed = leadUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, 'Lead 상태가 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());

    const { data: before, error: readError } = await client.from('b2b_leads').select('id, status, company_name').eq('id', id).maybeSingle();
    if (readError) failFromSupabase('Lead를 조회하지 못했습니다.', readError, 'lead_read_failed');
    if (!before) throw new ApiError(404, `Lead를 찾을 수 없습니다: ${id}`, 'lead_not_found');

    const { error: updateError } = await client.from('b2b_leads').update({ status: parsed.data.status }).eq('id', id);
    if (updateError) failFromSupabase('Lead 상태를 변경하지 못했습니다.', updateError, 'lead_update_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'lead_status_changed',
      entity_type: 'b2b_lead',
      entity_id: id,
      before_data: before,
      after_data: { ...parsed.data, requestId },
    });
    return NextResponse.json({ message: `Lead 상태가 ${parsed.data.status}로 변경되었습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: 'Lead 상태 변경이 처리되었습니다.' }) },
);
