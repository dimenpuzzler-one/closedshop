# Closed Commerce 코드 점검 리포트

> 작성: 2026-08-21 / 대상 커밋: 82d99e9 (HEAD)
> 방법: 정적 코드 읽기 + Supabase live DB 조회. **빌드/테스트는 실행하지 못했음**(작업 환경에 node/pnpm 없음). 따라서 "pnpm check 38/38"은 재검증되지 않은 상태.
> 표기: [확인] = 코드/DB로 직접 확인. [추론] = 코드상 그렇게 동작할 것으로 보이나 런타임 미검증.

---

## 0. 요약

핸드오프 문서는 대체로 정확하지만, **다음 주 대표님이 실제 상품을 등록하는 순간 장바구니가 깨진다**는 사실이 문서에 없다. 이게 이번 점검의 핵심이다.

- P0 (상품 등록 즉시 터짐): 3건
- P1 (보안/권한 구조): 9건
- P2 (데이터 정합성): 4건
- P3 (개발 인프라): 6건

---

## 1. P0 — live 상품을 올리면 바로 깨지는 것

### P0-1. 장바구니와 주문서가 DEMO_PRODUCTS에만 의존한다 [확인]

현재 `/cart`와 `/checkout`의 금액 계산·상품명 표시가 **demo 하드코딩 배열**에서만 조회한다.

| 위치 | 코드 | 결과 |
| --- | --- | --- |
| `apps/web/components/cart-view.tsx:25` | `calculateCartTotals(items)` | `packages/commerce/src/index.ts:121`에서 `throw new Error('상품을 찾을 수 없습니다: <uuid>')` |
| `apps/web/components/cart-view.tsx:38` | `getProductById(item.productId)` | `undefined` → 카드가 `null` 렌더 |
| `apps/web/components/checkout-form.tsx:51` | `getProductById(...)` ×2 | 주문 상품 목록 공란, 상품 합계 0원 |

근거 체인:
1. `add-to-cart-button.tsx:18` — localStorage에 **실제 product.id / option.id(UUID)** 를 저장한다.
2. live DB의 product id는 `gen_random_uuid()` (initial_schema.sql:40). DEMO는 `'product-300'` 같은 문자열 (commerce/src/index.ts:6).
3. `getProductById`는 `DEMO_PRODUCTS.find(...)` 뿐이다 (commerce/src/index.ts:101-103).

→ live 상품을 "담기" 하면 `/cart`가 렌더 중 예외를 던진다. 지금 4개 육포 상품이 우연히 demo와 이름/가격이 같아 눈에 안 띄었을 뿐, id는 이미 다르다. [확인: live 4개 상품 모두 UUID]

**이건 상품 등록 기능보다 먼저 고쳐야 한다.** 대표님이 신상품 등록 → 담기 → 장바구니 = 에러 화면.

수정 방향: 클라이언트에서 금액을 계산하지 말 것. `POST /api/cart/quote`(서버) 에서 `loadCatalog` + `calculateCartTotalsFromLines`로 라인/금액을 내려주고 카트·체크아웃은 그 응답만 렌더. 부수효과로 클라이언트 가격 조작 여지도 사라진다.

### P0-2. `KGY001`이 9곳에 하드코딩되어 있고, 다른 코드 회원의 결제를 막는다 [확인]

```
apps/web/components/cart-view.tsx:45     /checkout?ref=KGY001   ← 장바구니에서 주문서로 가는 유일한 링크
apps/web/app/checkout/page.tsx:6         referralCode = ... || 'KGY001'
apps/web/components/checkout-form.tsx:11 referralCode = 'KGY001' (기본값)
apps/web/components/product-card.tsx:54  referralCode = 'KGY001' (기본값)
apps/web/components/site-header.tsx:9    /products?ref=KGY001
apps/web/app/page.tsx:12, cart-view:34, checkout-form:46, login-form:17
```

그리고 `apps/web/lib/order-service.ts:135`:

```ts
if (referralCode && referral.code !== referralCode.trim().toUpperCase())
  fail(400, '최초 가입 Referral Code와 다른 코드로 주문할 수 없습니다.');
```

장바구니 → 주문서 링크가 항상 `ref=KGY001`이므로, **가입 코드가 KGY001이 아닌 회원은 100% 400으로 결제가 막힌다.**

지금 안 터지는 이유: live `referral_codes`에 KGY001 하나뿐이고, 회원(`referral_relationships`)은 0명이다. [확인]
즉 **이정복 대표님 코드(LEE001 등)를 발급하는 순간 터진다.** 다음 주 작업 순서상 곧이다.

수정 방향: `ref`는 URL 파라미터가 아니라 세션에서 가져와야 한다. 가입 시 귀속이 고정되므로 클라이언트가 코드를 들고 다닐 이유가 없다. `CheckoutForm`에서 `referralCode`를 아예 안 보내고 서버가 `loadReferral`로 결정하게 하면 이 클래스의 버그가 통째로 사라진다.

### P0-3. 홈 FIRST DROP이 DEMO_PRODUCTS [확인, 핸드오프에 이미 기재]

`apps/web/app/page.tsx:15`. 링크는 slug 기반이라 지금은 우연히 live와 맞지만, slug가 다른 신상품을 올리면 홈에 안 뜨고 기존 카드는 유효한 링크로 남는다. slug를 바꾸면 홈 카드가 404로 간다.

---

## 2. P1 — 보안 / 권한 구조

### P1-1. 관리자 인가가 layout에만 있다 [확인 / 영향은 추론]

- `apps/admin/app/(admin)/layout.tsx` → `AdminShell`이 `canRenderAdmin()`으로 막는다.
- 그런데 `apps/admin/app/(admin)/products/page.tsx:11`, `orders/page.tsx:19` 등 **page 컴포넌트는 layout과 병렬로 실행**된다 (Next.js App Router).
- `apps/admin/lib/admin-data.ts:17`은 인자 없이 `createServiceRoleSupabaseClient()`를 만들어 **RLS를 우회해 전체 테이블을 읽는다.** 인증 인자를 받지 않는다.
- `apps/admin`에는 `middleware.ts`가 **없다** (apps/web에는 있음).

결과: 비로그인 요청이 `admin.dealkey.co.kr/orders`에 오면, 화면엔 "권한 필요" 카드가 뜨지만 **service role 전체 조회는 이미 실행된다.** children이 렌더되지 않아 HTML로 새어나가지는 않는 것으로 보이나 [추론], 이건 우연에 의존하는 구조다. Next.js 공식 문서도 layout을 인가 지점으로 쓰지 말라고 명시한다. 스트리밍, Server Action, 페이지 내부 리다이렉트 같은 변경 하나로 실제 유출이 된다. 당장은 무인증 DB 부하/과금 증폭 경로다.

수정: (a) `apps/admin/middleware.ts` 추가, (b) `admin-data.ts`의 모든 함수가 `AppSupabaseClient`를 **인자로 받게** 바꿔서 `getAdminContext()`를 통과하지 않으면 애초에 클라이언트를 못 만들게 한다.

### P1-2. env가 빠지면 조용히 "데모 모드"로 폴백한다 [확인]

`hasSupabaseEnv()`가 false면:

- `apps/web/app/api/orders/route.ts:28-38` → 실제 저장 없이 **"주문이 접수됐어요"** 성공 응답. 고객은 주문한 줄 안다.
- `apps/admin/app/api/products/route.ts:59`, settings/orders/refund/commissions/leads/promotions/referrals 전부 → **인증 없이** "데모 처리되었습니다" 200.
- `apps/admin/components/admin-shell.tsx:11` → `canRenderAdmin()`이 **true 반환**. 관리자 화면이 무인증으로 열린다.

Vercel 환경변수 하나 실수로 지우면 운영 쇼핑몰이 이 상태가 된다. 핸드오프 11절에 "동작이 다르다"고만 적혀 있는데, 실제 위험도는 그보다 높다.

수정: `NODE_ENV === 'production'`이면 env 미설정 시 fail-closed(503). 데모는 `DEMO_MODE=1` 명시 플래그로만.

### P1-3. 주문 시 상품 visibility를 검증하지 않는다 [확인]

`apps/web/lib/order-service.ts:81` — `.eq('status', 'active')`만 본다. `visibility='hidden'`인 상품도 id만 알면 주문된다. service role이라 RLS(`products_visible_read`)를 우회한다. 대표님이 "판매 내리기" 용도로 hidden을 쓰면 그대로 뚫린다.

### P1-4. anon 키로 referral / promotion 테이블을 전량 읽을 수 있다 [확인]

`supabase/migrations/20260819000100_initial_schema.sql`:
- `:494 referral_codes_validate` — anon SELECT 허용. **모든 활성 초대코드 + owner_user_id 열람 가능.**
- `:509 promotion_codes_read_active` — 모든 활성 프로모션 코드 열람.
- `:511 promotion_rules_read_active` — 할인율/최소주문금액 열람.

폐쇄몰인데 초대코드 목록이 공개 anon 키로 열린다. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 브라우저에 그대로 있으므로 누구나 `GET /rest/v1/referral_codes?select=*` 가능. 코드 검증은 이미 서버 라우트(signup)가 하고 있으니, 이 SELECT 정책은 admin 전용으로 좁혀야 한다.

### P1-5. `orders_insert_self` 정책 [확인]

`:517` — 로그인 회원이 Data API로 **임의 금액의 주문 row를 직접 삽입**할 수 있다 (`with check (auth.uid() = buyer_user_id)`만 검사). 결제/커미션은 못 만들지만 관리자 주문 목록이 오염된다. 서버가 service role로 넣으므로 이 정책은 불필요 — 삭제 권장.
`:526 refunds_insert_order_owner`도 같은 성격(금액 무검증).

### P1-6. 상품 등록 API가 인증 전에 파일을 파싱한다 [확인]

`apps/admin/app/api/products/route.ts:53-58` — `parseRequest()`(formData 전체 버퍼링) → 이미지 검증 → zod → **그 다음에** `getAdminContext()`. 비인증자가 최대 9×5MB 업로드를 서버에 밀어넣을 수 있다. 인증을 맨 앞으로.

### P1-7. 결제 webhook [확인]

`apps/web/app/api/payments/webhook/route.ts`:
- `:8` secret 비교가 `!==` (비상수시간). 낮은 위험이지만 `timingSafeEqual` 권장.
- `:13-17` **현재 주문 상태를 확인하지 않는다.** `cancelled`/`refunded` 주문도 `paid`로 되돌릴 수 있다. 리플레이 방어 없음.
- 검증자가 `MockPaymentProvider`라 `paymentId === 'mock_'+orderId`만 맞으면 통과. 실 PG 붙이기 전까지 이 엔드포인트는 secret 하나에 전적으로 의존한다.

### P1-8. 회원가입 시 고아 계정이 생길 수 있다 [확인]

`apps/web/app/api/auth/signup/route.ts:24-29` — `auth.signUp()` 성공 후 `profiles`/`referral_relationships` insert가 실패하면 **auth 사용자만 남는다.** 롤백 없음. 그 계정은 `loadReferral`이 403을 던져 영구적으로 주문 불가이고, 같은 이메일로 재가입도 안 된다. 특히 이메일 인증이 켜져 있고 service role env가 없으면 anon 클라이언트로 profiles insert를 시도 → RLS로 막힘 → 반드시 이 상태가 된다.

### P1-9. admin이 자기 프로필을 수정할 수 없다 [확인]

`:481 profiles_update_self` → `with check (auth.uid() = id and role = 'customer')`. 자기 권한 상승은 정확히 막혔지만(좋음), **role이 customer가 아닌 사용자는 display_name조차 못 바꾼다.** live의 유일한 프로필 `superkks`가 admin이므로 지금도 걸린다.

---

## 3. P2 — 데이터 정합성

### P2-1. 주문 생성이 트랜잭션이 아니다 [확인] — 가장 큰 구조적 부채

`order-service.ts:167-220`에서 8단계를 개별 호출한다: orders insert → order_items insert → 재고 예약 N회 → 결제 검증 → payments insert → orders update → commissions insert → promotion redeem → analytics.

- 실패 시 catch에서 수동 보상하지만, **보상 호출 자체의 에러를 확인하지 않는다** (`:213-217`).
- 프로세스가 중간에 죽으면(Vercel 함수 타임아웃/재시작) 보상이 아예 안 돈다 → 재고 reserved만 증가하고 주문은 payment_pending으로 좀비.
- 커미션 삽입 후 프로모션 redeem이 실패하면 커미션은 reversed로 바꾸지만 재고 release는 `Promise.all` 뒤 에러 무시.

수정: `public.create_order(...)` plpgsql 함수 하나로 옮겨 DB 트랜잭션에 맡긴다. 결제 승인만 밖에 두고, 나머지 DB 작업은 원자적으로. 실 PG 붙이는 시점에 어차피 다시 만져야 하니 그때 같이.

### P2-2. 가격 계산 엔진이 둘이고 로직이 다르다 [확인]

| | `calculateCartTotals` (:119) | `calculateCartTotalsFromLines` (:145) |
| --- | --- | --- |
| 사용처 | 클라이언트 카트, demo 주문 | 실제 주문 저장 |
| 데이터원 | DEMO_PRODUCTS | live DB |
| 배송비 | `lines[0].product.shippingFee` | `Math.max(...모든 라인)` |
| promotion productIds 조건 | **검사 안 함** | 검사함 |
| 무료배송 기준 | `50_000` 하드코딩 | `50_000` 하드코딩 |

같은 장바구니가 화면과 서버에서 다른 금액이 나올 수 있다. 무료배송 기준선도 코드 상수라 대표님이 못 바꾼다 → `store_settings`로 올려야 한다(배송 마감시간 옆에).

**엔진은 하나만 남겨야 한다.** P0-1 수정(서버 quote API)과 같은 작업이다.

### P2-3. 할인 배분 반올림 [확인]

`order-service.ts:187` — `Math.round(discount * subtotal / gross)`를 라인별로 계산. 합계가 `totals.discountAmount`와 1~N원 어긋날 수 있고, `order_items.commissionable_amount` 합 ≠ `orders.commissionable_amount`가 된다. 정산 대사 때 문제. 마지막 라인에 잔차를 몰아주는 방식으로 고정.

### P2-4. 부분환불인데 커미션을 전액 뒤집는다 [확인]

`apps/admin/app/api/orders/[id]/refund/route.ts:30` — `partially_refunded`여도 해당 주문 커미션 전체를 `reversed`로. 의도라면 문서화, 아니면 비율 차감. 정책 결정 필요.

---

## 4. P3 — 개발 인프라

### P3-1. `lint`가 lint가 아니다 [확인]

```json
"lint": "tsc --noEmit -p tsconfig.lint.json"   // apps/web, apps/admin
"lint": "tsc -p tsconfig.json --noEmit"        // 모든 packages
```

**ESLint 설정 파일이 저장소에 없다.** `pnpm check`의 "38 successful"은 tsc를 두 번 돌린 결과다. react-hooks 규칙, next/core-web-vitals, no-floating-promises 같은 게 전혀 안 돈다. `order-service.ts:210`의 await 없는 insert, `refund/route.ts:28-33`의 await 안 한 update 같은 게 걸렸어야 할 것들이다.

### P3-2. 테스트가 71줄 [확인]

`packages/commerce/test`(23줄) + `packages/referral/test`(48줄)가 전부. **돈을 만지는 `order-service.ts`(221줄), 관리자 API 8개, 가격/커미션 통합 경로에 테스트 0.** MVP 치고도 얇다. 최소한 (a) 할인+배송비 조합 금액, (b) 2단계 커미션 금액, (c) 재고 부족 시 롤백은 테스트가 있어야 한다.

### P3-3. 패키지 `dist` 빌드가 죽은 단계다 [확인]

`packages/*/package.json`의 `exports`는 `./src/index.ts`를 가리키고, 두 앱은 `transpilePackages`로 소스를 직접 컴파일한다. 그런데 `build: tsc -p tsconfig.json`이 `dist/`를 만들고, `turbo.json`의 `typecheck.dependsOn: ["^build"]`가 그 죽은 빌드를 강제한다. **아무도 안 쓰는 산출물을 만들려고 매 CI가 기다린다.** `dist` 빌드를 지우고 `typecheck`의 `build` 의존을 끊으면 CI가 눈에 띄게 빨라진다.

### P3-4. `admin/next.config.ts`에 `@closed-commerce/validation` 누락 [확인]

admin API 8개가 전부 이 패키지를 import하는데 `transpilePackages` 목록에 없다 (`apps/admin/next.config.ts:4-13`). 지금 빌드가 통과하는 건 Next가 알아서 해결하기 때문으로 보이나 [추론], 명시 목록과 실제 의존이 어긋난 건 잠재적 빌드 파손이다.

### P3-5. env 문서 불일치 [확인]

- `.env.example`에 `ADMIN_LOGIN_EMAIL_DOMAIN`이 없다 (핸드오프 3절에는 있음).
- `turbo.json`의 `globalEnv`/`build.env`에 `L1_COMMISSION_RATE`, `L2_COMMISSION_RATE`, `COMMISSION_APPROVAL_DAYS`가 없다. 런타임 조회라 동작엔 지장 없지만, `PAYMENT_WEBHOOK_SECRET`은 넣어놨으므로 기준이 없다.

### P3-6. `.gitattributes`가 없다 [확인]

`.gitignore`, `apps/web/tsconfig.json`, `apps/admin/tsconfig.json` 3개가 CRLF/LF 차이로 **항상 modified 상태**다. 핸드오프의 "작업 트리는 깨끗한 상태"와 실제가 다르다. `* text=auto eol=lf` 한 줄 추가 + `git add --renormalize .`로 끝난다.

---

## 5. 핸드오프 문서 정확도

맞는 것: Vercel/도메인/Supabase 구성, 마이그레이션 순서와 적용 상태, 상품 등록 흐름, 옵션가 의미, 이미지 처리, store_settings RLS 분리 경위. Security advisor `lints: []`도 재조회로 확인했다.

수정이 필요한 것:

| 문서 기술 | 실제 |
| --- | --- |
| "작업 트리는 깨끗한 상태" (2절) | 3개 파일 modified (CRLF) |
| 커밋 목록이 afcca0d까지 (2절) | HEAD는 82d99e9 (문서 커밋 3개 추가) |
| "홈 화면 상품 섹션만 demo" (6절, 11절) | **장바구니/주문서 전체가 demo 의존** — 훨씬 심각 |
| "pnpm check 38 successful" (3절) | lint == typecheck. 실제 lint는 없음 |
| 미기재 | KGY001 하드코딩으로 인한 결제 차단 |
| 미기재 | 관리자 인가가 layout에만 존재 |
| 미기재 | env 미설정 시 관리자 무인증 통과 |

---

## 6. 리팩토링 제안 (권장 순서)

| # | 작업 | 이유 | 규모 |
| --- | --- | --- | --- |
| 1 | 서버 `POST /api/cart/quote` 도입, 카트/체크아웃이 서버 금액만 렌더 | P0-1, P2-2를 동시에 해결. 클라 가격 조작도 차단 | 중 |
| 2 | `referralCode`를 URL에서 제거, 세션에서만 결정 | P0-2. 하드코딩 9곳 제거 | 소 |
| 3 | `packages/commerce`에서 `DEMO_*` 분리(별도 패키지 또는 삭제) | demo/live 혼입의 근원 | 소 |
| 4 | `DEMO_MODE` 명시 플래그 + production fail-closed | P1-2 | 소 |
| 5 | `apps/admin/middleware.ts` + `admin-data` 함수가 client를 인자로 받게 | P1-1. 인가와 권한 클라이언트를 타입으로 결속 | 중 |
| 6 | `withAdmin()` 핸들러 래퍼 | admin API 8개의 동일 보일러플레이트 4줄 × 8 제거 | 소 |
| 7 | RLS 정리: referral/promotion anon SELECT 제거, `orders_insert_self` 제거 | P1-4, P1-5 | 소 |
| 8 | ESLint 도입, `lint`를 진짜 lint로 | P3-1 | 소 |
| 9 | 패키지 `dist` 빌드 제거, `typecheck`의 `build` 의존 해제 | P3-3. CI 단축 | 소 |
| 10 | `create_order` plpgsql 단일 트랜잭션 | P2-1. 실 PG 연동과 함께 | 대 |
| 11 | 무료배송 기준액을 `store_settings`로 | P2-2 | 소 |
| 12 | `loadProductBySlug`가 전체 카탈로그를 로드하지 않게 (`catalog-data.ts:55`) | 상품 수 늘면 PDP마다 전체 스캔 | 소 |

---

## 7. 대표님 요청사항 관점 (카톡 기준)

| 요청 | 현재 구조에서의 난이도 |
| --- | --- |
| 카테고리 select UI | 쉬움. `categories` 테이블 + FK로 정리 권장 (지금은 자유 텍스트) |
| 배너 이미지 등록 | 중간. `store_settings`에 붙이거나 `banners` 테이블 신설. Storage 흐름은 재사용 가능 |
| 동영상(유튜브 링크) | 쉬움. `products.video_url` 컬럼 + 임베드. 직접 호스팅은 권고대로 피할 것 |
| 간편로그인(카카오/네이버/구글) | **주의.** 현재 `signup/route.ts`가 signUp과 referral 귀속을 한 트랜잭션처럼 처리하는데, OAuth 콜백에는 추천코드가 없다. "콜백 → 코드 입력 → 귀속 확정" 단계를 별도로 만들어야 하고, 그 사이 상태(코드 없는 회원)를 어떻게 다룰지 정책 결정이 필요하다 |
| 가격 비노출 → 코드 입력 시 노출 | **현재 구조로 안 됨.** `visibility`는 상품 전체를 숨기는 축이라 "상품은 보이고 가격만 숨김"이 표현 불가. `price_visibility` 축을 별도로 추가해야 한다 |
| 배송 마감 설정 | 값 저장·표시는 됨. **출고일 자동 계산·주말/공휴일 예외는 미구현** |
| 상품 수정/삭제 | **없음.** 대표님이 지금 테스트 등록을 시작하면 잘못 올린 상품을 DB에서 직접 지워야 한다. 등록 다음으로 가장 급한 기능 |

---

## 8. 다음 세션 체크리스트 보정

핸드오프 12절에 추가:

```
git config core.autocrlf  # 또는 .gitattributes 도입 여부 확인
```

그리고 상품 등록 테스트 전에 **반드시** 확인:

1. 신규 상품 담기 → `/cart` 정상 렌더되는지 (지금은 예외 예상)
2. `/checkout?ref=` 없이 진입 시 결제되는지
3. 관리자 로그아웃 상태에서 `admin.dealkey.co.kr/orders` 호출 후 Supabase 로그에 쿼리가 찍히는지
