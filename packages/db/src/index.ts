import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update };

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        { id: string; display_name: string | null; role: 'customer' | 'operator' | 'admin'; created_at: string },
        { id: string; display_name?: string | null; role?: 'customer' | 'operator' | 'admin' },
        { display_name?: string | null; role?: 'customer' | 'operator' | 'admin' }
      >;
      addresses: Table<
        {
          id: string; user_id: string; label: string; recipient_name: string; phone: string; postal_code: string;
          address_line1: string; address_line2: string | null; delivery_message: string | null; is_default: boolean;
          jibun_address: string | null; building_name: string | null; sido: string | null; sigungu: string | null;
          eupmyeondong: string | null; adm_cd: string | null; road_name_code: string | null;
          building_management_no: string | null; created_at: string; updated_at: string;
        },
        {
          id?: string; user_id: string; label?: string; recipient_name: string; phone: string; postal_code: string;
          address_line1: string; address_line2?: string | null; delivery_message?: string | null; is_default?: boolean;
          jibun_address?: string | null; building_name?: string | null; sido?: string | null; sigungu?: string | null;
          eupmyeondong?: string | null; adm_cd?: string | null; road_name_code?: string | null;
          building_management_no?: string | null;
        },
        {
          label?: string; recipient_name?: string; phone?: string; postal_code?: string; address_line1?: string;
          address_line2?: string | null; delivery_message?: string | null; is_default?: boolean;
          jibun_address?: string | null; building_name?: string | null; sido?: string | null; sigungu?: string | null;
          eupmyeondong?: string | null; adm_cd?: string | null; road_name_code?: string | null;
          building_management_no?: string | null; updated_at?: string;
        }
      >;
      products: Table<
        { id: string; slug: string; name: string; category: string; short_description: string; description: string; base_price: number; supply_cost: number | null; shipping_fee: number; home_sort_order: number; visibility: 'public' | 'member' | 'referral' | 'hidden'; status: 'draft' | 'active' | 'paused' | 'archived'; created_at: string },
        { slug: string; name: string; category?: string; short_description?: string; description?: string; base_price: number; supply_cost?: number | null; shipping_fee?: number; home_sort_order?: number; visibility?: 'public' | 'member' | 'referral' | 'hidden'; status?: 'draft' | 'active' | 'paused' | 'archived' },
        { slug?: string; name?: string; category?: string; short_description?: string; description?: string; base_price?: number; supply_cost?: number | null; shipping_fee?: number; home_sort_order?: number; visibility?: 'public' | 'member' | 'referral' | 'hidden'; status?: 'draft' | 'active' | 'paused' | 'archived' }
      >;
      product_options: Table<
        { id: string; product_id: string; name: string; value: string; price: number },
        { product_id: string; name: string; value: string; price: number },
        { name?: string; value?: string; price?: number }
      >;
      inventory: Table<
        { product_id: string; quantity: number; reserved_quantity: number },
        { product_id: string; quantity?: number; reserved_quantity?: number },
        { quantity?: number; reserved_quantity?: number }
      >;
      product_images: Table<
        { id: string; product_id: string; storage_path: string; alt_text: string; sort_order: number; role: 'thumbnail' | 'detail'; width: number | null; height: number | null; byte_size: number | null; mime_type: string | null; created_at: string },
        { product_id: string; storage_path: string; alt_text?: string; sort_order?: number; role?: 'thumbnail' | 'detail'; width?: number | null; height?: number | null; byte_size?: number | null; mime_type?: string | null },
        { storage_path?: string; alt_text?: string; sort_order?: number; role?: 'thumbnail' | 'detail'; width?: number | null; height?: number | null; byte_size?: number | null; mime_type?: string | null }
      >;
      store_settings: Table<
        {
          id: number; shipping_cutoff_time: string; shipping_fee_per_carton: number;
          shipping_carton_quantity: number; free_shipping_threshold: number | null;
          hero_headline: string; hero_subheadline: string; hero_youtube_url: string;
          hero_banner_path: string | null; hero_slide_interval_seconds: number;
          site_theme: 'dealkey_gold' | 'warm_beige' | 'clean_white'; site_width: 'standard' | 'wide';
          site_density: 'compact' | 'balanced' | 'spacious'; updated_at: string;
        },
        {
          id?: number; shipping_cutoff_time?: string; shipping_fee_per_carton?: number;
          shipping_carton_quantity?: number; free_shipping_threshold?: number | null;
          hero_headline?: string; hero_subheadline?: string; hero_youtube_url?: string;
          hero_banner_path?: string | null; hero_slide_interval_seconds?: number;
          site_theme?: 'dealkey_gold' | 'warm_beige' | 'clean_white'; site_width?: 'standard' | 'wide';
          site_density?: 'compact' | 'balanced' | 'spacious'; updated_at?: string;
        },
        {
          shipping_cutoff_time?: string; shipping_fee_per_carton?: number;
          shipping_carton_quantity?: number; free_shipping_threshold?: number | null;
          hero_headline?: string; hero_subheadline?: string; hero_youtube_url?: string;
          hero_banner_path?: string | null; hero_slide_interval_seconds?: number;
          site_theme?: 'dealkey_gold' | 'warm_beige' | 'clean_white'; site_width?: 'standard' | 'wide';
          site_density?: 'compact' | 'balanced' | 'spacious'; updated_at?: string;
        }
      >;
      home_banners: Table<
        {
          id: string; image_path: string; alt_text: string; sort_order: number; is_active: boolean;
          width: number | null; height: number | null; created_at: string;
        },
        {
          id?: string; image_path: string; alt_text?: string; sort_order?: number; is_active?: boolean;
          width?: number | null; height?: number | null; created_at?: string;
        },
        {
          image_path?: string; alt_text?: string; sort_order?: number; is_active?: boolean;
          width?: number | null; height?: number | null;
        }
      >;
      referral_codes: Table<
        { id: string; code: string; owner_user_id: string; label: string | null; campaign_id: string | null; status: 'active' | 'inactive' | 'expired'; starts_at: string | null; expires_at: string | null; created_at: string },
        { code: string; owner_user_id: string; label?: string | null; campaign_id?: string | null; status?: 'active' | 'inactive' | 'expired'; starts_at?: string | null; expires_at?: string | null },
        { code?: string; label?: string | null; campaign_id?: string | null; status?: 'active' | 'inactive' | 'expired'; starts_at?: string | null; expires_at?: string | null }
      >;
      referral_relationships: Table<
        { id: string; referred_user_id: string; referrer_user_id: string; referral_code_id: string; source: 'link' | 'manual' | 'admin'; campaign_id: string | null; created_at: string },
        { referred_user_id: string; referrer_user_id: string; referral_code_id: string; source?: 'link' | 'manual' | 'admin'; campaign_id?: string | null },
        { source?: 'link' | 'manual' | 'admin'; campaign_id?: string | null }
      >;
      promotion_codes: Table<
        { id: string; code: string; status: 'active' | 'inactive' | 'expired'; starts_at: string | null; expires_at: string | null; total_usage_limit: number | null; per_member_usage_limit: number | null; usage_count: number },
        { code: string; status?: 'active' | 'inactive' | 'expired'; starts_at?: string | null; expires_at?: string | null; total_usage_limit?: number | null; per_member_usage_limit?: number | null; usage_count?: number },
        { code?: string; status?: 'active' | 'inactive' | 'expired'; starts_at?: string | null; expires_at?: string | null; total_usage_limit?: number | null; per_member_usage_limit?: number | null; usage_count?: number }
      >;
      promotion_rules: Table<
        { id: string; promotion_code_id: string; product_ids: string[]; referral_code_ids: string[]; minimum_order_amount: number | null; minimum_quantity: number | null; discount_rate: number | null; discount_amount: number | null },
        { promotion_code_id: string; product_ids?: string[]; referral_code_ids?: string[]; minimum_order_amount?: number | null; minimum_quantity?: number | null; discount_rate?: number | null; discount_amount?: number | null },
        { product_ids?: string[]; referral_code_ids?: string[]; minimum_order_amount?: number | null; minimum_quantity?: number | null; discount_rate?: number | null; discount_amount?: number | null }
      >;
      orders: Table<
        { id: string; order_number: string; buyer_user_id: string; referrer_user_id: string | null; referral_code: string | null; promotion_code: string | null; status: string; gross_amount: number; discount_amount: number; shipping_amount: number; paid_amount: number; commissionable_amount: number; address_snapshot: Json; paid_at: string | null; created_at: string },
        { id?: string; order_number: string; buyer_user_id: string; referrer_user_id?: string | null; referral_code?: string | null; promotion_code?: string | null; status?: string; gross_amount: number; discount_amount?: number; shipping_amount?: number; paid_amount: number; commissionable_amount: number; address_snapshot: Json; paid_at?: string | null },
        { status?: string; paid_at?: string | null; shipped_at?: string | null; delivered_at?: string | null; cancelled_at?: string | null; refunded_at?: string | null }
      >;
      order_items: Table<
        { id: string; order_id: string; product_id: string; option_id: string | null; product_name_snapshot: string; option_name_snapshot: string | null; unit_price: number; quantity: number; subtotal: number; commissionable_amount: number },
        { order_id: string; product_id: string; option_id?: string | null; product_name_snapshot: string; option_name_snapshot?: string | null; unit_price: number; quantity: number; subtotal: number; commissionable_amount: number },
        never
      >;
      promotion_redemptions: Table<
        { id: string; promotion_code_id: string; user_id: string; order_id: string; discount_amount: number; redeemed_at: string },
        { promotion_code_id: string; user_id: string; order_id: string; discount_amount: number },
        never
      >;
      payments: Table<
        { id: string; order_id: string; provider: string; provider_payment_id: string | null; status: string; amount: number; paid_at: string | null; raw_payload: Json },
        { order_id: string; provider: string; provider_payment_id?: string | null; status?: string; amount: number; paid_at?: string | null; raw_payload?: Json },
        { status?: string; paid_at?: string | null; cancelled_at?: string | null; refunded_at?: string | null; raw_payload?: Json }
      >;
      refunds: Table<
        { id: string; order_id: string; payment_id: string | null; amount: number; reason: string; status: string; completed_at: string | null; created_at: string },
        { order_id: string; payment_id?: string | null; amount: number; reason: string; status?: string; completed_at?: string | null },
        { status?: string; completed_at?: string | null }
      >;
      commissions: Table<
        { id: string; order_id: string; buyer_user_id: string; beneficiary_user_id: string; depth: 1 | 2; commission_base: number; commission_rate: number; commission_amount: number; status: 'pending' | 'approved' | 'payable' | 'paid' | 'cancelled' | 'reversed'; created_at: string; approved_at: string | null; paid_at: string | null },
        { order_id: string; buyer_user_id: string; beneficiary_user_id: string; depth: 1 | 2; commission_base: number; commission_rate: number; commission_amount: number; status?: 'pending' | 'approved' | 'payable' | 'paid' | 'cancelled' | 'reversed' },
        { status?: 'pending' | 'approved' | 'payable' | 'paid' | 'cancelled' | 'reversed'; approved_at?: string | null; paid_at?: string | null }
      >;
      shipments: Table<
        { id: string; order_id: string; shipping_company: string | null; tracking_number: string | null; status: string; shipped_at: string | null; delivered_at: string | null },
        { order_id: string; shipping_company?: string | null; tracking_number?: string | null; status?: string },
        { shipping_company?: string | null; tracking_number?: string | null; status?: string; shipped_at?: string | null; delivered_at?: string | null }
      >;
      analytics_events: Table<
        { id: string; user_id: string | null; event_name: string; referral_code: string | null; referrer_user_id: string | null; campaign_id: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; properties: Json; occurred_at: string },
        { user_id?: string | null; event_name: string; referral_code?: string | null; referrer_user_id?: string | null; campaign_id?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; properties?: Json; occurred_at?: string },
        never
      >;
      b2b_leads: Table<
        { id: string; company_name: string; contact_name: string; phone: string; email: string; requested_product: string; quantity: number; desired_delivery_date: string | null; budget: number | null; memo: string | null; status: 'new' | 'contacted' | 'quoted' | 'closed'; created_at: string },
        { company_name: string; contact_name: string; phone: string; email: string; requested_product: string; quantity: number; desired_delivery_date?: string | null; budget?: number | null; memo?: string | null; status?: 'new' | 'contacted' | 'quoted' | 'closed' },
        { status?: 'new' | 'contacted' | 'quoted' | 'closed' }
      >;
      admin_audit_logs: Table<
        { id: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Json; after_data: Json; created_at: string },
        { actor_user_id?: string | null; action: string; entity_type: string; entity_id?: string | null; before_data?: Json; after_data?: Json },
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      admin_update_product: { Args: { p_product_id: string; p_patch: Json }; Returns: Json };
      reserve_inventory: { Args: { p_product_id: string; p_quantity: number }; Returns: boolean };
      release_inventory: { Args: { p_product_id: string; p_quantity: number }; Returns: boolean };
      redeem_promotion_code: { Args: { p_promotion_code_id: string; p_user_id: string; p_order_id: string; p_discount_amount: number }; Returns: boolean };
      /** 결제를 끝내지 않은 주문을 취소하고 잡아둔 재고를 되돌린다. 취소한 건수를 돌려준다. */
      expire_stale_pending_orders: { Args: { p_minutes: number }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type AppSupabaseClient = SupabaseClient<Database>;

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hasServiceRoleEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * 데모 모드는 로컬 개발용 편의 기능이다. 운영에서 환경변수가 빠졌을 때
 * 조용히 데모로 넘어가면 "가짜 성공" 응답과 무인증 관리자 화면이 만들어지므로,
 * production에서는 절대 허용하지 않는다(fail-closed).
 */
export function isDemoModeAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.CC_DISABLE_DEMO !== '1';
}

export type RuntimeMode = 'supabase' | 'demo' | 'unavailable';

/**
 * 앱이 지금 어떤 모드로 동작해야 하는지 한 곳에서 결정한다.
 * 호출부가 hasSupabaseEnv/hasServiceRoleEnv를 각자 조합하면
 * 라우트마다 폴백 규칙이 갈라지므로 여기서만 판단한다.
 */
export function resolveRuntimeMode(options: { requireServiceRole?: boolean } = {}): RuntimeMode {
  const needsServiceRole = options.requireServiceRole ?? true;
  if (hasSupabaseEnv() && (!needsServiceRole || hasServiceRoleEnv())) return 'supabase';
  if (isDemoModeAllowed() && !hasSupabaseEnv()) return 'demo';
  return 'unavailable';
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  return { url, key };
}

function getSupabaseServiceEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  return { url, key };
}

export function createBrowserSupabaseClient(): AppSupabaseClient {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}

/** Server-only. Never import this helper from a Client Component. */
export function createServiceRoleSupabaseClient(): AppSupabaseClient {
  const { url, key } = getSupabaseServiceEnv();
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface ServerCookieStore {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: CookieOptions }[]): void;
}

export function createServerSupabaseClient(cookieStore: ServerCookieStore): AppSupabaseClient {
  const { url, key } = getSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookieStore.setAll(cookiesToSet);
      },
    },
  });
}
