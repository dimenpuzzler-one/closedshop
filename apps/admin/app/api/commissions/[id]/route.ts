import { NextResponse } from 'next/server';
import { commissionUpdateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

export const PATCH = withAdminParams<{ id: string }>(
  'admin.commissions.update',
  async ({ requestId, client, userId }, request, { id }) => {
    const parsed = commissionUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, 'Commission 상태가 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());

    const { data: before, error: readError } = await client
      .from('commissions')
      .select('id, status, commission_amount')
      .eq('id', id)
      .maybeSingle();
    if (readError) failFromSupabase('Commission을 조회하지 못했습니다.', readError, 'commission_read_failed');
    if (!before) throw new ApiError(404, `Commission을 찾을 수 없습니다: ${id}`, 'commission_not_found');

    const now = new Date().toISOString();
    const update = {
      status: parsed.data.status,
      ...(parsed.data.status === 'approved' || parsed.data.status === 'payable' ? { approved_at: now } : {}),
      ...(parsed.data.status === 'paid' ? { paid_at: now } : {}),
    };
    const { error: updateError } = await client.from('commissions').update(update).eq('id', id);
    if (updateError) failFromSupabase('Commission 상태를 변경하지 못했습니다.', updateError, 'commission_update_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'commission_status_changed',
      entity_type: 'commission',
      entity_id: id,
      before_data: before,
      after_data: { ...update, requestId },
    });
    return NextResponse.json({ message: `Commission 상태가 ${parsed.data.status}로 변경되었습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '정산 상태 변경이 처리되었습니다.' }) },
);
