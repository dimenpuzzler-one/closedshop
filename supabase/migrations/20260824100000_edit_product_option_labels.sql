-- 관리자 수정 화면에서 옵션명·옵션값도 고칠 수 있게 한다.
--
-- 등록 폼에는 옵션명(구성)과 옵션값(300g)이 있는데 수정 폼에는 없어서,
-- 한 번 등록하면 "300g"를 "420g"로 바꿀 방법이 없었다.
-- admin_update_product가 optionPrice만 처리하고 있었으므로 두 항목을 더한다.
--
-- 20260824070530의 함수 정의를 그대로 두고 옵션 처리 블록과 반환부만 넓혔다.

create or replace function public.admin_update_product(
  p_product_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
         visibility = case when p_patch ? 'visibility' then (p_patch->>'visibility')::public.product_visibility else visibility end,
         status = case when p_patch ? 'status' then (p_patch->>'status')::public.product_status else status end,
         updated_at = now()
   where id = p_product_id;

  -- 옵션명 / 옵션값 / 옵션가를 한 번의 UPDATE로 처리한다.
  -- 옵션명만 바뀌고 가격은 안 바뀌는 중간 상태가 생기지 않게 한다.
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
      raise exception '이미 %개가 주문에 예약되어 있어 총재고를 %개로 낮출 수 없습니다.',
        v_reserved, (p_patch->>'stock')::integer using errcode = '23514';
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
$$;

revoke all on function public.admin_update_product(uuid, jsonb) from public;
revoke all on function public.admin_update_product(uuid, jsonb) from anon, authenticated;
grant execute on function public.admin_update_product(uuid, jsonb) to service_role;
