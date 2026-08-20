create extension if not exists "pgcrypto";

create type public.app_role as enum ('customer', 'operator', 'admin');
create type public.product_visibility as enum ('public', 'member', 'referral', 'hidden');
create type public.product_status as enum ('draft', 'active', 'paused', 'archived');
create type public.order_status as enum ('pending', 'payment_pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancel_requested', 'cancelled', 'refund_requested', 'partially_refunded', 'refunded');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.commission_status as enum ('pending', 'approved', 'payable', 'paid', 'cancelled', 'reversed');

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  role public.app_role primary key,
  description text not null
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default '기본 배송지',
  recipient_name text not null,
  phone text not null,
  postal_code text not null,
  address_line1 text not null,
  address_line2 text,
  delivery_message text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null default '',
  description text not null default '',
  visibility public.product_visibility not null default 'referral',
  status public.product_status not null default 'draft',
  base_price integer not null check (base_price >= 0),
  supply_cost integer check (supply_cost is null or supply_cost >= 0),
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  commissionable_rate numeric(8, 5) check (commissionable_rate is null or commissionable_rate >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  value text not null,
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
  updated_at timestamptz not null default now()
);

create table public.product_access_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  referral_campaign_id uuid,
  allowed_referral_code_id uuid,
  member_group text,
  created_at timestamptz not null default now()
);

create table public.referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.product_access_rules
  add constraint product_access_rules_campaign_fk foreign key (referral_campaign_id) references public.referral_campaigns(id) on delete set null;

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  campaign_id uuid references public.referral_campaigns(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.product_access_rules
  add constraint product_access_rules_referral_code_fk foreign key (allowed_referral_code_id) references public.referral_codes(id) on delete set null;

create table public.referral_relationships (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  source text not null default 'link' check (source in ('link', 'manual', 'admin')),
  campaign_id uuid references public.referral_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint referral_relationship_no_self check (referred_user_id <> referrer_user_id),
  constraint referral_relationship_one_referrer unique (referred_user_id)
);

create table public.promotion_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  starts_at timestamptz,
  expires_at timestamptz,
  total_usage_limit integer check (total_usage_limit is null or total_usage_limit > 0),
  per_member_usage_limit integer check (per_member_usage_limit is null or per_member_usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now()
);

create table public.promotion_rules (
  id uuid primary key default gen_random_uuid(),
  promotion_code_id uuid not null references public.promotion_codes(id) on delete cascade,
  product_ids uuid[] not null default '{}',
  referral_code_ids uuid[] not null default '{}',
  minimum_order_amount integer,
  minimum_quantity integer,
  discount_rate numeric(8, 5) check (discount_rate is null or (discount_rate >= 0 and discount_rate <= 1)),
  discount_amount integer check (discount_amount is null or discount_amount >= 0),
  constraint promotion_rule_one_discount check ((discount_rate is not null) <> (discount_amount is not null)),
  constraint promotion_rule_one_per_code unique (promotion_code_id)
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  option_id uuid references public.product_options(id) on delete restrict,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  unique (cart_id, product_id, option_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_user_id uuid not null references public.profiles(id) on delete restrict,
  referrer_user_id uuid references public.profiles(id) on delete restrict,
  referral_code text,
  promotion_code text,
  status public.order_status not null default 'pending',
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  shipping_amount integer not null default 0 check (shipping_amount >= 0),
  paid_amount integer not null check (paid_amount >= 0),
  commissionable_amount integer not null default 0 check (commissionable_amount >= 0),
  address_snapshot jsonb not null,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  option_id uuid references public.product_options(id) on delete restrict,
  product_name_snapshot text not null,
  option_name_snapshot text,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal integer not null check (subtotal >= 0),
  commissionable_amount integer not null check (commissionable_amount >= 0)
);

create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_code_id uuid not null references public.promotion_codes(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  discount_amount integer not null check (discount_amount >= 0),
  redeemed_at timestamptz not null default now(),
  unique (promotion_code_id, user_id, order_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  amount integer not null check (amount >= 0),
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  shipping_company text,
  tracking_number text,
  status text not null default 'ready' check (status in ('ready', 'shipped', 'delivered')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  amount integer not null check (amount > 0),
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  buyer_user_id uuid not null references public.profiles(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  depth smallint not null check (depth in (1, 2)),
  commission_base integer not null check (commission_base >= 0),
  commission_rate numeric(8, 5) not null check (commission_rate >= 0),
  commission_amount integer not null check (commission_amount >= 0),
  status public.commission_status not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  unique (order_id, beneficiary_user_id, depth)
);

create table public.commission_settlements (
  id uuid primary key default gen_random_uuid(),
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount integer not null check (amount >= 0),
  status text not null default 'open' check (status in ('open', 'processing', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint settlement_period_valid check (period_end >= period_start)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  referral_code text,
  referrer_user_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.referral_campaigns(id) on delete set null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  properties jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create table public.b2b_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  requested_product text not null,
  quantity integer not null check (quantity > 0),
  desired_delivery_date date,
  budget integer check (budget is null or budget >= 0),
  memo text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'closed')),
  created_at timestamptz not null default now()
);

create index referral_relationships_referrer_idx on public.referral_relationships(referrer_user_id);
create index orders_buyer_idx on public.orders(buyer_user_id, created_at desc);
create index orders_referrer_idx on public.orders(referrer_user_id, created_at desc);
create index commissions_beneficiary_idx on public.commissions(beneficiary_user_id, status);
create index analytics_events_attribution_idx on public.analytics_events(referral_code, occurred_at desc);

insert into public.roles (role, description) values
  ('customer', '일반 회원'), ('operator', '운영 담당자'), ('admin', '관리자')
on conflict (role) do nothing;

create or replace function private.is_operator_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('operator', 'admin')
  );
$$;

revoke all on function private.is_operator_or_admin() from public;
grant execute on function private.is_operator_or_admin() to anon, authenticated;

create or replace function private.has_referral_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.referral_relationships where referred_user_id = auth.uid());
$$;

revoke all on function private.has_referral_access() from public;
grant execute on function private.has_referral_access() to anon, authenticated;

create or replace function public.reserve_inventory(p_product_id uuid, p_quantity integer)
returns boolean
language plpgsql
security invoker
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    return false;
  end if;
  update public.inventory
     set reserved_quantity = reserved_quantity + p_quantity,
         updated_at = now()
   where product_id = p_product_id
     and quantity - reserved_quantity >= p_quantity;
  return found;
end;
$$;

create or replace function public.release_inventory(p_product_id uuid, p_quantity integer)
returns boolean
language plpgsql
security invoker
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    return false;
  end if;
  update public.inventory
     set reserved_quantity = greatest(0, reserved_quantity - p_quantity),
         updated_at = now()
   where product_id = p_product_id;
  return found;
end;
$$;

revoke all on function public.reserve_inventory(uuid, integer) from public;
revoke all on function public.release_inventory(uuid, integer) from public;
grant execute on function public.reserve_inventory(uuid, integer) to service_role;
grant execute on function public.release_inventory(uuid, integer) to service_role;

create or replace function public.redeem_promotion_code(
  p_promotion_code_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_discount_amount integer
)
returns boolean
language plpgsql
security invoker
as $$
declare
  promotion public.promotion_codes%rowtype;
  member_redemptions integer;
begin
  select * into promotion
    from public.promotion_codes
   where id = p_promotion_code_id
   for update;

  if not found or promotion.status <> 'active'
     or (promotion.starts_at is not null and promotion.starts_at > now())
     or (promotion.expires_at is not null and promotion.expires_at < now())
     or (promotion.total_usage_limit is not null and promotion.usage_count >= promotion.total_usage_limit) then
    return false;
  end if;

  if promotion.per_member_usage_limit is not null then
    select count(*) into member_redemptions
      from public.promotion_redemptions
     where promotion_code_id = p_promotion_code_id and user_id = p_user_id;
    if member_redemptions >= promotion.per_member_usage_limit then
      return false;
    end if;
  end if;

  insert into public.promotion_redemptions (promotion_code_id, user_id, order_id, discount_amount)
  values (p_promotion_code_id, p_user_id, p_order_id, greatest(0, p_discount_amount));

  update public.promotion_codes
     set usage_count = usage_count + 1
   where id = p_promotion_code_id;
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.redeem_promotion_code(uuid, uuid, uuid, integer) from public;
grant execute on function public.redeem_promotion_code(uuid, uuid, uuid, integer) to service_role;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.product_access_rules enable row level security;
alter table public.referral_campaigns enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.promotion_codes enable row level security;
alter table public.promotion_rules enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.refunds enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_settlements enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.b2b_leads enable row level security;

create policy roles_read_authenticated on public.roles for select to authenticated using (true);
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using ((select auth.uid()) = id or private.is_operator_or_admin());
create policy profiles_insert_self on public.profiles for insert to authenticated with check ((select auth.uid()) = id and role = 'customer');
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id and role = 'customer');

create policy addresses_owner_all on public.addresses for all to authenticated using ((select auth.uid()) = user_id or private.is_operator_or_admin()) with check ((select auth.uid()) = user_id or private.is_operator_or_admin());
create policy products_visible_read on public.products for select to anon, authenticated using (status = 'active' and (visibility = 'public' or (visibility = 'member' and auth.uid() is not null) or (visibility = 'referral' and private.has_referral_access())) or private.is_operator_or_admin());
create policy products_admin_write on public.products for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy product_options_visible_read on public.product_options for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active' and (p.visibility = 'public' or (p.visibility = 'member' and auth.uid() is not null) or (p.visibility = 'referral' and private.has_referral_access()))));
create policy product_options_admin_write on public.product_options for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy product_images_visible_read on public.product_images for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy product_images_admin_write on public.product_images for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy inventory_admin_all on public.inventory for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy access_rules_admin_all on public.product_access_rules for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy campaigns_read_active on public.referral_campaigns for select to anon, authenticated using (status = 'active' or private.is_operator_or_admin());
create policy campaigns_admin_write on public.referral_campaigns for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy referral_codes_validate on public.referral_codes for select to anon, authenticated using (status = 'active' and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at >= now()) or private.is_operator_or_admin());
create policy referral_codes_admin_write on public.referral_codes for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy referral_relationships_read_owner on public.referral_relationships for select to authenticated using ((select auth.uid()) = referred_user_id or (select auth.uid()) = referrer_user_id or private.is_operator_or_admin());
create policy referral_relationships_insert_self on public.referral_relationships for insert to authenticated with check (
  (select auth.uid()) = referred_user_id
  and not exists (select 1 from public.referral_relationships existing where existing.referred_user_id = referred_user_id)
  and exists (
    select 1 from public.referral_codes code
    where code.id = referral_code_id
      and code.owner_user_id = referrer_user_id
      and code.status = 'active'
      and (code.starts_at is null or code.starts_at <= now())
      and (code.expires_at is null or code.expires_at >= now())
  )
);
create policy promotion_codes_read_active on public.promotion_codes for select to anon, authenticated using (status = 'active' or private.is_operator_or_admin());
create policy promotion_codes_admin_write on public.promotion_codes for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy promotion_rules_read_active on public.promotion_rules for select to anon, authenticated using (exists (select 1 from public.promotion_codes p where p.id = promotion_code_id and p.status = 'active'));
create policy promotion_rules_admin_write on public.promotion_rules for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy promotion_redemptions_read_owner_or_admin on public.promotion_redemptions for select to authenticated using ((select auth.uid()) = user_id or private.is_operator_or_admin());
create policy carts_owner_all on public.carts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cart_items_owner_all on public.cart_items for all to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())) with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy orders_read_owner_or_admin on public.orders for select to authenticated using ((select auth.uid()) = buyer_user_id or (select auth.uid()) = referrer_user_id or private.is_operator_or_admin());
create policy orders_insert_self on public.orders for insert to authenticated with check ((select auth.uid()) = buyer_user_id);
create policy orders_admin_update on public.orders for update to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy order_items_read_related on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or o.referrer_user_id = auth.uid() or private.is_operator_or_admin())));
create policy order_items_admin_write on public.order_items for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy payments_read_owner_or_admin on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or private.is_operator_or_admin())));
create policy payments_admin_write on public.payments for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy shipments_read_order_owner on public.shipments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or private.is_operator_or_admin())));
create policy shipments_admin_write on public.shipments for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy refunds_read_order_owner on public.refunds for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or private.is_operator_or_admin())));
create policy refunds_insert_order_owner on public.refunds for insert to authenticated with check (exists (select 1 from public.orders o where o.id = order_id and o.buyer_user_id = auth.uid()));
create policy refunds_admin_update on public.refunds for update to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy commissions_read_beneficiary_or_admin on public.commissions for select to authenticated using ((select auth.uid()) = beneficiary_user_id or private.is_operator_or_admin());
create policy commissions_admin_update on public.commissions for update to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy settlements_read_beneficiary_or_admin on public.commission_settlements for select to authenticated using ((select auth.uid()) = beneficiary_user_id or private.is_operator_or_admin());
create policy settlements_admin_all on public.commission_settlements for all to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (private.is_operator_or_admin());
create policy audit_admin_insert on public.admin_audit_logs for insert to authenticated with check (private.is_operator_or_admin() and actor_user_id = auth.uid());
create policy analytics_insert_any on public.analytics_events for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
create policy analytics_admin_read on public.analytics_events for select to authenticated using (private.is_operator_or_admin());
create policy leads_insert_any on public.b2b_leads for insert to anon, authenticated with check (true);
create policy leads_admin_read on public.b2b_leads for select to authenticated using (private.is_operator_or_admin());
create policy leads_admin_update on public.b2b_leads for update to authenticated using (private.is_operator_or_admin()) with check (private.is_operator_or_admin());

-- Data API privileges are explicit so the app remains available when automatic
-- public-schema exposure is disabled. Row Level Security policies above still
-- control every client-side row access.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
