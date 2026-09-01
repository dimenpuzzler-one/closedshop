import 'server-only';

import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient, getRequestUser } from '@/lib/supabase-server';
import type { SavedShippingAddress } from '@/lib/shipping-addresses';

export async function loadSavedAddresses(): Promise<SavedShippingAddress[]> {
  if (!hasSupabaseEnv()) return [];
  const user = await getRequestUser();
  if (!user) return [];

  const client = await createServerAppClient();
  const { data, error } = await client
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    postalCode: row.postal_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2 ?? '',
    deliveryMessage: row.delivery_message ?? '',
    isDefault: row.is_default,
    jibunAddress: row.jibun_address ?? '',
    buildingName: row.building_name ?? '',
    sido: row.sido ?? '',
    sigungu: row.sigungu ?? '',
    eupmyeondong: row.eupmyeondong ?? '',
    admCd: row.adm_cd ?? '',
    roadNameCode: row.road_name_code ?? '',
    buildingManagementNo: row.building_management_no ?? '',
  }));
}
