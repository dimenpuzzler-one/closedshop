insert into public.products (slug, name, short_description, description, visibility, status, base_price, shipping_fee)
values
  ('premium-jerky-300g', '한우 육포 선물세트 300g', '가볍게 전하기 좋은 프리미엄 한우 육포 세트', '엄선한 원육을 정성껏 숙성해 담은 실속형 명절 선물세트입니다.', 'referral', 'active', 39000, 3500),
  ('premium-jerky-420g', '한우 육포 선물세트 420g', '가족과 나누기 좋은 균형 잡힌 구성', '선물의 만족도와 실용성을 함께 고려한 420g 구성입니다.', 'referral', 'active', 52000, 3500),
  ('premium-jerky-480g', '한우 육포 선물세트 480g', '거래처와 가족 모두에게 어울리는 대표 구성', '선물용 패키지와 넉넉한 중량으로 준비한 대표 상품입니다.', 'referral', 'active', 59000, 0),
  ('premium-jerky-600g', '한우 육포 선물세트 600g', '감사한 분께 넉넉하게 전하는 프리미엄 구성', '중요한 선물과 단체 주문을 위해 가장 넉넉하게 구성했습니다.', 'referral', 'active', 72000, 0)
on conflict (slug) do nothing;

insert into public.product_options (product_id, name, value, price)
select id, '구성', regexp_replace(name, '한우 육포 선물세트 ', ''), base_price
from public.products
where slug in ('premium-jerky-300g', 'premium-jerky-420g', 'premium-jerky-480g', 'premium-jerky-600g')
  and not exists (select 1 from public.product_options options where options.product_id = products.id);

insert into public.inventory (product_id, quantity)
select id, case slug when 'premium-jerky-300g' then 120 when 'premium-jerky-420g' then 90 when 'premium-jerky-480g' then 70 else 45 end
from public.products
where slug in ('premium-jerky-300g', 'premium-jerky-420g', 'premium-jerky-480g', 'premium-jerky-600g')
on conflict (product_id) do nothing;

insert into public.promotion_codes (code, total_usage_limit, per_member_usage_limit)
values ('CHUSEOK10', 100, 1), ('VIP15', null, null)
on conflict (code) do nothing;

insert into public.promotion_rules (promotion_code_id, minimum_order_amount, discount_rate)
select id, case code when 'CHUSEOK10' then 50000 else 100000 end, case code when 'CHUSEOK10' then 0.10 else 0.15 end
from public.promotion_codes
where code in ('CHUSEOK10', 'VIP15')
  and not exists (select 1 from public.promotion_rules rules where rules.promotion_code_id = promotion_codes.id);
