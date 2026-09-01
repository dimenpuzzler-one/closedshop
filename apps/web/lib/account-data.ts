import 'server-only';

import { DEMO_REFERRAL_CODES } from '@closed-commerce/commerce';
import {
  createServiceRoleSupabaseClient,
  hasServiceRoleEnv,
  hasSupabaseEnv,
} from '@closed-commerce/db';
import { createServerAppClient, getRequestUser } from '@/lib/supabase-server';

export type AccountDataSource =
  | 'supabase'
  | 'demo'
  | 'unavailable'
  | 'unauthenticated';

export interface MemberOrderItemSummary {
  productName: string;
  quantity: number;
}

export interface MemberOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paidAmount: number;
  createdAt: string;
  items: MemberOrderItemSummary[];
}

export interface MemberOrdersResult {
  orders: MemberOrderSummary[];
  totalCount: number;
}

export interface MemberReferralCode {
  id: string;
  code: string;
  label?: string;
  status: string;
  memberCount: number;
}

export interface MemberReferral {
  id: string;
  displayName: string;
  referralCode: string;
  referralLabel?: string;
  source: 'link' | 'manual' | 'admin';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  joinedAt: string;
}

export interface MemberCommissionSummary {
  pending: number;
  approved: number;
  payable: number;
  paid: number;
}

export interface MyPageData {
  source: AccountDataSource;
  profile: { displayName: string; email: string };
  orders: MemberOrdersResult;
  addressCount: number;
  defaultAddressLabel?: string;
  referralCodes: MemberReferralCode[];
  referrals: MemberReferral[];
  commissions: MemberCommissionSummary;
  referralNotice?: string;
}

const EMPTY_ORDERS: MemberOrdersResult = { orders: [], totalCount: 0 };
const EMPTY_COMMISSIONS: MemberCommissionSummary = {
  pending: 0,
  approved: 0,
  payable: 0,
  paid: 0,
};

const DEMO_ACCOUNT_DATA: MyPageData = {
  source: 'demo',
  profile: { displayName: '테스트 회원', email: 'tester@dealkey.co.kr' },
  orders: {
    totalCount: 1,
    orders: [
      {
        id: 'demo-order-1',
        orderNumber: 'DK20260901DEMO',
        status: 'delivered',
        paidAmount: 104000,
        createdAt: '2026-08-19T00:00:00.000Z',
        items: [{ productName: '한우 육포 선물세트 420g', quantity: 2 }],
      },
    ],
  },
  addressCount: 1,
  defaultAddressLabel: '우리집',
  referralCodes: [
    {
      id: DEMO_REFERRAL_CODES[0]?.id ?? 'demo-referral',
      code: DEMO_REFERRAL_CODES[0]?.code ?? 'KGY001',
      label: '데모 추천 코드',
      status: 'active',
      memberCount: 2,
    },
  ],
  referrals: [
    {
      id: 'demo-referral-member-1',
      displayName: '박*진',
      referralCode: DEMO_REFERRAL_CODES[0]?.code ?? 'KGY001',
      referralLabel: '데모 추천 코드',
      source: 'link',
      utmSource: 'demo',
      joinedAt: '2026-08-18T00:00:00.000Z',
    },
  ],
  commissions: { pending: 12000, approved: 0, payable: 0, paid: 0 },
};

/**
 * 로그인한 회원의 주문을 공통으로 읽는다. 주문 페이지와 마이페이지가
 * 서로 다른 조회·정렬 규칙을 갖지 않도록 한 곳에서 snapshot을 만든다.
 */
export async function loadMemberOrders(limit?: number): Promise<MemberOrdersResult | null> {
  if (!hasSupabaseEnv()) return null;
  const user = await getRequestUser();
  if (!user) return EMPTY_ORDERS;

  const client = await createServerAppClient();
  let query = client
    .from('orders')
    .select('id, order_number, status, paid_amount, created_at', { count: 'exact' })
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data: orders, count, error } = await query;
  if (error || !orders) return EMPTY_ORDERS;

  const orderIds = orders.map((order) => order.id);
  const { data: items } = orderIds.length
    ? await client
        .from('order_items')
        .select('order_id, product_name_snapshot, quantity')
        .in('order_id', orderIds)
    : { data: [] };
  const itemsByOrder = new Map<string, MemberOrderItemSummary[]>();
  (items ?? []).forEach((item) => {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push({ productName: item.product_name_snapshot, quantity: item.quantity });
    itemsByOrder.set(item.order_id, current);
  });

  return {
    totalCount: count ?? orders.length,
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paidAmount: order.paid_amount,
      createdAt: order.created_at,
      items: itemsByOrder.get(order.id) ?? [],
    })),
  };
}

function summarizeCommissions(
  rows: { commission_amount: number; status: string }[] | null,
): MemberCommissionSummary {
  const summary = { ...EMPTY_COMMISSIONS };
  (rows ?? []).forEach((row) => {
    if (row.status === 'pending') summary.pending += row.commission_amount;
    if (row.status === 'approved') summary.approved += row.commission_amount;
    if (row.status === 'payable') summary.payable += row.commission_amount;
    if (row.status === 'paid') summary.paid += row.commission_amount;
  });
  return summary;
}

/** 회원 본인에게 보여줄 계정 요약. 추천 유입 회원 이름은 service role로 읽되, 본인 관계로만 제한한다. */
export async function loadMyPageData(): Promise<MyPageData> {
  if (!hasSupabaseEnv()) return DEMO_ACCOUNT_DATA;

  const sessionClient = await createServerAppClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) {
    return {
      source: 'unauthenticated',
      profile: { displayName: '', email: '' },
      orders: EMPTY_ORDERS,
      addressCount: 0,
      referralCodes: [],
      referrals: [],
      commissions: EMPTY_COMMISSIONS,
    };
  }

  const userId = auth.user.id;
  // service role은 로그인 확인 후, 본인에게 귀속된 id만 조회하는 서버 코드에서만 쓴다.
  const readClient = hasServiceRoleEnv()
    ? createServiceRoleSupabaseClient()
    : sessionClient;
  const [
    { data: profile },
    { data: codeRows },
    { data: relationshipRows },
    { data: addressRows },
    { data: commissionRows },
    orders,
  ] = await Promise.all([
    sessionClient.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    readClient
      .from('referral_codes')
      .select('id, code, label, status, campaign_id, created_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false }),
    readClient
      .from('referral_relationships')
      .select('id, referred_user_id, referral_code_id, source, created_at')
      .eq('referrer_user_id', userId)
      .order('created_at', { ascending: false }),
    sessionClient
      .from('addresses')
      .select('id, label, is_default')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false }),
    sessionClient
      .from('commissions')
      .select('commission_amount, status')
      .eq('beneficiary_user_id', userId),
    loadMemberOrders(5),
  ]);

  const codes = codeRows ?? [];
  const relationships = relationshipRows ?? [];
  const referredIds = [...new Set(relationships.map((row) => row.referred_user_id))];
  const [{ data: referredProfiles }, { data: attributionRows }] = await Promise.all([
    referredIds.length
      ? readClient.from('profiles').select('id, display_name').in('id', referredIds)
      : Promise.resolve({ data: [] }),
    referredIds.length
      ? readClient
          .from('analytics_events')
          .select('user_id, event_name, referral_code, utm_source, utm_medium, utm_campaign, occurred_at')
          .eq('referrer_user_id', userId)
          .in('event_name', ['signup', 'landing'])
          .order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const codeById = new Map(codes.map((code) => [code.id, code]));
  const codeMemberCounts = new Map<string, number>();
  relationships.forEach((row) => {
    codeMemberCounts.set(row.referral_code_id, (codeMemberCounts.get(row.referral_code_id) ?? 0) + 1);
  });
  const profileById = new Map((referredProfiles ?? []).map((row) => [row.id, row.display_name ?? '회원']));
  const attributionByUser = new Map<string, {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }>();
  (attributionRows ?? []).forEach((row) => {
    if (!row.user_id || attributionByUser.has(row.user_id)) return;
    attributionByUser.set(row.user_id, {
      utmSource: row.utm_source ?? undefined,
      utmMedium: row.utm_medium ?? undefined,
      utmCampaign: row.utm_campaign ?? undefined,
    });
  });

  return {
    source: 'supabase',
    profile: {
      displayName: profile?.display_name ?? '회원',
      email: auth.user.email ?? '',
    },
    orders: orders ?? EMPTY_ORDERS,
    addressCount: addressRows?.length ?? 0,
    defaultAddressLabel: addressRows?.find((row) => row.is_default)?.label,
    referralCodes: codes.map((code) => ({
      id: code.id,
      code: code.code,
      label: code.label ?? undefined,
      status: code.status,
      memberCount: codeMemberCounts.get(code.id) ?? 0,
    })),
    referrals: relationships.map((row) => {
      const code = codeById.get(row.referral_code_id);
      const attribution = attributionByUser.get(row.referred_user_id);
      return {
        id: row.id,
        displayName: profileById.get(row.referred_user_id) ?? '회원',
        referralCode: code?.code ?? '확인 불가',
        referralLabel: code?.label ?? undefined,
        source: row.source,
        ...attribution,
        joinedAt: row.created_at,
      };
    }),
    commissions: summarizeCommissions(commissionRows),
    referralNotice: hasServiceRoleEnv()
      ? undefined
      : '서버 권한 설정이 없어 추천 유입 회원의 이름과 분석 정보가 제한될 수 있습니다.',
  };
}
