-- 홈 화면 전체 이미지 배너를 운영자가 직접 관리한다.
-- 기존 store_settings.hero_banner_path 한 장 구조는 데이터 이관 후 호환용으로 남긴다.

alter table public.store_settings
  add column if not exists hero_slide_interval_seconds integer not null default 6;

alter table public.store_settings
  drop constraint if exists store_settings_hero_slide_interval_seconds_check;
alter table public.store_settings
  add constraint store_settings_hero_slide_interval_seconds_check
  check (hero_slide_interval_seconds between 2 and 30);

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  image_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 100 check (sort_order between 0 and 9999),
  is_active boolean not null default true,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

create index if not exists home_banners_active_order_idx
  on public.home_banners (sort_order, created_at)
  where is_active;

alter table public.home_banners enable row level security;

drop policy if exists home_banners_public_read on public.home_banners;
create policy home_banners_public_read
  on public.home_banners
  for select
  to anon, authenticated
  using (is_active or private.is_operator_or_admin());

drop policy if exists home_banners_admin_write on public.home_banners;
create policy home_banners_admin_write
  on public.home_banners
  for all
  to authenticated
  using (private.is_operator_or_admin())
  with check (private.is_operator_or_admin());

grant select on table public.home_banners to anon, authenticated, service_role;
grant insert, update, delete on table public.home_banners to authenticated, service_role;

-- 기존 단일 배너가 있으면 첫 번째 배너로 그대로 살린다.
insert into public.home_banners (image_path, alt_text, sort_order, is_active)
select hero_banner_path, '딜키 메인 배너', 100, true
  from public.store_settings
 where id = 1
   and hero_banner_path is not null
on conflict (image_path) do nothing;
