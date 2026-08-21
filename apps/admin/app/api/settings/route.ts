import { NextResponse } from 'next/server';
import { shippingSettingsSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

export const POST = withAdmin(
  'admin.settings.update',
  async ({ requestId, client, userId }, request) => {
    const parsed = shippingSettingsSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, '배송 마감 시간이 올바르지 않습니다(HH:MM 형식).', 'validation_failed', parsed.error.flatten());
    }
    const { error } = await client
      .from('store_settings')
      .upsert({ id: 1, shipping_cutoff_time: parsed.data.shippingCutoffTime }, { onConflict: 'id' });
    if (error) failFromSupabase('배송 마감 설정을 저장하지 못했습니다.', error, 'settings_upsert_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'store_settings_updated',
      entity_type: 'store_settings',
      after_data: { ...parsed.data, requestId },
    });
    return NextResponse.json({ message: `배송 마감 시간이 ${parsed.data.shippingCutoffTime}로 저장되었습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '배송 마감 설정이 저장되었습니다.' }) },
);
