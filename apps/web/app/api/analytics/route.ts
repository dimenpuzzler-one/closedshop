import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json() as { eventName?: string; referralCode?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; properties?: Record<string, string | number | boolean> };
  if (!body.eventName || body.eventName.length > 80) return NextResponse.json({ error: 'event가 올바르지 않습니다.' }, { status: 400 });
  if (!hasSupabaseEnv()) return NextResponse.json({ received: true, mode: 'demo' });
  const client = await createServerAppClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client.from('analytics_events').insert({ user_id: user.user?.id ?? null, event_name: body.eventName, referral_code: body.referralCode?.trim().toUpperCase() ?? null, utm_source: body.utmSource ?? null, utm_medium: body.utmMedium ?? null, utm_campaign: body.utmCampaign ?? null, properties: body.properties ?? {} });
  if (error) return NextResponse.json({ error: 'analytics event를 저장하지 못했습니다.' }, { status: 503 });
  return NextResponse.json({ received: true });
}
