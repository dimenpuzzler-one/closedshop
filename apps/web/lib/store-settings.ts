import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export const DEFAULT_SHIPPING_CUTOFF_TIME = '14:00';

export async function loadShippingSettings(): Promise<{ shippingCutoffTime: string }> {
  if (!hasSupabaseEnv()) return { shippingCutoffTime: DEFAULT_SHIPPING_CUTOFF_TIME };
  const client = await createServerAppClient();
  const { data } = await client.from('store_settings').select('shipping_cutoff_time').eq('id', 1).maybeSingle();
  return { shippingCutoffTime: data?.shipping_cutoff_time?.slice(0, 5) ?? DEFAULT_SHIPPING_CUTOFF_TIME };
}
