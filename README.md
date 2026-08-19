# Closed Commerce

폐쇄형 특판 상품을 위한 Turborepo + Next.js + Supabase 기반 MVP입니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

- 고객몰: `http://localhost:3000`
- 관리자: `http://localhost:3001`

환경변수가 없으면 Supabase 없이도 데모 카탈로그와 mock 주문 흐름을 확인할 수 있습니다. Supabase를 연결하면 SSR session·RLS로 회원/상품을 확인하고, 서버 전용 service role로 주문·재고 reservation·결제 snapshot·Promotion redemption·L1/L2 Commission·Analytics를 저장합니다. 실제 운영 전에는 Supabase 프로젝트를 연결하고 `supabase/migrations`를 적용해야 합니다.

## 주요 명령

```bash
pnpm build
pnpm typecheck
pnpm test
```

## 설계 원칙

- Referral Code(귀속)와 Promotion Code(가격조건)를 분리합니다.
- 추천 관계는 최초 귀속 후 임의 변경하지 않으며, 주문 당시의 수수료율과 기준금액을 snapshot합니다.
- Commission은 구매자의 상위 2명까지만 생성합니다.
- service role key는 서버 전용이며 클라이언트 번들에 포함하지 않습니다.
- 실제 결제 연동은 `packages/payment`의 `PaymentProvider` adapter를 교체하는 방식으로 추가합니다.
