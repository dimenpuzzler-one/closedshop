import { NextResponse } from 'next/server';
import { shippingSettingsSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const parsed = shippingSettingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '배송 마감 시간이 올바르지 않습니다.', details: parsed.error.flatten() }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 배송 마감 설정이 저장되었습니다.' });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { error } = await context.client.from('store_settings').upsert({ id: 1, shipping_cutoff_time: parsed.data.shippingCutoffTime }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: '배송 마감 설정을 저장하지 못했습니다.' }, { status: 500 });
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'store_settings_updated', entity_type: 'store_settings', entity_id: '1', after_data: parsed.data });
  return NextResponse.json({ message: `배송 마감 시간이 ${parsed.data.shippingCutoffTime}로 저장되었습니다.` });
}
