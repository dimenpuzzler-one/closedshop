-- Turn the existing, unused addresses table into the member shipping-address book.
-- Orders continue to keep their own immutable address_snapshot JSON.
alter table public.addresses
  alter column label set default '배송지',
  add column if not exists jibun_address text,
  add column if not exists building_name text,
  add column if not exists sido text,
  add column if not exists sigungu text,
  add column if not exists eupmyeondong text,
  add column if not exists adm_cd text,
  add column if not exists road_name_code text,
  add column if not exists building_management_no text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.addresses
  add constraint addresses_label_length_check
    check (char_length(btrim(label)) between 1 and 40),
  add constraint addresses_recipient_name_length_check
    check (char_length(btrim(recipient_name)) between 1 and 80),
  add constraint addresses_phone_length_check
    check (char_length(btrim(phone)) between 7 and 30),
  add constraint addresses_postal_code_check
    check (postal_code ~ '^[0-9]{5}$'),
  add constraint addresses_address_line1_length_check
    check (char_length(btrim(address_line1)) between 1 and 200),
  add constraint addresses_address_line2_length_check
    check (address_line2 is null or char_length(btrim(address_line2)) between 1 and 200),
  add constraint addresses_delivery_message_length_check
    check (delivery_message is null or char_length(btrim(delivery_message)) <= 200);

create index if not exists addresses_user_id_idx
  on public.addresses (user_id);

create unique index if not exists addresses_one_default_per_user_idx
  on public.addresses (user_id)
  where is_default;

-- A default change must clear the previous default in the same SQL statement.
-- The first address becomes the default even when the client does not request it.
create or replace function private.prepare_address_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.label := btrim(new.label);
  new.recipient_name := btrim(new.recipient_name);
  new.phone := btrim(new.phone);
  new.postal_code := btrim(new.postal_code);
  new.address_line1 := btrim(new.address_line1);
  new.address_line2 := nullif(btrim(new.address_line2), '');
  new.delivery_message := nullif(btrim(new.delivery_message), '');
  new.updated_at := now();

  if new.is_default then
    update public.addresses
       set is_default = false,
           updated_at = now()
     where user_id = new.user_id
       and id <> new.id
       and is_default;
  elsif tg_op = 'INSERT' and not exists (
    select 1
      from public.addresses
     where user_id = new.user_id
       and id <> new.id
  ) then
    new.is_default := true;
  end if;

  return new;
end;
$$;

create or replace function private.promote_address_after_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses
       set is_default = true
     where id = (
       select id
         from public.addresses
        where user_id = old.user_id
        order by updated_at desc, created_at desc
        limit 1
     );
  end if;
  return old;
end;
$$;

drop trigger if exists addresses_prepare_write on public.addresses;
create trigger addresses_prepare_write
before insert or update on public.addresses
for each row execute function private.prepare_address_write();

drop trigger if exists addresses_promote_after_delete on public.addresses;
create trigger addresses_promote_after_delete
after delete on public.addresses
for each row execute function private.promote_address_after_delete();

revoke all on function private.prepare_address_write() from public;
revoke all on function private.prepare_address_write() from anon, authenticated;
revoke all on function private.promote_address_after_delete() from public;
revoke all on function private.promote_address_after_delete() from anon, authenticated;

-- Addresses contain personal information. Data API grants and row ownership are
-- explicit rather than relying on broad project default privileges.
alter table public.addresses enable row level security;
drop policy if exists addresses_owner_all on public.addresses;
drop policy if exists addresses_select_own on public.addresses;
drop policy if exists addresses_insert_own on public.addresses;
drop policy if exists addresses_update_own on public.addresses;
drop policy if exists addresses_delete_own on public.addresses;

revoke all on table public.addresses from anon, authenticated;
grant select, insert, update, delete on table public.addresses to authenticated;

create policy addresses_select_own
on public.addresses for select
to authenticated
using ((select auth.uid()) = user_id);

create policy addresses_insert_own
on public.addresses for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy addresses_update_own
on public.addresses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy addresses_delete_own
on public.addresses for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.addresses is
  '회원이 수정·삭제할 수 있는 배송지 주소록. 주문 시점 주소는 orders.address_snapshot에 별도 보존한다.';
