import { DEMO_PRODUCTS, DEMO_PROMOTIONS, DEMO_REFERRAL_CODES } from '@closed-commerce/commerce';
import type { AppSupabaseClient } from '@closed-commerce/db';
import type { B2BLead, Product, ProductImage, PromotionCode, ReferralCode } from '@closed-commerce/types';
import { requireAdminClient } from '@/lib/admin-auth';

export type AdminDataSource = 'supabase' | 'demo' | 'unavailable';
export const DEFAULT_SHIPPING_CUTOFF_TIME = '14:00';

type AdminGate =
  | { source: 'supabase'; client: AppSupabaseClient }
  | { source: 'demo' | 'unavailable'; client?: undefined };

/**
 * 예전에는 이 파일이 인증과 무관하게 service role 클라이언트를 직접 만들었다.
 * 권한 확인은 layout(AdminShell)에만 있었는데, App Router는 layout과 page를
 * 병렬로 실행하므로 비로그인 요청에서도 아래 조회들이 전부 실행됐다.
 * 이제 권한을 통과해야만 client가 나온다 — 인가와 권한 클라이언트를 타입으로 묶는다.
 */
async function adminGate(): Promise<AdminGate> {
  const result = await requireAdminClient();
  if (result.ok) return { source: 'supabase', client: result.client };
  return { source: result.mode === 'demo' ? 'demo' : 'unavailable' };
}

export async function loadAdminProducts(): Promise<{ source: AdminDataSource; products: Product[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, products: gate.source === 'demo' ? DEMO_PRODUCTS : [] };
  const client = gate.client;
  const { data: rows, error } = await client.from('products').select('id, slug, name, category, short_description, description, base_price, supply_cost, shipping_fee, visibility, status, created_at').order('created_at', { ascending: false });
  if (error || !rows) return { source: 'unavailable', products: [] };
  const productIds = rows.map((row) => row.id);
  const [{ data: options }, { data: inventories }, { data: imageRows }] = await Promise.all([
    productIds.length ? client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds) : Promise.resolve({ data: [] }),
    productIds.length ? client.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds) : Promise.resolve({ data: [] }),
    productIds.length ? client.from('product_images').select('id, product_id, storage_path, alt_text, sort_order, width, height, byte_size, mime_type, created_at').in('product_id', productIds).order('sort_order') : Promise.resolve({ data: [] }),
  ]);
  const stock = new Map((inventories ?? []).map((item) => [item.product_id, {
    quantity: item.quantity,
    reserved: item.reserved_quantity,
    available: Math.max(0, item.quantity - item.reserved_quantity),
  }]));
  const imagesByProduct = new Map<string, ProductImage[]>();
  (imageRows ?? []).forEach((image) => {
    const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl;
    const current = imagesByProduct.get(image.product_id) ?? [];
    current.push({
      id: image.id,
      url,
      altText: image.alt_text,
      sortOrder: image.sort_order,
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      byteSize: image.byte_size ?? undefined,
      mimeType: image.mime_type ?? undefined,
    });
    imagesByProduct.set(image.product_id, current);
  });
  return { source: 'supabase', products: rows.map((row) => {
    const images = imagesByProduct.get(row.id) ?? [];
    const productOptions = (options ?? []).filter((option) => option.product_id === row.id);
    const inventory = stock.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      shortDescription: row.short_description,
      description: row.description,
      weight: productOptions[0]?.value ?? '',
      basePrice: row.base_price,
      price: productOptions[0]?.price ?? row.base_price,
      supplyCost: row.supply_cost ?? undefined,
      shippingFee: row.shipping_fee,
      visibility: row.visibility,
      status: row.status,
      imageUrl: images[0]?.url ?? '',
      images,
      inventoryQuantity: inventory?.quantity ?? 0,
      reservedQuantity: inventory?.reserved ?? 0,
      options: productOptions.map((option) => ({
        id: option.id,
        name: option.name,
        value: option.value,
        price: option.price,
        stock: inventory?.available ?? 0,
      })),
      tags: [],
    };
  }) };
}

export async function loadStoreSettings(): Promise<{ source: AdminDataSource; shippingCutoffTime: string }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, shippingCutoffTime: DEFAULT_SHIPPING_CUTOFF_TIME };
  const client = gate.client;
  const { data, error } = await client.from('store_settings').select('shipping_cutoff_time').eq('id', 1).maybeSingle();
  if (error) return { source: 'unavailable', shippingCutoffTime: DEFAULT_SHIPPING_CUTOFF_TIME };
  return { source: 'supabase', shippingCutoffTime: data?.shipping_cutoff_time?.slice(0, 5) ?? DEFAULT_SHIPPING_CUTOFF_TIME };
}

export interface AdminOrderRow {
  id: string;
  number: string;
  buyer: string;
  item: string;
  amount: number;
  status: string;
  payment: string;
  ref: string;
  createdAt: string;
}

const demoOrders: AdminOrderRow[] = [
  { id: 'demo-1', number: 'CC-20260819-001', buyer: '김*현', item: '육포 420g × 2', amount: 104000, status: 'paid', payment: 'paid', ref: 'KGY001', createdAt: '2026-08-19' },
  { id: 'demo-2', number: 'CC-20260818-014', buyer: '박*진', item: '육포 600g × 1', amount: 72000, status: 'preparing', payment: 'paid', ref: 'LEE001', createdAt: '2026-08-18' },
  { id: 'demo-3', number: 'CC-20260818-011', buyer: '이*우', item: '육포 300g × 4', amount: 156000, status: 'shipped', payment: 'paid', ref: 'JIHYE01', createdAt: '2026-08-18' },
];

export async function loadAdminOrders(): Promise<{ source: AdminDataSource; orders: AdminOrderRow[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, orders: gate.source === 'demo' ? demoOrders : [] };
  const client = gate.client;
  const { data: orders, error } = await client.from('orders').select('id, order_number, buyer_user_id, referral_code, status, paid_amount, created_at').order('created_at', { ascending: false });
  if (error || !orders) return { source: 'unavailable', orders: [] };
  const orderIds = orders.map((order) => order.id);
  const [{ data: items }, { data: payments }, { data: profiles }] = await Promise.all([
    orderIds.length ? client.from('order_items').select('order_id, product_name_snapshot, quantity').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? client.from('payments').select('order_id, status').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    client.from('profiles').select('id, display_name').in('id', orders.map((order) => order.buyer_user_id)),
  ]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name ?? `${profile.id.slice(0, 6)}*`]));
  const paymentStatus = new Map((payments ?? []).map((payment) => [payment.order_id, payment.status]));
  return { source: 'supabase', orders: orders.map((order) => ({ id: order.id, number: order.order_number, buyer: names.get(order.buyer_user_id) ?? '회원', item: (items ?? []).filter((item) => item.order_id === order.id).map((item) => `${item.product_name_snapshot} × ${item.quantity}`).join(', '), amount: order.paid_amount, status: order.status, payment: paymentStatus.get(order.id) ?? 'pending', ref: order.referral_code ?? '—', createdAt: order.created_at })) };
}

export async function loadAdminReferralCodes(): Promise<{ source: AdminDataSource; codes: (ReferralCode & { members: number; l1Commission: number; l2Commission: number })[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, codes: gate.source === 'demo' ? DEMO_REFERRAL_CODES.map((code, index) => ({ ...code, members: [47, 31, 18][index] ?? 0, l1Commission: [102400, 52320, 44160][index] ?? 0, l2Commission: [19620, 0, 8400][index] ?? 0 })) : [] };
  const client = gate.client;
  const { data: codes, error } = await client.from('referral_codes').select('id, code, owner_user_id, campaign_id, status, starts_at, expires_at, created_at').order('created_at', { ascending: false });
  if (error || !codes) return { source: 'unavailable', codes: [] };
  const [{ data: relationships }, { data: commissions }, { data: profiles }] = await Promise.all([
    client.from('referral_relationships').select('referral_code_id'),
    client.from('commissions').select('beneficiary_user_id, depth, commission_amount'),
    client.from('profiles').select('id, display_name').in('id', codes.map((code) => code.owner_user_id)),
  ]);
  const memberCounts = new Map<string, number>();
  (relationships ?? []).forEach((relation) => memberCounts.set(relation.referral_code_id, (memberCounts.get(relation.referral_code_id) ?? 0) + 1));
  const commissionTotals = new Map<string, { l1: number; l2: number }>();
  (commissions ?? []).forEach((commission) => { const current = commissionTotals.get(commission.beneficiary_user_id) ?? { l1: 0, l2: 0 }; if (commission.depth === 1) current.l1 += commission.commission_amount; else current.l2 += commission.commission_amount; commissionTotals.set(commission.beneficiary_user_id, current); });
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name ?? profile.id]));
  return { source: 'supabase', codes: codes.map((code) => ({ id: code.id, code: code.code, ownerUserId: code.owner_user_id, ownerName: names.get(code.owner_user_id) ?? code.owner_user_id, campaignId: code.campaign_id ?? undefined, status: code.status, startsAt: code.starts_at ?? undefined, expiresAt: code.expires_at ?? undefined, members: memberCounts.get(code.id) ?? 0, l1Commission: commissionTotals.get(code.owner_user_id)?.l1 ?? 0, l2Commission: commissionTotals.get(code.owner_user_id)?.l2 ?? 0 })) };
}

export async function loadAdminPromotions(): Promise<{ source: AdminDataSource; promotions: PromotionCode[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, promotions: gate.source === 'demo' ? DEMO_PROMOTIONS : [] };
  const client = gate.client;
  const { data: codes, error } = await client.from('promotion_codes').select('id, code, status, starts_at, expires_at, total_usage_limit, per_member_usage_limit, usage_count').order('code');
  if (error || !codes) return { source: 'unavailable', promotions: [] };
  const { data: rules } = await client.from('promotion_rules').select('promotion_code_id, product_ids, referral_code_ids, minimum_order_amount, minimum_quantity, discount_rate, discount_amount').in('promotion_code_id', codes.map((code) => code.id));
  return { source: 'supabase', promotions: codes.map((code) => { const rule = (rules ?? []).find((candidate) => candidate.promotion_code_id === code.id); return { id: code.id, code: code.code, status: code.status, startsAt: code.starts_at ?? undefined, expiresAt: code.expires_at ?? undefined, totalUsageLimit: code.total_usage_limit ?? undefined, perMemberUsageLimit: code.per_member_usage_limit ?? undefined, usageCount: code.usage_count, rule: { productIds: rule?.product_ids ?? [], referralCodeIds: rule?.referral_code_ids ?? [], minimumOrderAmount: rule?.minimum_order_amount ?? undefined, minimumQuantity: rule?.minimum_quantity ?? undefined, discountRate: rule?.discount_rate ?? undefined, discountAmount: rule?.discount_amount ?? undefined } }; }) };
}

export async function loadAdminLeads(): Promise<{ source: AdminDataSource; leads: B2BLead[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, leads: gate.source === 'demo' ? [{ id: 'demo-lead-1', companyName: '그린파트너스', contactName: '박지훈', phone: '010-0000-0000', email: 'demo@example.com', requestedProduct: '육포 420g', quantity: 200, desiredDeliveryDate: '2026-09-10', status: 'new', createdAt: '2026-08-19' }] : [] };
  const client = gate.client;
  const { data, error } = await client.from('b2b_leads').select('id, company_name, contact_name, phone, email, requested_product, quantity, desired_delivery_date, budget, memo, status, created_at').order('created_at', { ascending: false });
  if (error || !data) return { source: 'unavailable', leads: [] };
  return { source: 'supabase', leads: data.map((lead) => ({ id: lead.id, companyName: lead.company_name, contactName: lead.contact_name, phone: lead.phone, email: lead.email, requestedProduct: lead.requested_product, quantity: lead.quantity, desiredDeliveryDate: lead.desired_delivery_date ?? undefined, budget: lead.budget ?? undefined, memo: lead.memo ?? undefined, status: lead.status, createdAt: lead.created_at })) };
}

export async function loadAdminSummary() {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, members: 128, sales: 2486000, payableCommission: 184200, leads: 7 };
  const client = gate.client;
  const [{ count: members }, { data: paidOrders }, { data: commissions }, { count: leads }] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('orders').select('paid_amount').eq('status', 'paid'),
    client.from('commissions').select('commission_amount, status').in('status', ['approved', 'payable']),
    client.from('b2b_leads').select('id', { count: 'exact', head: true }).neq('status', 'closed'),
  ]);
  return { source: 'supabase' as const, members: members ?? 0, sales: (paidOrders ?? []).reduce((sum, order) => sum + order.paid_amount, 0), payableCommission: (commissions ?? []).reduce((sum, commission) => sum + commission.commission_amount, 0), leads: leads ?? 0 };
}

export interface AdminSettlementRow { id: string; owner: string; depth: 1 | 2; base: number; rate: number; amount: number; status: string; createdAt: string }

export async function loadAdminSettlements(): Promise<{ source: AdminDataSource; settlements: AdminSettlementRow[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, settlements: gate.source === 'demo' ? [{ id: 'COM-001', owner: '김건엽', depth: 1, base: 1280000, rate: 0.08, amount: 102400, status: 'payable', createdAt: '2026-08-19' }, { id: 'COM-002', owner: '이정복', depth: 2, base: 654000, rate: 0.03, amount: 19620, status: 'payable', createdAt: '2026-08-19' }, { id: 'COM-003', owner: '지혜 파트너', depth: 1, base: 552000, rate: 0.08, amount: 44160, status: 'approved', createdAt: '2026-08-19' }] : [] };
  const client = gate.client;
  const { data: commissions, error } = await client.from('commissions').select('id, beneficiary_user_id, depth, commission_base, commission_rate, commission_amount, status, created_at').order('created_at', { ascending: false });
  if (error || !commissions) return { source: 'unavailable', settlements: [] };
  const { data: profiles } = await client.from('profiles').select('id, display_name').in('id', commissions.map((commission) => commission.beneficiary_user_id));
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name ?? profile.id]));
  return { source: 'supabase', settlements: commissions.map((commission) => ({ id: commission.id, owner: names.get(commission.beneficiary_user_id) ?? commission.beneficiary_user_id, depth: commission.depth, base: commission.commission_base, rate: commission.commission_rate, amount: commission.commission_amount, status: commission.status, createdAt: commission.created_at })) };
}

export interface AdminMemberRow {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  referrals: number;
  orders: number;
  sales: number;
  commission: number;
}

const demoMembers: AdminMemberRow[] = [
  { id: 'user-kgy', name: '김건엽', role: 'operator', createdAt: '2026-08-01', referrals: 47, orders: 22, sales: 1280000, commission: 102400 },
  { id: 'user-lee', name: '이정복', role: 'admin', createdAt: '2026-08-01', referrals: 31, orders: 14, sales: 654000, commission: 19620 },
  { id: 'user-jihye', name: '지혜 파트너', role: 'customer', createdAt: '2026-08-04', referrals: 18, orders: 9, sales: 552000, commission: 44160 },
];

export async function loadAdminMembers(): Promise<{ source: AdminDataSource; members: AdminMemberRow[] }> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return { source: gate.source, members: gate.source === 'demo' ? demoMembers : [] };
  const client = gate.client;
  const [{ data: profiles, error }, { data: relationships }, { data: orders }, { data: commissions }] = await Promise.all([
    client.from('profiles').select('id, display_name, role, created_at').order('created_at', { ascending: false }),
    client.from('referral_relationships').select('referrer_user_id'),
    client.from('orders').select('buyer_user_id, paid_amount, status'),
    client.from('commissions').select('beneficiary_user_id, commission_amount, status'),
  ]);
  if (error || !profiles) return { source: 'unavailable', members: [] };
  const referralCounts = new Map<string, number>();
  (relationships ?? []).forEach((row) => referralCounts.set(row.referrer_user_id, (referralCounts.get(row.referrer_user_id) ?? 0) + 1));
  const orderStats = new Map<string, { orders: number; sales: number }>();
  (orders ?? []).forEach((order) => {
    if (['cancelled', 'refunded'].includes(order.status)) return;
    const current = orderStats.get(order.buyer_user_id) ?? { orders: 0, sales: 0 };
    current.orders += 1;
    current.sales += order.paid_amount;
    orderStats.set(order.buyer_user_id, current);
  });
  const commissionTotals = new Map<string, number>();
  (commissions ?? []).forEach((commission) => {
    if (commission.status === 'reversed' || commission.status === 'cancelled') return;
    commissionTotals.set(commission.beneficiary_user_id, (commissionTotals.get(commission.beneficiary_user_id) ?? 0) + commission.commission_amount);
  });
  return { source: 'supabase', members: profiles.map((profile) => ({ id: profile.id, name: profile.display_name ?? profile.id, role: profile.role, createdAt: profile.created_at, referrals: referralCounts.get(profile.id) ?? 0, orders: orderStats.get(profile.id)?.orders ?? 0, sales: orderStats.get(profile.id)?.sales ?? 0, commission: commissionTotals.get(profile.id) ?? 0 })) };
}

export interface AdminReferralMetric { code: string; landings: number; signups: number; orders: number; sales: number }
export interface AdminChannelMetric { source: string; events: number }
export interface AdminAnalyticsData { source: AdminDataSource; funnel: { landings: number; signups: number; orders: number }; referrals: AdminReferralMetric[]; channels: AdminChannelMetric[] }

const demoAnalytics: AdminAnalyticsData = {
  source: 'demo',
  funnel: { landings: 412, signups: 128, orders: 45 },
  referrals: [
    { code: 'KGY001', landings: 168, signups: 47, orders: 22, sales: 1280000 },
    { code: 'LEE001', landings: 103, signups: 31, orders: 14, sales: 654000 },
    { code: 'JIHYE01', landings: 62, signups: 18, orders: 9, sales: 552000 },
  ],
  channels: [{ source: 'partner', events: 168 }, { source: 'email', events: 103 }, { source: 'direct', events: 141 }],
};

export async function loadAdminAnalytics(): Promise<AdminAnalyticsData> {
  const gate = await adminGate();
  if (gate.source !== 'supabase') return gate.source === 'demo' ? demoAnalytics : { source: gate.source, funnel: { landings: 0, signups: 0, orders: 0 }, referrals: [], channels: [] };
  const client = gate.client;
  const [{ data: events, error }, { data: orders }] = await Promise.all([
    client.from('analytics_events').select('event_name, referral_code, utm_source'),
    client.from('orders').select('referral_code, paid_amount, status'),
  ]);
  if (error || !events) return { source: 'unavailable', funnel: { landings: 0, signups: 0, orders: 0 }, referrals: [], channels: [] };
  const referralMap = new Map<string, AdminReferralMetric>();
  const channelMap = new Map<string, number>();
  let landings = 0;
  let signups = 0;
  events.forEach((event) => {
    if (event.event_name === 'landing') landings += 1;
    if (event.event_name === 'signup') signups += 1;
    const code = event.referral_code ?? '(direct)';
    const metric = referralMap.get(code) ?? { code, landings: 0, signups: 0, orders: 0, sales: 0 };
    if (event.event_name === 'landing') metric.landings += 1;
    if (event.event_name === 'signup') metric.signups += 1;
    referralMap.set(code, metric);
    const channel = event.utm_source ?? '(direct)';
    channelMap.set(channel, (channelMap.get(channel) ?? 0) + 1);
  });
  let orderCount = 0;
  (orders ?? []).forEach((order) => {
    if (['cancelled', 'refunded'].includes(order.status)) return;
    orderCount += 1;
    const code = order.referral_code ?? '(direct)';
    const metric = referralMap.get(code) ?? { code, landings: 0, signups: 0, orders: 0, sales: 0 };
    metric.orders += 1;
    metric.sales += order.paid_amount;
    referralMap.set(code, metric);
  });
  return { source: 'supabase', funnel: { landings, signups, orders: orderCount }, referrals: [...referralMap.values()].sort((a, b) => b.sales - a.sales), channels: [...channelMap.entries()].map(([sourceName, eventsCount]) => ({ source: sourceName, events: eventsCount })).sort((a, b) => b.events - a.events) };
}
