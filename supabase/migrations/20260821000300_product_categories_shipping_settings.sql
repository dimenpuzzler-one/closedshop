alter table public.products
  add column if not exists category text not null default '기타';

create index if not exists products_category_idx
  on public.products (category);

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  shipping_cutoff_time time without time zone not null default '14:00',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, shipping_cutoff_time)
values (1, '14:00')
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists store_settings_public_read on public.store_settings;
create policy store_settings_public_read
  on public.store_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists store_settings_admin_write on public.store_settings;
create policy store_settings_admin_write
  on public.store_settings
  for all
  to authenticated
  using (private.is_operator_or_admin())
  with check (private.is_operator_or_admin());

grant select on table public.store_settings to anon, authenticated, service_role;
grant insert, update, delete on table public.store_settings to authenticated, service_role;
