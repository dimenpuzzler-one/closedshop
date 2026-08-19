# 폐쇄형 특판몰 Monorepo + 2-Depth Referral 설계안

- 작성일: 2026-08-19
- 프로젝트 성격: 비공개 특판 상품 유통용 폐쇄형 커머스 플랫폼
- 초기 상품: 추석 육포 선물세트 4종(300g / 420g / 480g / 600g)
- 향후 확장: 배 선물세트, 기업선물, 시즌 특판, 온라인 가격가이드 상품 등
- 기술 전제: **Turborepo Monorepo + Next.js + Vercel + Supabase**
- 개발 방식: Codex가 저장소 전체를 이해하고 앱/패키지를 병렬 수정하기 쉬운 구조

---

## 0. 핵심 결정사항

이 프로젝트는 처음부터 **모노레포**로 구축한다.

핵심 구조는 다음과 같다.

```text
이정복 대표
= 상품 소싱 / 공급 / 상품운영

김건엽
= 플랫폼 기획 / 개발 / 운영 / 판매 인프라 구축

사업 최종 이익
= 기본 50 : 50 배분
```

판매가, 공급가, 배송비, 광고비, 상품별 실제 마진율 등은 **상품 등록 및 판매 개시 단계에서 별도 확정**한다.

현재 개발 단계에서는 가격조건보다 아래 구조를 먼저 고정한다.

1. 폐쇄형 회원 접근
2. 상품별 노출 통제
3. Referral Code
4. Promotion Code
5. 2-Depth Referral Commission
6. 주문/정산 추적
7. 관리자 운영
8. 향후 상품을 계속 얹을 수 있는 공통 커머스 엔진

---

# 1. 플랫폼 정의

단순한 `추석 육포 쇼핑몰`을 만들지 않는다.

> **비공개/특판 상품을 추천인 네트워크를 통해 판매하는 폐쇄형 커머스 플랫폼**

으로 설계한다.

육포는 최초 검증 상품일 뿐이며 플랫폼은 상품에 종속되지 않는다.

```text
상품 소싱
   ↓
폐쇄몰 등록
   ↓
추천인/채널 생성
   ↓
Referral Code 유입
   ↓
회원가입
   ↓
상품/가격 노출
   ↓
구매
   ↓
Attribution 기록
   ↓
1·2 Depth Commission 생성
   ↓
주문/배송/환불
   ↓
정산
```

---

# 2. Monorepo 기본 구조

패키지 매니저는 `pnpm`, 빌드 오케스트레이션은 `Turborepo`를 기본값으로 한다.

```text
closed-commerce/
│
├─ apps/
│  ├─ web/                      # 고객용 폐쇄몰
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ features/
│  │  └─ public/
│  │
│  └─ admin/                    # 운영자/관리자 콘솔
│     ├─ app/
│     ├─ components/
│     └─ features/
│
├─ packages/
│  ├─ ui/                       # 공통 디자인 시스템 / UI
│  ├─ db/                       # Supabase client / queries / generated types
│  ├─ auth/                     # 인증 / 권한 / session helpers
│  ├─ commerce/                 # 상품 / 장바구니 / 주문 도메인
│  ├─ referral/                 # 추천인 / 2-depth commission 엔진
│  ├─ payment/                  # PG adapter interface
│  ├─ validation/               # Zod schema 등 공통 validation
│  ├─ config/                   # 공통 config / feature flags
│  ├─ analytics/                # attribution / event tracking
│  └─ types/                    # 공통 domain types
│
├─ supabase/
│  ├─ migrations/               # DB schema migration
│  ├─ functions/                # 필요한 경우 Edge Functions
│  ├─ seed.sql
│  └─ config.toml
│
├─ tooling/
│  ├─ eslint/
│  └─ typescript/
│
├─ docs/
│  ├─ architecture.md
│  ├─ business-rules.md
│  └─ database.md
│
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ pnpm-lock.yaml
```

## 구조 원칙

### `apps/web`

고객에게 노출되는 서비스만 담당한다.

- 초대코드 진입
- 회원가입/로그인
- 상품목록
- 상품상세
- 장바구니
- 프로모션 코드
- 주문/결제
- 주문조회
- 추천인 개인 현황(필요 시)

### `apps/admin`

운영 기능을 완전히 분리한다.

- 상품 관리
- 재고 관리
- 주문 관리
- 회원 관리
- Referral Code 관리
- Promotion Code 관리
- Commission 관리
- 정산 현황
- 판매/추천인/채널 통계

`web`에서 관리자 기능을 조건부 렌더링하는 구조는 사용하지 않는다.

---

# 3. Vercel 배포 구조

하나의 Git 저장소에서 두 개의 Vercel 프로젝트를 연결한다.

```text
Git Repository
      │
      ├── apps/web
      │      └── Vercel Project: closed-commerce-web
      │
      └── apps/admin
             └── Vercel Project: closed-commerce-admin
```

예시 도메인:

```text
shop.example.com      → apps/web
admin.example.com     → apps/admin
```

공통 `packages/*` 수정 시 Turborepo dependency graph를 통해 필요한 앱만 다시 빌드될 수 있는 구조를 유지한다.

---

# 4. Supabase 역할

Supabase는 공통 백엔드로 사용한다.

```text
Supabase
├─ PostgreSQL
├─ Auth
├─ Storage
└─ 필요 시 Edge Functions
```

원칙:

- 고객 브라우저에 `service_role`/secret key 노출 금지
- 공개 스키마 테이블은 RLS 적용
- 고객은 본인 데이터만 읽을 수 있어야 함
- 관리자 권한은 사용자 수정 가능한 metadata에 의존하지 않음
- Commission 계산은 브라우저에서 하지 않음
- 결제 성공/취소/환불 이벤트는 서버에서 검증 후 주문 상태 반영
- schema 변경은 migration으로 관리
- Supabase package 버전과 lockfile 고정

---

# 5. 폐쇄몰 Access 모델

기본적으로 유효한 Referral Code가 있어야 최초 가입이 가능하다.

```text
Landing
  ↓
Referral Code 입력
  ↓
Validation
  ↓
회원가입 / 로그인
  ↓
최초 추천인 Attribution 저장
  ↓
상품 접근
```

최초 가입 시 추천인 귀속은 원칙적으로 고정한다.

사용자가 나중에 다른 추천링크로 접속해도 최초 referrer가 임의로 변경되지 않는다.

관리자만 예외적으로 수정 가능하게 한다.

---

# 6. 상품 Visibility

상품마다 공개정책을 가진다.

```text
public
member
referral
hidden
```

### public
일반 공개 가능 상품.

### member
회원만 확인 가능.

### referral
유효한 추천인 관계를 가진 회원만 접근 가능.

### hidden
특정 캠페인/링크/회원그룹에서만 노출.

온라인 가격가이드가 있거나 공개 검색이 부적절한 상품은 기본적으로 `referral` 또는 `hidden` 처리한다.

검색 노출이 불필요한 영역은 `noindex`를 적용하고 sitemap에서도 제외한다.

---

# 7. Referral Code와 Promotion Code 분리

두 개념은 절대 합치지 않는다.

## Referral Code

> 누가 고객을 데려왔는가?

Attribution 목적이다.

예:

```text
KGY001
LEE001
THREAD01
JIHYE01
PARTNER001
```

추적 대상:

- 추천인
- 신규 회원
- 채널
- 캠페인
- 직접 구매
- 간접 구매
- 주문금액
- Commission

## Promotion Code

> 어떤 판매조건을 적용할 것인가?

가격/프로모션 목적이다.

예:

```text
CHUSEOK10
EARLYBIRD
VIP15
GROUP20
```

설정 가능 조건:

- 할인율
- 정액 할인
- 특정 상품
- 특정 Referral Code
- 최소 주문금액
- 최소 수량
- 유효기간
- 총 사용횟수
- 회원별 사용횟수

---

# 8. 2-Depth Referral 모델

## 기본 규칙

Commission은 **구매자 기준 상위 추천인 최대 2명까지만** 지급한다.

```text
A
└── B
    └── C
        └── D
```

### C가 구매

```text
B → Level 1 Commission
A → Level 2 Commission
```

### D가 구매

```text
C → Level 1 Commission
B → Level 2 Commission
A → Commission 없음
```

즉 추천 관계 자체가 계속 이어질 수는 있지만 **한 주문에서 보상되는 상위 계층은 최대 2 Depth**다.

다음 기능은 구현하지 않는다.

- 3 Depth 이상 Commission
- 추천인 모집 자체에 대한 보상
- 가입자 수에 따른 보상
- 가입비 기반 보상
- 의무구매 기반 추천자격
- 하위 조직 규모에 따른 직급/수당

이 시스템은 기술적으로 `2-depth affiliate/referral program`으로 정의한다.

> 법적 성격은 단순히 "2단계이므로 자동으로 다단계가 아니다"라고 단정하지 않고, 실제 운영방식과 보상구조를 기준으로 별도 검토한다.

---

# 9. Referral Commission 엔진

비율은 코드에 하드코딩하지 않는다.

관리자 설정값 또는 campaign rule로 관리한다.

```text
L1_COMMISSION_RATE = configurable
L2_COMMISSION_RATE = configurable
```

예시:

```text
commissionable_amount = 100,000원
L1 = 8%
L2 = 3%

L1 추천인 = 8,000원
L2 추천인 = 3,000원
총 Referral Cost = 11,000원
```

핵심은 주문 총액과 Commission 기준금액을 분리하는 것이다.

```text
order.gross_amount
order.discount_amount
order.paid_amount
order.commissionable_amount
```

상품별 마진이 다르므로 `paid_amount × 고정률`만 지원하는 구조보다 `commissionable_amount`를 주문에 snapshot으로 저장하는 구조가 안전하다.

---

# 10. Commission Lifecycle

결제 성공 즉시 현금 지급 상태로 만들지 않는다.

```text
pending
   ↓
approved
   ↓
payable
   ↓
paid
```

취소/환불 발생 시:

```text
cancelled
reversed
```

권장 흐름:

```text
결제 완료
→ Commission pending 생성
→ 구매확정 또는 환불가능기간 경과
→ approved/payable
→ 정산 실행
→ paid
```

Commission row에는 반드시 주문 당시 조건을 snapshot으로 저장한다.

```text
beneficiary_id
order_id
depth
commission_base
commission_rate
commission_amount
status
created_at
approved_at
paid_at
```

나중에 수수료율이 변경되어도 과거 주문 금액이 바뀌지 않게 한다.

---

# 11. 핵심 DB 모델

초기 기준.

```text
profiles
roles
addresses

products
product_options
product_images
inventory
product_access_rules

referral_codes
referral_relationships
referral_campaigns

promotion_codes
promotion_rules
promotion_redemptions

carts
cart_items

orders
order_items
payments
shipments
refunds

commissions
commission_settlements

admin_audit_logs
analytics_events
```

---

# 12. 추천관계 데이터 모델

## referral_codes

```text
id
code
owner_user_id
campaign_id
status
starts_at
expires_at
created_at
```

## referral_relationships

```text
id
referred_user_id
referrer_user_id
referral_code_id
source
campaign_id
created_at
```

`referred_user_id`는 기본적으로 하나의 active referrer만 가진다.

## commissions

```text
id
order_id
buyer_user_id
beneficiary_user_id
depth                  # 1 | 2
commission_base
commission_rate
commission_amount
status
created_at
approved_at
paid_at
```

DB constraint 또는 service-layer validation으로 `depth > 2` Commission 생성을 차단한다.

---

# 13. Commission 계산 로직

개념적으로 다음과 같다.

```ts
buyer
  ↓
directReferrer = getReferrer(buyer)
  ↓
parentReferrer = getReferrer(directReferrer)
```

주문 확정 시:

```text
if directReferrer exists
    create L1 commission

if parentReferrer exists
    create L2 commission

STOP
```

재귀적으로 3단계 이상 탐색하지 않는다.

Commission 계산은 다음 중 하나의 서버 영역에서 실행한다.

1. server-only domain service
2. trusted webhook handler
3. Supabase Edge Function

클라이언트가 Commission 금액이나 beneficiary를 전달하게 만들지 않는다.

---

# 14. 주문 상태

Boolean 상태로 단순화하지 않는다.

```text
pending
payment_pending
paid
preparing
shipped
delivered
cancel_requested
cancelled
refund_requested
partially_refunded
refunded
```

필수 필드 예:

```text
payment_id
paid_at
shipping_company
tracking_number
shipped_at
delivered_at
cancelled_at
refunded_at
```

---

# 15. Payment Adapter

PG는 추후 연결하므로 비즈니스 로직과 분리한다.

```text
packages/payment/
├─ types.ts
├─ adapter.ts
├─ mock-adapter.ts
└─ providers/
```

공통 interface 예:

```ts
interface PaymentProvider {
  createPayment(input): Promise<PaymentSession>
  verifyPayment(input): Promise<VerifiedPayment>
  cancelPayment(input): Promise<PaymentCancellation>
  refundPayment(input): Promise<PaymentRefund>
}
```

초기에는 mock provider로 주문 흐름을 완성하고 실제 PG 연동 시 provider만 추가한다.

핵심 주문/추천인 로직이 특정 PG 구현에 종속되면 안 된다.

---

# 16. 관리자 기능 MVP

## 상품

- 상품 CRUD
- 옵션 CRUD
- 가격
- 공급가 메모
- 판매상태
- Visibility
- 재고
- 이미지
- 판매기간

## 주문

- 주문 목록
- 주문 상세
- 결제상태
- 주문상태
- 송장번호
- 취소/환불 처리

## Referral

- Referral Code 생성
- 코드 활성/비활성
- 추천인 조회
- 직접 추천 회원
- L1 매출
- L2 매출
- L1 Commission
- L2 Commission

## Promotion

- 코드 생성
- 할인조건
- 상품제한
- 기간
- 사용량

## 정산

- 추천인별 payable Commission
- 정산상태
- 정산기간
- 수동 paid 처리
- CSV export는 후순위

---

# 17. 고객 기능 MVP

1. Referral Code 입력
2. 회원가입
3. 로그인
4. 상품 목록
5. 상품 상세
6. 옵션 선택
7. 장바구니
8. Promotion Code
9. 주문서
10. 결제
11. 주문내역
12. 배송상태

후순위:

- 리뷰
- 찜
- 포인트
- 회원등급
- 챗봇
- 복잡한 CRM

---

# 18. B2B 특판 Lead 기능

이정복 대표의 기존 강점이 기업특판이므로 B2C와 별도로 B2B Lead를 받을 수 있게 한다.

상품 페이지 또는 별도 페이지:

> 기업/단체 대량구매 견적받기

필드:

```text
회사명
담당자명
연락처
이메일
희망상품
희망수량
희망납기
예산
메모
```

초기에는 관리자 화면에 lead만 저장해도 충분하다.

---

# 19. Analytics / Attribution

초기부터 반드시 쌓을 데이터:

```text
referral_code
referrer_user_id
campaign_id
utm_source
utm_medium
utm_campaign
landing_at
signup_at
first_order_at
order_amount
commission_amount
```

핵심 지표:

```text
추천인별 유입
추천인별 가입전환율
추천인별 구매전환율
추천인별 매출
추천인별 객단가
L1 매출
L2 매출
Commission 대비 매출
상품별 판매량
Promotion Code별 매출
채널별 매출
```

Referral Code를 단순 출입 비밀번호가 아니라 **Attribution Key**로 사용한다.

---

# 20. 사업 정산 기본 구조

현재 합의:

```text
이정복 대표 : 김건엽
= 최종 사업이익 50 : 50
```

판매 개시 전 확정할 변수:

```text
판매가
상품 공급가
배송비 부담
PG 수수료
Referral Commission
Promotion 할인 부담
광고비 처리
취소/환불 비용
```

초기 계산식 예시는 다음 정도만 둔다.

```text
정산대상이익
= 실제 귀속 매출
- 합의된 직접 판매비용

파트너 배분액
= 정산대상이익 × 50%
```

구체적인 상품별 마진식은 상품 데이터가 확정된 뒤 별도 정의한다.

---

# 21. 역할 분담

## 이정복 대표

- 상품 소싱
- 공급사 관계
- 상품조건
- 재고
- 출고/상품 운영 협의
- 상품 정보 제공
- 기존 B2B 거래망 활용

## 김건엽

- 서비스 기획
- Monorepo architecture
- 고객몰 개발
- 관리자 개발
- Supabase 데이터 구조
- Referral/Promotion 엔진
- 주문/결제 인터페이스
- 데이터/Attribution 구조
- Vercel 배포
- 향후 자동화

세부 책임, 정산, 비용부담은 판매 시작 전 간단한 별도 합의서로 정리한다.

---

# 22. Codex 구현 순서

## Phase 1 — Repository Foundation

```text
Turborepo 생성
pnpm workspace
apps/web
apps/admin
packages/*
공통 TypeScript/ESLint
Vercel 배포 가능한 상태
```

완료조건:

- `pnpm dev`로 두 앱 실행
- `turbo build` 성공
- web/admin 독립 build 성공

## Phase 2 — Supabase Foundation

```text
Supabase project 연결
migration 체계
Auth
profiles
roles
RLS
공통 DB package
Generated DB types
```

## Phase 3 — Closed Access

```text
Referral Code validation
회원가입
referral_relationship 저장
상품 access rule
```

## Phase 4 — Commerce

```text
products
options
inventory
cart
orders
order_items
```

## Phase 5 — Promotion

```text
promotion_codes
validation
redemption
order snapshot
```

## Phase 6 — 2-Depth Referral

```text
L1 lookup
L2 lookup
Commission calculation
Commission lifecycle
Admin view
```

## Phase 7 — Payment Adapter

```text
PaymentProvider interface
mock payment
webhook contract
실제 PG 연결 준비
```

## Phase 8 — Operations

```text
admin order management
shipping/tracking
refund
commission settlement
analytics
```

---

# 23. Codex 개발 원칙

Codex에게 다음 규칙을 저장소 수준 instruction으로 제공한다.

```text
1. Monorepo boundary를 깨지 않는다.
2. app 간 코드를 직접 import하지 않는다.
3. 공유 로직은 packages/*로 이동한다.
4. Referral 계산을 UI component에 작성하지 않는다.
5. Payment provider-specific code를 commerce package에 넣지 않는다.
6. DB 변경은 migration으로 남긴다.
7. public/exposed table에는 RLS를 기본 적용한다.
8. service role/secret key를 client bundle에 포함하지 않는다.
9. 주문 생성 시 가격/할인/commission 기준값을 snapshot으로 저장한다.
10. Commission depth는 최대 2로 제한한다.
11. depth 3 이상의 보상 로직을 만들지 않는다.
12. 추천관계 변경이 과거 주문의 Commission을 변경하면 안 된다.
13. 관리자 변경은 audit log를 남길 수 있는 구조로 작성한다.
14. 기능 추가 전 기존 package/domain boundary를 우선 재사용한다.
15. dependency version은 pin하고 lockfile을 커밋한다.
```

---

# 24. MVP에서 의도적으로 하지 않는 것

```text
❌ 3 Depth 이상 Commission
❌ 모집 자체에 대한 보상
❌ 직급제
❌ 팀 매출 보너스
❌ 자동 출금
❌ 복잡한 지갑 시스템
❌ 포인트 경제
❌ 멀티벤더 정산
❌ 리뷰/커뮤니티
❌ 자체 물류 시스템
❌ 과도한 CRM
```

첫 목표는 단순하다.

> **상품 하나를 등록하고 → 추천코드로 고객을 유입시키고 → 결제를 받고 → 누가 팔았는지 추적하고 → 1·2 Depth Commission을 정확하게 계산하는 것.**

---

# 25. 판매 개시 전 마지막 확인 항목

개발을 막는 질문은 거의 없다.

아래 값은 TBD 상태로 만들어 두고 관리자에서 나중에 입력 가능하게 한다.

```text
[상품]
판매가
공급가
재고
배송비
배송마감

[Referral]
L1 Commission Rate
L2 Commission Rate
Commission 기준금액
정산주기

[Promotion]
할인율/할인금액
최소구매조건
기간

[Payment]
실제 PG provider
merchant 정보
webhook secret

[Operation]
배송사
CS 담당범위
환불 기준
```

따라서 위 값들이 아직 미정이어도 **Monorepo scaffold와 핵심 도메인 개발은 바로 시작할 수 있다.**

---

# 26. 최종 아키텍처 요약

```text
                    ┌────────────────────┐
                    │      Supabase      │
                    │ DB / Auth / Storage│
                    └─────────┬──────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
      ┌────────▼────────┐           ┌────────▼────────┐
      │    apps/web     │           │   apps/admin    │
      │  Closed Store   │           │ Operations UI  │
      └────────┬────────┘           └────────┬────────┘
               │                             │
               └──────────────┬──────────────┘
                              │
             ┌────────────────▼────────────────┐
             │          packages/*             │
             │ ui / db / auth / commerce       │
             │ referral / payment / analytics │
             └────────────────┬────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Referral Engine │
                    │   L1 + L2 only   │
                    └───────────────────┘
```

이 프로젝트의 핵심 자산은 쇼핑몰 화면이 아니다.

> **상품 소싱 → 비공개 판매 → 추천인별 유입 → 구매 → 2-Depth 보상 → 데이터 축적**

이라는 반복 가능한 유통 구조 자체다.

