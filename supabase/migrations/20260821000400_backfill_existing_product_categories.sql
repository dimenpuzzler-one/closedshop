update public.products
set category = '선물세트'
where category = '기타'
  and slug like 'premium-jerky-%';
