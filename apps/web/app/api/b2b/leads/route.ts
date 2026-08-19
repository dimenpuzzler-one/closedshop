import { NextResponse } from 'next/server';
import { createAnalyticsEvent } from '@closed-commerce/analytics';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { b2bLeadSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const parsed = b2bLeadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '견적 요청 내용을 확인해 주세요.', details: parsed.error.flatten() }, { status: 400 });
  if (hasSupabaseEnv()) {
    const client = await createServerAppClient();
    const { data: user } = await client.auth.getUser();
    const { data: lead, error } = await client.from('b2b_leads').insert({ company_name: parsed.data.companyName, contact_name: parsed.data.contactName, phone: parsed.data.phone, email: parsed.data.email, requested_product: parsed.data.requestedProduct, quantity: parsed.data.quantity, desired_delivery_date: parsed.data.desiredDeliveryDate || null, budget: parsed.data.budget ?? null, memo: parsed.data.memo || null, status: 'new' }).select('id').single();
    if (error || !lead) return NextResponse.json({ error: '견적 요청을 저장하지 못했습니다.' }, { status: 503 });
    await client.from('analytics_events').insert({ user_id: user.user?.id ?? null, event_name: 'b2b_lead_created', properties: { quantity: parsed.data.quantity, source: 'web' } });
    return NextResponse.json({ message: '견적 요청이 접수되었습니다. 영업 담당자가 확인 후 연락드리겠습니다.', leadId: lead.id });
  }
  const lead = { id: `lead_${Date.now()}`, ...parsed.data, status: 'new' as const, createdAt: new Date().toISOString() };
  const event = createAnalyticsEvent('b2b_lead_created', { properties: { quantity: lead.quantity, source: 'web' } });
  void event;
  return NextResponse.json({ message: '견적 요청이 접수되었습니다. 영업 담당자가 확인 후 연락드리겠습니다.', leadId: lead.id });
}
