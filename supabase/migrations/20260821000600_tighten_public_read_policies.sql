-- 폐쇄몰인데 공개(anon) 키로 읽히던 테이블을 좁힌다.
--
-- 배경: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY는 브라우저에 그대로 노출된다.
-- 아래 정책들이 anon SELECT를 허용하고 있어서, 누구나 Data API로
--   GET /rest/v1/referral_codes?select=*
--   GET /rest/v1/promotion_codes?select=*
--   GET /rest/v1/promotion_rules?select=*
-- 를 호출해 초대코드 전량, 코드 소유자 id, 할인율까지 읽을 수 있었다.
--
-- 코드 검증은 이미 서버 라우트가 service role로 수행하므로(회원가입/주문),
-- 클라이언트에게 이 테이블들을 열어둘 이유가 없다.

--------------------------------------------------------------------------------
-- 1. referral_codes: 본인 소유 코드 또는 본인이 귀속된 코드만 조회 가능
--------------------------------------------------------------------------------
drop policy if exists referral_codes_validate on public.referral_codes;

create policy referral_codes_read_related
  on public.referral_codes
  for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1 from public.referral_relationships r
      where r.referral_code_id = public.referral_codes.id
        and r.referred_user_id = (select auth.uid())
    )
    or private.is_operator_or_admin()
  );

--------------------------------------------------------------------------------
-- 2. promotion_codes / promotion_rules: 관리자만 조회
--    (고객의 프로모션 적용은 주문 API가 service role로 검증한다)
--------------------------------------------------------------------------------
drop policy if exists promotion_codes_read_active on public.promotion_codes;
drop policy if exists promotion_rules_read_active on public.promotion_rules;

create policy promotion_codes_read_admin
  on public.promotion_codes
  for select
  to authenticated
  using (private.is_operator_or_admin());

create policy promotion_rules_read_admin
  on public.promotion_rules
  for select
  to authenticated
  using (private.is_operator_or_admin());

--------------------------------------------------------------------------------
-- 3. orders: 클라이언트 직접 INSERT 제거
--    주문 생성은 전부 서버(service role)를 거친다. 이 정책이 남아 있으면
--    로그인한 회원이 Data API로 임의 금액의 주문 row를 만들 수 있다.
--------------------------------------------------------------------------------
drop policy if exists orders_insert_self on public.orders;

--------------------------------------------------------------------------------
-- 4. refunds: 클라이언트 직접 INSERT 제거
--    금액 검증 없이 환불 요청 row를 만들 수 있었다. 환불은 관리자 API를 통한다.
--------------------------------------------------------------------------------
drop policy if exists refunds_insert_order_owner on public.refunds;

--------------------------------------------------------------------------------
-- 5. profiles: 운영자/관리자가 자기 프로필을 수정할 수 있게 한다.
--    기존 with check는 role = 'customer'를 요구해서, admin 계정은 자기
--    display_name조차 바꿀 수 없었다. 권한 상승은 계속 막는다
--    (자기 role을 지금 값에서 바꾸는 것 자체를 금지).
--------------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
  );

--------------------------------------------------------------------------------
-- 6. product_images: 상품 노출 정책을 이미지에도 동일하게 적용
--    기존에는 status='active'만 확인해서, 회원 전용 상품의 이미지 경로가
--    비회원에게도 조회됐다.
--------------------------------------------------------------------------------
drop policy if exists product_images_visible_read on public.product_images;

create policy product_images_visible_read
  on public.product_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.status = 'active'
        and (
          p.visibility = 'public'
          or (p.visibility = 'member' and (select auth.uid()) is not null)
          or (p.visibility = 'referral' and private.has_referral_access())
        )
    )
    or private.is_operator_or_admin()
  );
