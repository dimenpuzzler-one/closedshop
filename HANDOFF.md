# Closed Commerce 핸드오프 문서

> 마지막 갱신: 2026-08-21 (Asia/Seoul) — 코드 점검/수정 반영본. 변경 요약은 docs/2026-08-21-changes.md
> 저장 위치: 저장소 루트 HANDOFF.md
> 저장소: https://github.com/dimenpuzzler-one/closedshop

이 문서는 다음 세션의 작업자가 현재 상태를 다시 조사하지 않고 바로 개발·검증·배포를 이어갈 수 있도록 작성한 운영 인계 문서입니다. 먼저 이 문서를 읽은 뒤 git status, 최신 커밋, Vercel 배포 상태, Supabase 마이그레이션 적용 상태를 확인하세요.

## 1. 프로젝트 한눈에 보기

Closed Commerce는 추천인(Referral Code)으로 입장하는 폐쇄형 특판몰 MVP입니다.

| 영역 | 위치 | 역할 | 운영 주소 |
| --- | --- | --- | --- |
| 고객몰 | apps/web | 회원 로그인, 추천인 입장, 상품 목록/상세, 장바구니, 주문 | https://dealkey.co.kr |
| 관리자 | apps/admin | 관리자 로그인, 상품/주문/추천/프로모션/정산/리드 관리 | https://admin.dealkey.co.kr |
| 공용 타입/DB | packages/types, packages/db | Product, Order, Supabase Database 타입 및 클라이언트 | 두 앱에서 공유 |
| 공용 비즈니스 | packages/commerce, packages/referral, packages/validation | 가격 계산, 추천인/수수료 계산, 입력 검증 | 두 앱에서 공유 |
| 데이터베이스 | supabase/migrations | Supabase Postgres, RLS, Storage 설정 | Supabase project uoqudjsmeqgdkijcltpp |

기술 구성은 Turborepo, pnpm, Next.js 15.5.7, React 19.1.0, Supabase SSR, Vercel입니다.

## 2. 현재 Git 및 배포 상태

현재 main 브랜치에 모든 변경사항이 푸시되어 있습니다.

> 2026-08-21 점검에서 확인된 사항: `.gitattributes`가 없어 Windows 체크아웃에서
> `.gitignore`와 tsconfig 2개가 CRLF 차이만으로 항상 modified로 남았습니다.
> `.gitattributes`(eol=lf)를 추가해 해소했습니다.

| 커밋 | 내용 |
| --- | --- |
| afcca0d | store_settings RLS 정책을 INSERT/UPDATE/DELETE로 분리 |
| 3c984fe | 기존 육포 상품 카테고리를 선물세트로 백필 |
| 534fa41 | 제품 카테고리, 이미지 미리보기, 상세 표시, 배송 마감 기능 구현 |
| 7e9f64b | 상품 등록 흐름, 이미지 업로드, 옵션가 처리 완료 |

GitHub main 브랜치: https://github.com/dimenpuzzler-one/closedshop/tree/main

### Vercel 프로젝트

- Vercel scope/team: withclaudefirst
- Web project: closed-commerce-web
- Admin project: closed-commerce-admin
- Web Vercel project id: prj_4ces16gANl0SMxsIemZm6lwtrFZN
- Admin Vercel project id: prj_jdW4QcCvK4vmt2qkWs3kmnG9DvdW
- 문서 작성 당시 확인 배포 상태: web/admin 모두 Production Ready
- 참고용 배포 URL (deployment마다 바뀔 수 있으므로 canonical alias 사용 권장):
  - web: https://closed-commerce-btlqn04jj-withclaudefirst.vercel.app
  - admin: https://closed-commerce-admin-r7pbg91wt-withclaudefirst.vercel.app
- canonical alias:
  - web: https://dealkey.co.kr, https://closed-commerce-web.vercel.app
  - admin: https://admin.dealkey.co.kr, https://closed-commerce-admin.vercel.app

GitHub main에 push하면 두 Vercel 프로젝트가 자동 배포됩니다. 앱별 Vercel Root Directory와 빌드 설정은 각 앱의 vercel.json에 있습니다.

    // apps/web/vercel.json
    {
      "framework": "nextjs",
      "installCommand": "pnpm install --frozen-lockfile",
      "buildCommand": "pnpm turbo build --filter=web..."
    }

관리자는 apps/admin/vercel.json에서 --filter=admin...을 사용합니다.

## 3. 로컬 실행 방법

Node/pnpm 의존성이 설치되어 있다는 전제입니다.

    pnpm install
    pnpm dev

- 고객몰: http://localhost:3000
- 관리자: http://localhost:3001

Supabase 환경변수가 없으면 데모 카탈로그와 mock 주문 흐름으로 실행됩니다. 실제 Supabase 데이터를 사용하려면 루트 .env.local에 아래 값을 넣어야 합니다.

    NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
    NEXT_PUBLIC_WEB_URL=http://localhost:3000
    SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
    ADMIN_LOGIN_EMAIL_DOMAIN=dealkey.co.kr
    L1_COMMISSION_RATE=0.08
    L2_COMMISSION_RATE=0.03
    COMMISSION_APPROVAL_DAYS=7
    PAYMENT_WEBHOOK_SECRET=<server-only-webhook-secret>

SUPABASE_SERVICE_ROLE_KEY는 절대 NEXT_PUBLIC_ 이름으로 만들거나 Client Component에서 import하면 안 됩니다. .env.example도 같은 원칙으로 구성되어 있습니다.

주요 명령:

    pnpm build       # 전체 build
    pnpm typecheck   # 전체 typecheck
    pnpm test        # 전체 test
    pnpm lint        # 전체 lint
    pnpm check       # lint + typecheck + test + build

`pnpm check` 결과는 41 successful, 41 total입니다.

> 주의: 이전 문서의 "38 successful"은 실제 lint가 아니었습니다.
> `lint` 스크립트가 `tsc --noEmit`이라 타입체크를 두 번 돌린 결과였고,
> 저장소에 ESLint 설정 자체가 없었습니다. 지금은 `eslint.config.mjs`가 있고
> `lint`는 진짜 ESLint를 돌립니다(no-floating-promises 포함).

## 4. 관리자 인증 구조

관리자 로그인 경로:

- 화면: apps/admin/app/login/page.tsx
- API: apps/admin/app/api/auth/login/route.ts
- 권한 확인: apps/admin/lib/admin-auth.ts
- 권한 기준: Supabase Auth 사용자와 연결된 public.profiles.role

로그인 ID에 @가 없으면 ADMIN_LOGIN_EMAIL_DOMAIN을 뒤에 붙입니다. 환경변수가 없을 때 기본값은 dealkey.co.kr입니다.

관리자 허용 role은 operator 또는 admin입니다. 사용자 metadata가 아니라 profiles.role을 확인하므로, Supabase Auth에서 사용자를 만들거나 비밀번호를 바꾼 뒤 반드시 public.profiles의 role도 확인해야 합니다.

관리자 임시 계정의 비밀번호는 보안상 이 문서와 Git에 기록하지 않습니다. 다음 세션에서 자격증명이 필요하면 Supabase Auth Dashboard에서 비밀번호를 재설정하거나 기존 운영 전달 내용을 사용하세요. 계정 생성/role 부여 후 아래 SQL 형태로 role을 확인합니다.

    select id, display_name, role
    from public.profiles
    where id = '<auth-user-uuid>';

로그아웃 상태의 /products나 관리자 API가 관리자 페이지를 바로 보여주지 않고 권한 안내를 보여주는 것은 정상입니다. Vercel Deployment Protection이 켜져 있으므로 일반 Invoke-WebRequest로 개별 deployment URL을 호출하면 Vercel 보호 화면이 나올 수 있습니다. 보호된 배포 확인은 아래처럼 Vercel CLI를 사용하세요.

    vercel curl https://closed-commerce-admin-<deployment>.vercel.app/products --scope withclaudefirst

## 5. 이번에 구현된 상품 등록 기능

관리자 상품 페이지:

- 화면: apps/admin/app/(admin)/products/page.tsx
- 입력 컴포넌트: apps/admin/components/admin-create-forms.tsx
- API: apps/admin/app/api/products/route.ts
- Supabase 데이터 조회: apps/admin/lib/admin-data.ts

상품 등록 입력값:

1. Slug: 영문 소문자, 숫자, 하이픈
2. 상품명
3. 제품 카테고리: 최대 80자, 기본값 기타
4. 기본가
5. 공급가(선택)
6. 배송비
7. 노출 대상: referral, member, public, hidden
8. 판매 상태: active, draft, paused
9. 옵션명
10. 옵션값
11. 옵션가(선택)
12. 초기재고
13. 짧은 소개
14. 상세페이지 설명
15. 썸네일 이미지 1장
16. 상세페이지 이미지 최대 8장

### 옵션가의 의미

현재 옵션은 상품마다 하나를 등록하는 MVP 형태입니다.

- 옵션가를 비워두면 basePrice를 옵션의 최종 판매가로 저장합니다.
- 옵션가를 입력하면 입력한 optionPrice가 고객몰 표시 및 주문 계산에 사용됩니다.
- 옵션가는 공급가가 아닙니다. 고객이 실제로 결제하는 옵션별 판매가입니다.
- 공급가는 원가/운영 참고값으로 별도 저장됩니다.

이 의미를 바꾸려면 apps/admin/app/api/products/route.ts, packages/validation/src/index.ts, apps/web/lib/order-service.ts, packages/commerce/src/index.ts의 가격 계산을 함께 검토해야 합니다.

### 이미지 처리

- Storage bucket: product-images
- 공개 다운로드 bucket이므로 상품 이미지 URL을 고객몰에서 직접 사용할 수 있습니다.
- 허용 MIME: JPEG, PNG, WEBP
- 파일당 최대 크기: 5MB
- 썸네일은 sort_order = 0
- 상세 이미지는 sort_order = 1..8
- 관리자 화면에서 선택 즉시 로컬 미리보기가 표시됩니다.
- 업로드 중 후속 저장이 실패하면 업로드 파일과 상품 row를 정리하는 cleanup 흐름이 있습니다.
- 이미지 row는 public.product_images에 저장되며 고객몰 상세 갤러리와 관리자 상품 조회에서 public URL로 변환됩니다.

### 등록 성공 후 데이터 저장 순서

1. multipart form parsing 및 숫자 필드 변환
2. Zod 상품 입력 검증
3. products insert
4. product_options insert
5. inventory insert
6. Storage 이미지 업로드
7. product_images insert
8. admin_audit_logs 기록

중간 단계가 실패하면 가능한 범위에서 업로드 파일과 상품을 삭제합니다. 현재 상품 편집/삭제 UI는 구현되어 있지 않고 등록 기능 중심입니다.

## 6. 제품 카테고리 및 고객몰 표시

public.products.category가 추가되었고 관리자 목록 및 고객몰 카드/상세에 표시됩니다.

- DB 기본값: 기타
- 현재 live의 기존 4개 상품은 선물세트로 백필 완료
- 카테고리 관리용 별도 master table이나 select UI는 아직 없음
- 신규 상품은 관리자가 자유 텍스트로 입력

고객몰 데이터 흐름:

- 목록: apps/web/lib/catalog-data.ts
- 상세: apps/web/app/products/[slug]/page.tsx
- 카드: apps/web/components/product-card.tsx
- 주문 검증: apps/web/lib/order-service.ts

상품 상세 route가 더 이상 단순 404로 끝나지 않습니다. Supabase 환경에서 비로그인 사용자가 접근하면 로그인/추천 코드 안내가 표시되고, 존재하지 않거나 접근할 수 없는 상품만 404가 됩니다.

(해소됨) 홈 화면 FIRST DROP은 loadShowcaseProducts로 live 상품을 봅니다.
비로그인 방문자에게는 가격 대신 "회원 전용 가격"이 표시됩니다.

더 심각했던 문제도 함께 해소했습니다: 장바구니(cart-view)와 주문서(checkout-form)가
DEMO_PRODUCTS만 아는 calculateCartTotals/getProductById를 직접 호출하고 있었습니다.
localStorage에는 실제 상품 UUID가 저장되므로 live 상품을 담으면 조회 실패 →
예외 → /cart 렌더 자체가 깨졌습니다. 이제 금액은 전부 서버(`POST /api/cart/quote`)가
계산합니다.

## 7. 배송 마감 설정

배송 마감은 영업일별 복잡한 출고 규칙이 아니라 현재 단순한 일일 HH:MM 값입니다.

- DB table: public.store_settings
- singleton row: id = 1
- column: shipping_cutoff_time time without time zone
- 기본값: 14:00
- 관리자 조회: apps/admin/lib/admin-data.ts
- 관리자 저장 API: apps/admin/app/api/settings/route.ts
- 관리자 UI: ShippingSettingsForm
- 고객몰 조회: apps/web/lib/store-settings.ts
- 고객몰 표시: apps/web/components/shipping-cutoff-notice.tsx

현재 고객몰 노출 위치:

- 홈 화면
- 상품 목록 화면
- 상품 상세 화면

현재 문구는 “마감 시간 이후 주문은 다음 출고 일정으로 처리될 수 있습니다.”입니다. 시간 값은 저장되지만 실제 주문의 출고일 자동 계산이나 주말/공휴일 예외 처리는 아직 하지 않습니다.

store_settings RLS는 공개 SELECT와 관리자 INSERT/UPDATE/DELETE로 분리되어 있습니다. 처음 추가한 FOR ALL 관리자 정책은 후속 migration에서 제거했기 때문에, migration은 반드시 순서대로 적용해야 합니다.

## 8. Supabase 현재 상태

- Project ref: uoqudjsmeqgdkijcltpp
- 조직/프로젝트 화면에서 확인한 설정: moneypuzzlerPro, Asia-Pacific, Micro compute
- live schema에는 상품 카테고리와 store_settings가 반영되어 있습니다.
- store_settings 현재 row: id = 1, shipping_cutoff_time = 14:00:00
- live 상품:
  - premium-jerky-300g / 선물세트
  - premium-jerky-420g / 선물세트
  - premium-jerky-480g / 선물세트
  - premium-jerky-600g / 선물세트
- Storage bucket product-images: public, 5MB, JPEG/PNG/WEBP

### Migration 순서

supabase/migrations 파일은 timestamp 순서대로 적용합니다.

1. 20260819000100_initial_schema.sql
2. 20260820000100_harden_function_execution.sql
3. 20260821000100_product_image_storage.sql
4. 20260821000200_product_media_indexes.sql
5. 20260821000300_product_categories_shipping_settings.sql
6. 20260821000400_backfill_existing_product_categories.sql
7. 20260821000500_refine_store_settings_policies.sql

마지막 세 migration의 역할:

- 003: products.category, category index, store_settings, 기본 row, RLS, grants
- 004: 기존 premium-jerky-* 상품을 선물세트로 backfill
- 005: store_settings 관리자 정책을 SELECT 공개 정책과 겹치지 않도록 분리

Supabase CLI가 없는 현재 작업 환경에서는 Supabase 연결 도구로 DDL migration을 적용했습니다. 다음 세션에서 이미 적용된 migration을 다시 실행하지 마세요. Dashboard에서 migration history 또는 아래 SQL로 상태를 확인할 수 있습니다.

    select column_name, data_type, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'category';

    select id, shipping_cutoff_time::text, updated_at
    from public.store_settings;

    select slug, category
    from public.products
    order by slug;

### Supabase advisor 결과

- Security advisor: lints: []
- Performance advisor: 기존 스키마에 대한 정보/경고성 항목이 남아 있음
- 확인 당시 performance advisor 총 항목: 51건
- 기존 항목의 주요 유형: unindexed foreign keys, RLS auth init plan, multiple permissive policies, unused indexes
- 새 store_settings 정책을 분리한 뒤 store_settings 관련 performance lint는 없음

기존 성능 advisor 항목은 이번 상품/배송 기능의 배포를 막는 오류가 아닙니다. 대규모 데이터가 쌓이기 전에 별도 성능 정리 작업으로 다루는 것이 좋습니다.

## 9. Vercel 환경변수 및 도메인

두 프로젝트 공통:

    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    NEXT_PUBLIC_WEB_URL

Web 프로젝트 추가:

    SUPABASE_SERVICE_ROLE_KEY
    PAYMENT_WEBHOOK_SECRET
    L1_COMMISSION_RATE
    L2_COMMISSION_RATE
    COMMISSION_APPROVAL_DAYS

Admin 프로젝트 추가:

    SUPABASE_SERVICE_ROLE_KEY
    ADMIN_LOGIN_EMAIL_DOMAIN

Vercel Dashboard의 Project Settings → Environment Variables에서 Production/Preview/Development 범위를 확인하세요. 특히 관리자와 web 양쪽에 NEXT_PUBLIC_SUPABASE_URL, publishable key, service role key가 필요한 코드 경로가 있는지 확인하고, service role key를 브라우저로 보내지 않도록 주의합니다.

도메인은 Hosting.kr에서 구매/관리하고, Vercel에서는 다음 alias가 연결되어 있습니다.

- dealkey.co.kr → web
- admin.dealkey.co.kr → admin

도메인이 다시 끊기면 Hosting.kr DNS 레코드와 Vercel Domains 화면에서 CNAME/검증 상태를 함께 확인하세요. DNS 작업은 이 저장소 코드 변경과 별개의 외부 작업입니다.

## 10. 현재 구현 범위와 미구현 범위

### 구현 완료

- Supabase Auth SSR session
- profiles.role 기반 관리자 권한
- 추천 코드 기반 회원/상품 접근
- 상품 목록 및 상세 route
- 상품 등록 API
- 옵션가 선택 입력 및 기본가 fallback
- 상품 카테고리
- 썸네일/상세 이미지 업로드와 미리보기
- 고객몰 상세 이미지 갤러리
- 상세페이지 설명 표시
- 배송 마감 시간 저장 및 고객몰 표시
- 장바구니/주문 snapshot 구조
- Mock payment provider
- Promotion Code 및 2단계 Commission 계산 구조
- 주문/배송/환불/리드/추천/프로모션 관리자 화면
- Dominion 푸터

### 다음 세션에서 우선순위가 높은 작업

1. 홈 화면 FIRST DROP을 live Supabase 상품 목록과 연결
2. 상품 수정/삭제 기능 추가
3. 카테고리를 자유 입력 대신 카테고리 선택/관리 기능으로 개선
4. 배송 마감에 요일, 주말/공휴일, 출고일 계산 규칙 추가
5. 실제 PG 연동 및 결제 webhook 검증
6. 상품별 판매 시작일/종료일을 관리자 UI와 고객몰 노출 정책에 연결
7. 이용약관/개인정보처리방침/환불·교환 안내를 실제 페이지 또는 문서 링크로 연결
8. 이미지 삭제/교체 및 Storage orphan cleanup 운영 작업 추가
9. performance advisor의 기존 인덱스/RLS 경고 정리
10. 운영 데이터 백업과 관리자 감사 로그 조회 화면 보강

## 11. 알려진 주의사항

- 고객몰은 회원/추천 귀속이 필요한 폐쇄몰입니다. Supabase 환경에서 비로그인 상태면 상품 대신 Referral Gate가 나오는 것이 정상입니다.
- Demo 모드와 Supabase 운영 모드의 동작이 다릅니다. 환경변수가 빠지면 API 일부가 실제 DB가 아니라 demo 성공 응답을 반환할 수 있습니다.
- product-images는 public bucket입니다. 민감한 개인정보 이미지를 올리면 안 됩니다.
- 이미지 업로드는 현재 JPEG/PNG/WEBP만 허용합니다. HEIC, GIF, SVG는 거부됩니다.
- 상품 이미지 실제 운영 등록 테스트는 운영 DB에 테스트 상품을 만들지 않기 위해 수행하지 않았습니다. 첫 실제 상품 등록 후 Storage URL, 상세 갤러리, 주문 화면을 한 번에 확인해야 합니다.
- 실제 PG가 아니라 MockPaymentProvider입니다. 판매를 시작하기 전에 결제 승인/취소/환불 연동을 교체해야 합니다.
- 관리자 상품 목록의 판매기간 컬럼은 현재 실제 starts_at/ends_at를 표시하지 않고 상품 설정값 placeholder를 표시합니다.
- 홈페이지 상품 카드가 DEMO_PRODUCTS를 사용한다는 점은 live catalog와의 불일치 원인입니다.
- Supabase service role은 서버 전용입니다. client component, public env, 브라우저 요청 body에 포함하지 않습니다.
- 운영 계정 비밀번호를 이 문서나 GitHub에 추가하지 않습니다.

## 12. 다음 세션 시작 체크리스트

    cd C:\dev\closedshopping
    git status
    git log -5 --oneline
    pnpm check

그 다음 아래를 확인하세요.

1. HANDOFF.md와 README.md를 읽습니다.
2. git status가 clean인지 확인합니다.
3. Supabase migration history에서 20260821000500까지 적용되었는지 확인합니다.
4. store_settings 값과 live 상품 카테고리를 SQL로 확인합니다.
5. Vercel vercel ls로 web/admin Production이 Ready인지 확인합니다.
6. 관리자 로그인 후 /products에서 상품 등록창과 배송 마감 설정창을 확인합니다.
7. 테스트용 상품을 운영 DB에 남기지 않도록 실제 등록 테스트 여부를 먼저 결정합니다.
8. 새로운 DB 변경은 반드시 새 timestamp migration 파일을 만들고, Supabase live 적용 후 Git에 커밋합니다.
9. 코드 변경 후 pnpm check를 실행하고 main에 push합니다.
10. 배포 후 canonical domain과 보호된 deployment URL을 각각 확인합니다.

## 13. 유용한 확인 명령

    # Git / 변경사항
    git status
    git diff --check
    git log -10 --oneline

    # 로컬 앱
    pnpm dev
    pnpm --filter web dev
    pnpm --filter admin dev

    # Vercel
    vercel ls closed-commerce-web --scope withclaudefirst --limit 5
    vercel ls closed-commerce-admin --scope withclaudefirst --limit 5
    vercel logs --project closed-commerce-web --scope withclaudefirst --level error --since 1h --json
    vercel logs --project closed-commerce-admin --scope withclaudefirst --level error --since 1h --json
    vercel curl https://dealkey.co.kr/products?ref=KGY001 --scope withclaudefirst
    vercel curl https://admin.dealkey.co.kr/products --scope withclaudefirst

## 14. 관련 문서와 주요 파일

- 프로젝트 개요: README.md
- 구조: docs/architecture.md
- DB 원칙: docs/database.md
- 배포: docs/deployment.md
- 사업 규칙: docs/business-rules.md
- 원래 상세 설계: closed_mall_monorepo_2depth_referral_design.md
- 상품 등록 API: apps/admin/app/api/products/route.ts
- 배송 설정 API: apps/admin/app/api/settings/route.ts
- 관리자 상품 화면: apps/admin/app/(admin)/products/page.tsx
- 관리자 입력 폼: apps/admin/components/admin-create-forms.tsx
- 고객몰 상품 조회: apps/web/lib/catalog-data.ts
- 고객몰 상품 상세: apps/web/app/products/[slug]/page.tsx
- 배송 설정 조회: apps/web/lib/store-settings.ts
- DB 타입: packages/db/src/index.ts
- 앱 타입: packages/types/src/index.ts
- 입력 검증: packages/validation/src/index.ts
- DB migrations: supabase/migrations

이 문서의 기능 기준 커밋은 afcca0d이며, 이후 문서 전용 커밋이 추가될 수 있습니다. 최신 상태는 항상 git log와 git status로 확인하고, 기능 변경이 생기면 상단 갱신일, 커밋 목록, 배포 URL, 완료/미완료 범위를 함께 업데이트하세요.
