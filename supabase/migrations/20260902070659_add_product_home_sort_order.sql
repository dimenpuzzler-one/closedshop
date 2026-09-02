-- 홈 화면에서 운영자가 상품 진열 순서를 조정할 수 있도록 상품별 순서를 둔다.
-- 숫자가 작을수록 먼저 노출되며, 같은 순서는 최신 등록 상품이 먼저 온다.
alter table public.products
  add column if not exists home_sort_order integer not null default 100;

alter table public.products
  add constraint products_home_sort_order_nonnegative check (home_sort_order >= 0);

create index if not exists products_home_sort_idx
  on public.products (status, home_sort_order, created_at desc);

-- 운영자 상품 수정 RPC에도 홈 진열 순서를 포함한다.
create or replace function public.admin_update_product(p_product_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_reserved integer;
  v_affected integer;
  v_result jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception '상품 수정값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception '상품을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  update public.products
     set name = case when p_patch ? 'name' then p_patch->>'name' else name end,
         category = case when p_patch ? 'category' then p_patch->>'category' else category end,
         short_description = case when p_patch ? 'shortDescription' then p_patch->>'shortDescription' else short_description end,
         description = case when p_patch ? 'description' then p_patch->>'description' else description end,
         base_price = case when p_patch ? 'basePrice' then (p_patch->>'basePrice')::integer else base_price end,
         supply_cost = case
           when p_patch ? 'supplyCost' and jsonb_typeof(p_patch->'supplyCost') = 'null' then null
           when p_patch ? 'supplyCost' then (p_patch->>'supplyCost')::integer
           else supply_cost
         end,
         shipping_fee = case when p_patch ? 'shippingFee' then (p_patch->>'shippingFee')::integer else shipping_fee end,
         withdrawal_restriction = case when p_patch ? 'withdrawalRestriction' then p_patch->>'withdrawalRestriction' else withdrawal_restriction end,
         home_sort_order = case when p_patch ? 'homeSortOrder' then (p_patch->>'homeSortOrder')::integer else home_sort_order end,
         visibility = case when p_patch ? 'visibility' then (p_patch->>'visibility')::public.product_visibility else visibility end,
         status = case when p_patch ? 'status' then (p_patch->>'status')::public.product_status else status end,
         updated_at = now()
   where id = p_product_id;

  if p_patch ?| array['optionName', 'optionValue', 'optionPrice'] then
    update public.product_options
       set name = case when p_patch ? 'optionName' then p_patch->>'optionName' else name end,
           value = case when p_patch ? 'optionValue' then p_patch->>'optionValue' else value end,
           price = case when p_patch ? 'optionPrice' then (p_patch->>'optionPrice')::integer else price end
     where product_id = p_product_id;
    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception '수정할 상품 옵션을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
  end if;

  if p_patch ? 'stock' then
    select reserved_quantity
      into v_reserved
      from public.inventory
     where product_id = p_product_id
     for update;
    if not found then
      raise exception '수정할 재고 정보를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    if (p_patch->>'stock')::integer < v_reserved then
      raise exception '이미 %개가 주문에 예약되어 있어 재고를 그보다 낮출 수 없습니다.', v_reserved using errcode = '23514';
    end if;
    update public.inventory
       set quantity = (p_patch->>'stock')::integer,
           updated_at = now()
     where product_id = p_product_id;
  end if;

  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'category', p.category,
    'shortDescription', p.short_description,
    'description', p.description,
    'basePrice', p.base_price,
    'supplyCost', p.supply_cost,
    'shippingFee', p.shipping_fee,
    'withdrawalRestriction', p.withdrawal_restriction,
    'homeSortOrder', p.home_sort_order,
    'visibility', p.visibility,
    'status', p.status,
    'optionName', (select po.name from public.product_options po where po.product_id = p.id order by po.sort_order, po.created_at limit 1),
    'optionValue', (select po.value from public.product_options po where po.product_id = p.id order by po.sort_order, po.created_at limit 1),
    'optionPrice', (select po.price from public.product_options po where po.product_id = p.id order by po.sort_order, po.created_at limit 1),
    'stock', (select i.quantity from public.inventory i where i.product_id = p.id),
    'reservedStock', (select i.reserved_quantity from public.inventory i where i.product_id = p.id)
  )
    into v_result
    from public.products p
   where p.id = p_product_id;

  return v_result;
end;
$function$;

revoke all on function public.admin_update_product(uuid, jsonb) from public;
revoke all on function public.admin_update_product(uuid, jsonb) from anon, authenticated;
grant execute on function public.admin_update_product(uuid, jsonb) to service_role;
