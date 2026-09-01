'use server';

import { revalidatePath } from 'next/cache';
import {
  savedAddressSchema,
  type SavedAddressInput,
} from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';

export type AddressActionResult =
  | { ok: true; addressId?: string }
  | { ok: false; error: string };

async function authenticatedClient() {
  const client = await createServerAppClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

function refreshAddressPages() {
  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
}

export async function saveShippingAddress(
  input: SavedAddressInput,
): Promise<AddressActionResult> {
  const parsed = savedAddressSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: '배송지 입력값을 확인해 주세요.' };

  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: '로그인 후 배송지를 저장해 주세요.' };

  const value = parsed.data;
  const addressValues = {
    label: value.label,
    recipient_name: value.recipientName,
    phone: value.phone,
    postal_code: value.postalCode,
    address_line1: value.addressLine1,
    address_line2: value.addressLine2,
    delivery_message: value.deliveryMessage || null,
    jibun_address: value.jibunAddress || null,
    building_name: value.buildingName || null,
    sido: value.sido || null,
    sigungu: value.sigungu || null,
    eupmyeondong: value.eupmyeondong || null,
    adm_cd: value.admCd || null,
    road_name_code: value.roadNameCode || null,
    building_management_no: value.buildingManagementNo || null,
  };
  const row = {
    ...addressValues,
    user_id: auth.userId,
    is_default: value.isDefault ?? false,
  };

  // A checkout can be retried after the payment window is closed. Reuse an exact
  // address instead of adding the same address on every retry.
  let duplicateQuery = auth.client
    .from('addresses')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('recipient_name', value.recipientName)
    .eq('phone', value.phone)
    .eq('postal_code', value.postalCode)
    .eq('address_line1', value.addressLine1)
    .limit(1);
  duplicateQuery = value.addressLine2
    ? duplicateQuery.eq('address_line2', value.addressLine2)
    : duplicateQuery.is('address_line2', null);
  const { data: duplicate } = await duplicateQuery.maybeSingle();

  if (duplicate) {
    const update = value.isDefault
      ? { ...addressValues, is_default: true }
      : addressValues;
    const { error } = await auth.client
      .from('addresses')
      .update(update)
      .eq('id', duplicate.id)
      .eq('user_id', auth.userId);
    if (error) return { ok: false, error: '배송지를 업데이트하지 못했습니다.' };
    refreshAddressPages();
    return { ok: true, addressId: duplicate.id };
  }

  const { data, error } = await auth.client
    .from('addresses')
    .insert(row)
    .select('id')
    .single();
  if (error || !data)
    return { ok: false, error: '배송지를 저장하지 못했습니다.' };
  refreshAddressPages();
  return { ok: true, addressId: data.id };
}

export async function setDefaultShippingAddress(
  addressId: string,
): Promise<AddressActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(addressId))
    return { ok: false, error: '배송지를 확인해 주세요.' };
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: '로그인이 필요합니다.' };

  const { data, error } = await auth.client
    .from('addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('user_id', auth.userId)
    .select('id')
    .maybeSingle();
  if (error || !data)
    return { ok: false, error: '기본 배송지를 변경하지 못했습니다.' };
  refreshAddressPages();
  return { ok: true, addressId: data.id };
}

export async function deleteShippingAddress(
  addressId: string,
): Promise<AddressActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(addressId))
    return { ok: false, error: '배송지를 확인해 주세요.' };
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: '로그인이 필요합니다.' };

  const { data, error } = await auth.client
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', auth.userId)
    .select('id')
    .maybeSingle();
  if (error || !data)
    return { ok: false, error: '배송지를 삭제하지 못했습니다.' };
  refreshAddressPages();
  return { ok: true };
}
