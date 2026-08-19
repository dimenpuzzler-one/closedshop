# Database Notes

`supabase/migrations/20260819000100_initial_schema.sql`은 상품·추천·프로모션·Promotion redemption·주문·결제·배송·환불·Commission·정산·Analytics·B2B Lead의 초기 스키마입니다.

## 핵심 snapshot

`orders`는 `gross_amount`, `discount_amount`, `shipping_amount`, `paid_amount`, `commissionable_amount`, `referral_code`, `promotion_code`, `address_snapshot`을 저장합니다. `commissions`는 `commission_base`, `commission_rate`, `commission_amount`, `depth`, `beneficiary_user_id`를 별도 snapshot으로 저장합니다.

## RLS

public schema의 모든 테이블에 RLS를 활성화했습니다. 운영자 판별은 노출된 user metadata가 아니라 `profiles.role`을 조회하는 private schema 함수로 수행합니다. 고객은 본인 주문·주소·추천관계·수령 가능한 Commission만 읽을 수 있습니다. Commission과 Promotion redemption 생성은 클라이언트 정책에서 열지 않고 서버 전용 service-role 흐름에서만 수행합니다.

## 서버 주문 흐름

Supabase 환경이 연결되면 고객의 SSR session에서 user id를 검증한 뒤, 서버가 DB 상품·옵션·재고·최초 Referral 관계·Promotion 조건을 다시 읽습니다. 결제 검증 후 `orders`, `order_items`, `payments`, `commissions`, `promotion_redemptions`, `analytics_events`에 주문 당시 값을 snapshot합니다. 재고 reservation과 Promotion 사용량은 service-role 전용 DB 함수로 원자 처리합니다. 브라우저가 전달한 `buyerUserId`, 수수료 금액, beneficiary는 신뢰하지 않습니다.

## 적용

Supabase CLI가 설치된 환경에서 다음을 실행합니다.

```bash
supabase start
supabase db reset
```

CLI가 없는 환경에서는 Supabase Dashboard SQL Editor에서 migration 파일을 순서대로 실행할 수 있습니다.
