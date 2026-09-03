-- 판매 가능 재고가 0개가 되면 상품을 자동으로 판매중지한다.
--
-- inventory는 상품 단위로 한 행만 가지므로 옵션별 수량을 합산하지 않는다.
-- 예약 수량까지 차감한 available 수량을 기준으로 하며, 운영자가 재고를
-- 다시 입력해도 자동으로 판매중으로 되돌리지는 않는다.

create or replace function private.pause_product_when_out_of_stock()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.quantity - new.reserved_quantity <= 0 then
    update public.products
       set status = 'paused'::public.product_status,
           updated_at = now()
     where id = new.product_id
       and status = 'active'::public.product_status;
  end if;
  return new;
end;
$function$;

comment on function private.pause_product_when_out_of_stock() is
  'Stops active products when available inventory reaches zero; never auto-reactivates them.';

drop trigger if exists inventory_pause_product_when_empty on public.inventory;
create trigger inventory_pause_product_when_empty
  after insert or update of quantity, reserved_quantity on public.inventory
  for each row
  execute function private.pause_product_when_out_of_stock();

create or replace function private.prevent_active_product_without_stock()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status = 'active'::public.product_status
     and exists (
       select 1
         from public.inventory i
        where i.product_id = new.id
          and i.quantity - i.reserved_quantity <= 0
     ) then
    new.status := 'paused'::public.product_status;
  end if;
  return new;
end;
$function$;

comment on function private.prevent_active_product_without_stock() is
  'Prevents an active status when a product has no available inventory.';

drop trigger if exists products_prevent_active_without_stock on public.products;
create trigger products_prevent_active_without_stock
  before insert or update of status on public.products
  for each row
  execute function private.prevent_active_product_without_stock();

-- 기존 데이터도 같은 규칙으로 맞춘다. 재고가 다시 생겨도 수동으로 판매중
-- 체크를 해야 하므로 자동 재활성화는 하지 않는다.
update public.products p
   set status = 'paused'::public.product_status,
       updated_at = now()
  from public.inventory i
 where i.product_id = p.id
   and p.status = 'active'::public.product_status
   and i.quantity - i.reserved_quantity <= 0;

revoke all on function private.pause_product_when_out_of_stock() from public, anon, authenticated;
revoke all on function private.prevent_active_product_without_stock() from public, anon, authenticated;
