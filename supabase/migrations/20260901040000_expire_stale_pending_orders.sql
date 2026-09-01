-- 결제를 끝내지 않고 나간 주문이 재고를 영원히 붙잡는 문제를 고친다.
--
-- 결제창을 열 때 재고를 먼저 잡는 것 자체는 맞다. 남은 한 개를 두 사람이
-- 동시에 사는 것을 막아야 하기 때문이다. 문제는 그 예약을 되돌리는 경로가
-- 결제 실패(cancelPendingOrder)에만 있었다는 것이다. 고객이 결제창을 그냥
-- 닫으면 아무도 부르지 않고, 예약은 그대로 남는다.
--
-- 실제로 이 일이 났다. 재고가 1개인 상품에서 대표님이 결제를 끝내지 않고
-- 나갔고, 본인이 다시 들어갔을 때 "재고가 부족합니다"를 봤다. 자기 예약에
-- 자기가 막힌 것이다. 재고가 999개인 상품에서는 티가 나지 않았을 뿐,
-- 같은 일이 계속 쌓이고 있었다.

create or replace function public.expire_stale_pending_orders(p_minutes integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
  stale record;
begin
  -- 코페이는 카드 인증 후 10분 안에 승인을 요청해야 한다. 그 시간을 넘긴
  -- 결제대기 주문은 되살아날 수 없으므로 재고를 붙잡고 있을 이유가 없다.
  -- 기본값 20분은 그 한계의 두 배로, 진행 중인 결제를 건드리지 않는다.
  if p_minutes is null or p_minutes < 10 then
    p_minutes := 10;
  end if;

  for stale in
    select id
      from public.orders
     where status = 'payment_pending'
       and created_at < now() - make_interval(mins => p_minutes)
     order by created_at
     for update skip locked
  loop
    -- 재고를 먼저 되돌린다. 이 주문의 품목만 정확히 되돌리며,
    -- greatest(0, ...) 덕분에 두 번 실행돼도 음수가 되지 않는다.
    update public.inventory i
       set reserved_quantity = greatest(0, i.reserved_quantity - oi.quantity),
           updated_at = now()
      from public.order_items oi
     where oi.order_id = stale.id
       and i.product_id = oi.product_id;

    update public.orders
       set status = 'cancelled',
           cancelled_at = now(),
           updated_at = now()
     where id = stale.id
       and status = 'payment_pending';

    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_stale_pending_orders(integer) from public;
grant execute on function public.expire_stale_pending_orders(integer) to service_role;

comment on function public.expire_stale_pending_orders(integer) is
  '결제를 끝내지 않은 주문을 취소하고 잡아둔 재고를 되돌린다. 취소한 건수를 돌려준다.';

-- 결제대기 주문을 시간으로 찾는 일이 이제 정기적으로 일어난다.
create index if not exists orders_pending_created_idx
  on public.orders (created_at)
  where status = 'payment_pending';

-- 5분마다 알아서 돈다. 운영자가 기억하고 눌러야 하는 버튼으로 두면
-- 결국 아무도 누르지 않는다.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('expire-stale-pending-orders');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'expire-stale-pending-orders',
  '*/5 * * * *',
  $$select public.expire_stale_pending_orders(20);$$
);
