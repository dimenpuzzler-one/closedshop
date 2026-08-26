-- 운영자가 개발자를 부르지 않고 바꿔야 하는 값들을 DB로 옮긴다.
--   1) 배송비 규칙: 지금까지 packages/commerce에 FREE_SHIPPING_THRESHOLD = 50_000이
--      하드코딩되어 있었다. 육포 420g 판매가가 55,000원이라 1개만 사도 배송비가 0원이 되고
--      3PL 건당 4,000원을 판매자가 전액 부담했다.
--   2) 카테고리: products.category가 자유 입력이라 오타 하나로 카테고리가 갈라졌다.
--   3) 홈 배너/문구/유튜브: 코드 수정 없이 바꿀 수 있어야 한다.

-- ---------------------------------------------------------------------------
-- 1) store_settings 확장
-- ---------------------------------------------------------------------------
alter table public.store_settings
  -- 3PL 건당(=카툰당) 요금. 기본 4,000원.
  add column if not exists shipping_fee_per_carton integer not null default 4000,
  -- 카툰 하나에 들어가는 수량. 총수량을 이 값으로 나눠 올림한 만큼 요금을 매긴다.
  add column if not exists shipping_carton_quantity integer not null default 5,
  -- 무료배송 기준액. null이면 무료배송 없음(기본값). 예전 하드코딩 50,000은 되살리지 않는다.
  add column if not exists free_shipping_threshold integer,
  add column if not exists hero_headline text not null default '',
  add column if not exists hero_subheadline text not null default '',
  add column if not exists hero_youtube_url text not null default '',
  -- product-images 버킷 안의 경로. 공개 버킷이므로 개인 식별 이미지는 올리면 안 된다.
  add column if not exists hero_banner_path text;

alter table public.store_settings
  drop constraint if exists store_settings_shipping_fee_per_carton_check;
alter table public.store_settings
  add constraint store_settings_shipping_fee_per_carton_check
  check (shipping_fee_per_carton >= 0 and shipping_fee_per_carton <= 1000000);

alter table public.store_settings
  drop constraint if exists store_settings_shipping_carton_quantity_check;
alter table public.store_settings
  add constraint store_settings_shipping_carton_quantity_check
  check (shipping_carton_quantity >= 1 and shipping_carton_quantity <= 1000);

alter table public.store_settings
  drop constraint if exists store_settings_free_shipping_threshold_check;
alter table public.store_settings
  add constraint store_settings_free_shipping_threshold_check
  check (free_shipping_threshold is null or free_shipping_threshold >= 0);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) 카테고리 마스터
-- ---------------------------------------------------------------------------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- products.category가 text이므로 이름이 곧 키다. 별도 slug를 두면 두 개가 어긋난다.
create unique index if not exists product_categories_name_key on public.product_categories (name);
create index if not exists product_categories_order_idx on public.product_categories (sort_order, name);

alter table public.product_categories enable row level security;

drop policy if exists product_categories_public_read on public.product_categories;
create policy product_categories_public_read
  on public.product_categories
  for select
  to anon, authenticated
  using (is_active or private.is_operator_or_admin());

drop policy if exists product_categories_admin_write on public.product_categories;
create policy product_categories_admin_write
  on public.product_categories
  for all
  to authenticated
  using (private.is_operator_or_admin())
  with check (private.is_operator_or_admin());

grant select on table public.product_categories to anon, authenticated, service_role;
grant insert, update, delete on table public.product_categories to authenticated, service_role;

-- 기존 products.category에 이미 들어 있는 값을 그대로 살린다.
-- products.category는 text로 남긴다: FK로 바꾸면 형님의 admin_create_product /
-- admin_update_product 원자 함수를 함께 고쳐야 해서 회귀 위험이 커진다.
-- 이 테이블은 "관리자 화면이 보여줄 선택지"의 원천이고, DB 제약이 아니다.
insert into public.product_categories (name, sort_order)
select distinct p.category, 100
  from public.products p
 where coalesce(trim(p.category), '') <> ''
on conflict (name) do nothing;

insert into public.product_categories (name, sort_order)
values ('기타', 900)
on conflict (name) do nothing;
