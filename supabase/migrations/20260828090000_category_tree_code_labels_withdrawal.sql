-- 세 가지를 한 번에 더한다. 셋 다 "운영자가 개발자를 부르지 않게" 하는 항목이다.
--
--   1) 카테고리 2단계: 식품 > 축산가공식품 처럼 대분류 아래 소분류를 둔다.
--      스마트스토어는 4단계지만 그건 네이버 검색 노출용 표준 분류다. 딜키는 검색 노출을
--      일부러 막는 폐쇄몰이라 같은 깊이가 필요하지 않다. 상품이 늘면 깊이를 더한다.
--
--   2) 추천 코드 라벨: 코드만 쌓이면 어느 게 릴스 광고용이고 어느 게 지인용인지 알 수 없다.
--
--   3) 청약철회 제한 안내: 전자상거래법 제17조 제2항 단서에 따라, 제한 사유를 "미리 명확하게
--      표시"하지 않으면 판매자는 청약철회 제한을 주장할 수 없다. 즉 표시를 빼면 제한이
--      사라지는 게 아니라 개봉한 식품도 환불해줘야 한다. 상품마다 표시할 칸을 만든다.

-- ---------------------------------------------------------------------------
-- 1) 카테고리 2단계
-- ---------------------------------------------------------------------------
alter table public.product_categories
  add column if not exists parent_id uuid references public.product_categories(id) on delete restrict;

create index if not exists product_categories_parent_idx on public.product_categories (parent_id, sort_order, name);

-- 자기 자신을 부모로 삼는 것만 막는다. 2단계만 쓸 것이므로 깊은 순환은 아래 제약으로 차단한다.
alter table public.product_categories drop constraint if exists product_categories_no_self_parent;
alter table public.product_categories
  add constraint product_categories_no_self_parent check (parent_id is null or parent_id <> id);

/*
 * 2단계를 넘지 못하게 막는다. 부모가 있는 카테고리는 다시 부모가 될 수 없다.
 * 트리거가 없으면 화면에서만 막게 되고, SQL로 직접 넣으면 3단계가 생겨 조회가 깨진다.
 */
create or replace function private.enforce_category_depth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 부모로 지정한 카테고리가 이미 자식이면 3단계가 된다.
  if new.parent_id is not null
     and exists (select 1 from public.product_categories p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception '카테고리는 2단계까지만 만들 수 있습니다. 대분류 아래 소분류까지입니다.'
      using errcode = 'check_violation';
  end if;

  -- 자식을 가진 카테고리를 다른 카테고리 밑으로 옮기면 역시 3단계가 된다.
  if new.parent_id is not null
     and exists (select 1 from public.product_categories c where c.parent_id = new.id) then
    raise exception '하위 카테고리를 가진 카테고리는 다른 카테고리 아래로 옮길 수 없습니다.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_category_depth() from public;

drop trigger if exists product_categories_depth_guard on public.product_categories;
create trigger product_categories_depth_guard
  before insert or update on public.product_categories
  for each row execute function private.enforce_category_depth();

-- ---------------------------------------------------------------------------
-- 2) 추천 코드 용도 라벨
-- ---------------------------------------------------------------------------
alter table public.referral_codes
  add column if not exists label text;

comment on column public.referral_codes.label is '코드의 용도. 예: 릴스 광고 9월, 이정복 대표 지인용. 대시보드와 정산 화면에 코드 대신 표시된다.';

-- ---------------------------------------------------------------------------
-- 3) 상품별 청약철회 제한 안내
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists withdrawal_restriction text not null default '';

comment on column public.products.withdrawal_restriction is
  '청약철회가 제한되는 사유. 상품 상세 화면에 표시된다. 비워두면 제한을 주장할 수 없다(전자상거래법 제17조 제2항 단서).';

alter table public.products drop constraint if exists products_withdrawal_restriction_len;
alter table public.products
  add constraint products_withdrawal_restriction_len check (char_length(withdrawal_restriction) <= 500);
