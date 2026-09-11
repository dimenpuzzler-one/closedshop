# Dealkey(딜키) 핸드오프 문서

> 마지막 갱신: **2026-09-11 (Asia/Seoul)** — 장바구니 대표 이미지·삭제 동작과 PayDataKR 팝업 결제 흐름 반영
> 저장소: https://github.com/dimenpuzzler-one/closedshop
> 이전 판(2026-08-21)은 결제 이전 상태 기준이라 상당 부분이 더 이상 맞지 않습니다. 이 문서가 최신입니다.

다음 세션의 작업자가 다시 조사하지 않고 바로 이어갈 수 있도록 쓴 문서입니다.
**11절(함정)을 먼저 읽으세요.** 여기 적힌 것들은 전부 실제로 한 번씩 터졌던 것이고, 모르면 같은 자리에서 다시 막힙니다.

---

## 0. 지금 가장 중요한 사실

**실제 결제 이력이 있습니다. 진짜 돈이 오갑니다.**

- 기존 실결제: 2026-09-01 11:44 KST, 13,900원, 주문번호 `DK20260901C48E74B901`
- PG사: **한국결제데이터(PayDataKR) 인증결제** 운영 적용 완료
- PayDataKR 테스트 승인: 2026-09-09 12:53 KST, 1,000원, 주문번호 `19FI5JGU1A7LK`, 거래번호 `T260909294495`
- 위 테스트 건에서 webhook·return 모두 `0000` 수신, Pay Key 거래 재조회·금액 검증·`order.finalize stage=paid`까지 확인
- 기존 결제 이력은 삭제하거나 재매핑하지 않고, 신규 결제부터 `paydatakr`로 기록합니다.
- 대표님 요청에 따라 고객 홈은 운영 설정에 등록된 카테고리만 카테고리별 상품 섹션으로 노출하고, 관리자는 카테고리별 드롭다운 또는 드래그로 상품을 재정렬할 수 있습니다.
- 고객몰 상단 메뉴는 카테고리 링크를 제거하고 `상품 둘러보기`와 `기업·단체 견적`만 노출합니다.
- 장바구니와 주문서에는 상품 대표 이미지가 표시되고, 이미지가 없으면 `/brand/dealkey-mark-256.png`를 기본 이미지로 사용합니다. 수량 변경·삭제와 `상품 더 담기`가 제공됩니다.
- 결제 버튼은 `popuptype=popup`으로 이름 있는 결제창에 전송하며, 브라우저 팝업 차단 시 현재 창으로 자동 전환합니다.
- 결제 예정 금액이 5만원 이상이면 결제 팝업 안에서 `00` 또는 `02`~`12`개월을 선택할 수 있습니다. 주문서 앞단에는 할부 선택을 두지 않습니다. 5만원 미만 주문은 서버가 `00`으로 강제합니다. 공식 매뉴얼은 `HalbuInfo`를 단일 필수 문자열로 정의하고 `00`은 일시불, `02`~`12`는 할부개월로 설명합니다. `PAYDATAKR_HALBU_INFO`는 팝업 선택값이 없는 서버 호출에서 사용할 기본 요청값으로 검증합니다.

따라서 이제부터 주문/결제/재고 코드를 건드릴 때는 **운영 데이터가 이미 있다**는 전제로 작업해야 합니다.
`orders`, `payments`, `commissions`에 실제 거래 기록이 있습니다. 주문 row를 지우면 매출·정산이 어긋납니다.

배송지 주소록 DB 마이그레이션은 live 적용됐습니다. `closed-commerce-web` Production에는
행정안전부 도로명주소 검색 API 운영 승인키 `JUSO_API_KEY`가 설정되어 있습니다.

---

## 1. 프로젝트 한눈에 보기

Dealkey는 추천 코드(Referral Code)로만 입장하는 폐쇄형 특판몰입니다.

| 영역 | 위치 | 운영 주소 |
| --- | --- | --- |
| 고객몰 | `apps/web` | https://dealkey.co.kr |
| 관리자 | `apps/admin` | https://admin.dealkey.co.kr |
| 공용 타입/DB | `packages/types`, `packages/db` | — |
| 공용 로직 | `packages/commerce`, `referral`, `validation`, `payment` | — |
| DB | `supabase/migrations` | Supabase `uoqudjsmeqgdkijcltpp` (ap-northeast-2 서울) |

- 사업자: 도미니언(Dominion), 대표 이정복 / 사업자등록번호 818-06-03297 / 통신판매업 2025-고양일산동-1946호
- 개발: 김건엽
- 스택: Turborepo, pnpm 11.3.0, Next.js 15.5.7 App Router, React 19.1.0, TypeScript strict(`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Supabase, Vercel

### 수수료 구조

2단계(L1 8%, L2 3%)까지만. L3 없음. 요율은 **주문 시점에 snapshot**되므로 나중에 요율을 바꿔도 과거 주문은 안 변합니다.
`COMMISSION_APPROVAL_DAYS=7` — 환불 가능 기간이 지나야 `pending → approved`가 됩니다.

---

## 2. 배포 구조와 작업 흐름

### Vercel

- Team: `withclaudefirst` (`team_LHiA5MrOO1c7bYleLwBhDUGI`)
- 프로젝트: `closed-commerce-web`, `closed-commerce-admin`
- `main`에 push하면 두 프로젝트가 자동 배포됩니다.
- **두 앱 모두 `vercel.json`에 `"regions": ["icn1"]`이 반드시 있어야 합니다.** 이유는 11.3절.

### 컨테이너에서 작업할 때의 배포 경로

작업 환경(Claude 컨테이너)에는 **GitHub push 권한이 없습니다.** 그래서 이렇게 넘깁니다.

    # 컨테이너에서
    git bundle create /tmp/_fix.bundle <배포된_커밋>..HEAD --branches

    # 형님 PC(C:\dev\closedshopping)에서
    git fetch .\_fix.bundle main:refs/remotes/dev/fix
    git merge --ff-only refs/remotes/dev/fix
    git push origin main
    Remove-Item .\_fix.bundle -Force

번들의 **전제 커밋(prerequisite)이 PC의 HEAD와 같아야** ff-only 병합이 됩니다.
번들을 만들기 전에 `git log --oneline -1`로 PC HEAD를 반드시 확인하세요.
"does not appear to be a git repository" 오류는 대개 번들 파일을 그 폴더에 저장하지 않은 것입니다.

### 배포됐는지 확인하는 법 (말이 아니라 실물로)

Vercel 목록의 최신 Production 커밋을 보고, 실제로 내려오는 JS를 읽습니다.

    // 브라우저 콘솔에서
    const urls = [...new Set(performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('.js')))];
    for (const u of urls) {
      const t = await fetch(u).then(r => r.text());
      if (t.includes('찾는_문자열')) console.log('있음:', u);
    }

"푸시했다"와 "배포됐다"는 다릅니다. 실제로 한 번 어긋난 적이 있습니다.

---

## 3. 환경변수

### `closed-commerce-web` (Production 기준 현재 설정된 값)

| 이름 | 비고 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | |
| `NEXT_PUBLIC_WEB_URL` | **`https://dealkey.co.kr`** — 11.2절 참고 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 |
| `PAYDATAKR_PUBLIC_KEY` | 인증결제 form에 쓰는 `pk_` 공개 키 |
| `PAYDATAKR_PAY_KEY` | **서버 전용 API 인증 키** |
| `PAYDATAKR_API_BASE_URL` | 기본값 `https://api.paydatakr.com` |
| `PAYDATAKR_RECEIPT_BASE_URL` | 기본값 `https://mcht.paydatakr.com/trx/receipt` |
| `PAYDATAKR_HALBU_INFO` | 선택값. 기본 `00`(일시불), `02`~`12`개월 할부 요청 |
| `JUSO_API_KEY` | 행정안전부 도로명주소 검색 API 운영 승인키, 서버 전용 |

### `closed-commerce-admin`

위 공용 3개 + `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_LOGIN_EMAIL_DOMAIN`, `PAYDATAKR_PAY_KEY`, `PAYDATAKR_API_BASE_URL`.
`NEXT_PUBLIC_WEB_URL`은 어드민에도 필요합니다(`admin-shell.tsx`가 고객몰 링크에 씁니다). 없으면 localhost를 가리킵니다.

### 절대 규칙

- `SUPABASE_SERVICE_ROLE_KEY`와 `PAYDATAKR_PAY_KEY`에 **`NEXT_PUBLIC_` 접두사를 붙이면 안 됩니다.** 붙는 순간 브라우저 번들에 들어가고, Pay Key가 새면 누구나 결제 취소 API를 호출할 수 있습니다.
- 운영 계정 비밀번호와 Pay Key 값을 **이 문서·Git·채팅에 적지 않습니다.** 값이 필요하면 Vercel 환경변수 화면에서 직접 넣으세요.
- `NEXT_PUBLIC_` 변수는 **빌드 타임에 번들에 박힙니다.** 값만 바꾸고 재배포하지 않으면 예전 값이 그대로 돕니다.

---

## 4. 결제(한국결제데이터 인증결제)

### 흐름

    고객: 결제하기
      → POST /api/orders          주문 생성 + 재고 예약(status=payment_pending), 인증결제 필드 반환
      → PayDataKR /kpdWebPayment/KpdCredit     별도 결제창으로 form POST(popuptype=popup, 팝업 차단 시 현재 창)
      → 카드 인증
      → 한국결제데이터가 webhookUrl에 JSON POST
           결과코드·주문번호·금액·거래번호 검증 → payments row 선점 → 주문 확정 → result=0000 응답
      → returnUrl form POST
           /api/payments/paydatakr/return으로 결과 전달 → Pay Key 재조회·확정
      → /checkout/result로 이동

### 핵심 파일

- `packages/payment/src/paydatakr.ts` — 위젯 토큰 발급·form 파라미터·환불 API·중첩/평면 결과 파싱
- `apps/web/lib/paydatakr-config.ts` — 설정과 callback URL
- `apps/web/lib/order-service.ts` — `prepareOrder()` / `finalizePayDataKrOrder()`; 미인증 실패 통보는 DB 취소를 하지 않으며 미완료 주문은 만료 작업으로 정리
- `apps/web/app/api/payments/paydatakr/return/route.ts` — 브라우저 리턴 수신
- `apps/web/app/api/payments/paydatakr/webhook/route.ts` — JSON 웹훅 수신
- `apps/web/components/checkout-form.tsx` — 팝업을 우선 사용하고 차단 시 현재 창으로 전환하는 인증결제 form POST
- `apps/web/app/api/payments/paydatakr/cancel/route.ts` — 취소 GET/POST를 303으로 결과 페이지에 연결

### 규칙

- 결제창은 서버가 만든 공식 인증결제 필드를 `KpdCredit`에 form POST합니다. `returnUrl`, `webhookUrl`, `cnclreturnUrl`은 필수입니다. 취소 URL은 페이지가 아닌 취소 API입니다(페이지로 cross-origin POST하면 Next.js가 500 반환).
- `PAYDATAKR_PAY_KEY`는 서버의 `Authorization` 헤더에만 사용합니다.
- `trackId`는 중복되지 않는 가맹점 주문번호이며 최대 50자입니다.
- 기존 쇼핑몰 최소 주문금액 **1,000원** (새 PG의 최소 금액으로 확인된 값은 아님)
- return/webhook 요청은 외부에서 오므로 **금액·주문번호를 그대로 믿지 않습니다.** 주문번호로 DB의 주문을 찾아 저장된 금액과 대조합니다.
- 웹훅은 문서상 재통보가 없으므로 수신 처리 후 `result=0000`을 회신하고, 별도 조회 기능으로 대사를 보완해야 합니다.
- 이중 확정 방지: `payments.order_id` UNIQUE로 선점합니다.

---

## 5. 재고 예약과 자동 만료 (2026-09-01 추가)

결제창을 열 때 재고를 먼저 잡습니다. 남은 하나를 두 사람이 동시에 사는 것을 막기 위해서입니다.
문제는 **고객이 결제창을 그냥 닫으면 그 예약이 안 풀린다**는 것이었고, 실제로 재고 1개짜리 상품에서 터졌습니다.
대표님이 결제를 끝내지 않고 나갔다가 본인이 다시 들어가서 "재고가 부족합니다"를 봤습니다.

### 지금 구조

- `public.expire_stale_pending_orders(p_minutes integer default 20)`
  20분 넘은 `payment_pending` 주문을 `cancelled`로 바꾸고 예약 재고를 되돌립니다. 취소 건수를 반환합니다.
  20분은 기존 정리 유예시간입니다. 새 PG 세션 유효시간과 승인 통보 지연에 안전한지는 실연동 검증이 필요합니다.
- **pg_cron 이 5분마다 실행**: 잡 이름 `expire-stale-pending-orders`, 스케줄 `*/5 * * * *`
- `prepareOrder()`가 재고를 세기 **직전에 한 번 더** 호출합니다. 방금 결제창을 닫고 다시 들어온 고객이 cron을 기다리지 않게 하려고요.

확인:

    select jobname, schedule, active from cron.job where jobname = 'expire-stale-pending-orders';
    select public.expire_stale_pending_orders(20);   -- 수동 실행, 취소된 건수 반환

    -- 재고 현황
    select p.name, i.quantity, i.reserved_quantity, i.quantity - i.reserved_quantity as available
    from inventory i join products p on p.id = i.product_id order by p.name;

`reserved_quantity`는 결제완료 주문의 몫도 포함합니다. 결제된 주문의 예약은 풀지 않는 것이 정상입니다.

---

## 6. Supabase 현재 상태

- Project ref: `uoqudjsmeqgdkijcltpp`, region `ap-northeast-2`(서울), Postgres 17
- 회원 3명(관리자 2), 활성 추천코드 2개, 주문 8건(실주문 1건), 카테고리 4개
- Storage bucket `product-images`: **public**. 개인정보성 이미지 금지.

### 마이그레이션 (전부 live 적용됨)

    20260819000100_initial_schema
    20260820000100_harden_function_execution
    20260821000100_product_image_storage
    20260821000200_product_media_indexes
    20260821000300_product_categories_shipping_settings
    20260821000400_backfill_existing_product_categories
    20260821000500_refine_store_settings_policies
    20260821000600_tighten_public_read_policies
    20260824070530_fix_product_media_and_atomic_updates
    20260824100000_edit_product_option_labels
    20260826090000_store_settings_categories_home
    20260828090000_category_tree_code_labels_withdrawal
    20260828091000_admin_update_product_withdrawal
    20260831090000_product_image_role
    20260901034111_shipping_address_book
    20260901040000_expire_stale_pending_orders
    20260901040407_revoke_stale_order_expiry_public_access
    20260902070659_add_product_home_sort_order
    20260902080253_home_banner_builder
    20260902082910_optimize_home_banner_policies
    20260902084211_enforce_home_banner_limit
    20260903021107_add_site_theme_settings
    20260903023449_auto_pause_out_of_stock   ← 최신

**새 DB 변경은 반드시 새 timestamp 마이그레이션 파일로 만들고, live에 적용한 뒤 Git에 커밋합니다.**
이미 적용된 마이그레이션을 다시 실행하지 마세요.

### 주요 RPC

| 함수 | 역할 |
| --- | --- |
| `reserve_inventory(product_id, qty)` | 가용 재고가 충분할 때만 예약. 실패 시 false |
| `release_inventory(product_id, qty)` | 예약 반환. 0 아래로 안 내려감 |
| `expire_stale_pending_orders(minutes)` | 위 5절 |
| `admin_update_product(product_id, patch)` | 상품 수정 원자적 처리 |
| `redeem_promotion_code(...)` | 프로모션 사용 처리 |

---

## 7. 어드민 기능 현황

`apps/admin/app/(admin)/` 아래: 대시보드, `products`, `orders`, `members`, `referrals`, `promotions`, `settlements`, `leads`, `analytics`, `settings`

### 상품 관리

- 등록/수정/삭제 모두 있습니다.
- 상품 목록 `관리` 열에 `수정`과 `삭제`가 나란히 있습니다. 삭제는 확인창 후 처리되고 성공 즉시 목록에서 사라지며, 주문 이력이 있으면 API가 삭제를 막고 판매 중지로 안내합니다.
- `노출` 체크박스는 노출/비공개를 즉시 전환합니다(비공개에서 다시 켜면 추천 회원 대상). `판매 상태` 체크박스는 판매중·판매중지를 즉시 전환합니다. 재고가 0개이면 DB가 판매중 전환을 거부합니다.
- `재고` 체크박스는 판매 가능 수량(실재고 - 예약)을 나타내는 읽기 전용 표시입니다. 수량은 `수정` 패널에서 바꿉니다. 옵션이 여러 개여도 상품 단위 inventory를 중복 합산하지 않습니다.
- `inventory_pause_product_when_empty` 트리거가 판매 가능 재고 0개 시 active 상품을 paused로 바꿉니다. 재고를 다시 넣어도 자동 재개하지 않으며 운영자가 상태 체크를 직접 켜야 합니다.
- 카테고리는 자유 입력이 아니라 **2단계(대분류 > 소분류) 선택**입니다. 목록은 운영 설정에서 관리합니다.
- 이미지: 한 장 최대 **20MB**, 상품당 **21장**, 한 번에 200MB. JPEG/PNG/WEBP만.
  Vercel 함수를 거치지 않고 **signed URL로 Storage에 직접 업로드**합니다(4.5MB 본문 한도를 피하려고).
- 이미지 용도가 `product_images.role`에 저장됩니다: `thumbnail`(목록 썸네일 + 상세 상단 갤러리) / `detail`(상세 본문).
  **썸네일도 여러 장 가능**합니다. 고객몰이 `role='thumbnail'`인 이미지를 전부 상단 갤러리로 보여줍니다.
- 고객몰 상품 목록과 장바구니 견적은 `role='thumbnail'` 이미지만 조회합니다. 상세 페이지는 `thumbnail`과 `detail`을 모두 읽습니다.
- 고객몰의 모든 원격 상품·배너 이미지는 `next/image` 최적화 경로를 사용해 WebP를 우선 제공하고, 원본 Storage 객체는 보존합니다. 관리자 미리보기는 원본을 확인할 수 있습니다.
- 육포 선물세트 **600g·480g**에는 850×850 실제 대표 썸네일이 등록되어 있습니다. 기존 세로형 상세 이미지는 그대로 `detail`로 보존합니다.
- 등록·수정 화면 모두 미리보기에서 **파일 한 장씩 빼기**가 됩니다(`ImagePicker`, `DataTransfer`로 FileList 재구성).
- 상품 수정 화면은 상단 `수정 내용 저장`을 눌러도 선택한 썸네일·상세 이미지가 함께 업로드됩니다. 사진만 올릴 때는 아래 `원본 화질로 사진 추가` 버튼을 사용합니다.
- 가격은 `회원가`와 `온라인가`를 별도로 입력합니다. 기존 `products.supply_cost` 컬럼은 온라인가 저장용으로 호환 사용하며, 옵션가 입력란은 제거하고 회원가를 첫 옵션 가격으로 동기화합니다.

### 주문 관리

- 기본은 **실제 주문만** 표시. `결제대기·취소 포함` 토글로 전부 볼 수 있습니다.
- 배송지(수령인/연락처/우편번호/주소/요청사항)가 표에 나옵니다.
- 결제대기 주문에는 **정리(재고 반환)** 버튼 — `PATCH {status:'cancelled'}`가 재고까지 되돌립니다.
- **엑셀 다운로드**: BOM 붙인 CSV라 더블클릭하면 엑셀에서 한글이 안 깨집니다. 배송지 포함.
- 배송 처리는 실제 택배사·운송장 번호를 입력해야 하며 `입력 필요` 같은 임시값은 API가 거부합니다. 허용된 상태 전이만 가능하고, 결제된 주문을 일반 상태 변경 API로 취소·환불 완료 처리할 수 없습니다.
- **주문 row는 지우지 않습니다.** 정산·수수료·감사 기록이 걸려 있습니다. 숨기기 + 재고 반환으로 같은 목적을 달성합니다.

### 운영 설정 (`settings`) / 홈페이지 꾸미기 (`homepage`)

`/settings`는 배송비 정책(박스당 수량/요금/무료배송 기준), 카테고리 트리, 배송 마감 시간을 관리합니다.
`/homepage`는 홈 전체 이미지 배너 추가·순서·노출·삭제와 자동 전환 시간(2~30초), 기본 문구·유튜브, 화면 분위기·폭·간격 프리셋, 상품 진열 순서를 관리합니다. 배너는 최대 12장, 권장 1600×600px이며 클릭 링크나 상품 보기 버튼은 없습니다.
활성 배너는 `home_banners`에서 순서대로 읽고, 이미지 파일은 공개 `product-images/banners/` 경로에 서명 업로드합니다. DB 등록 전 실패하면 미등록 파일만 정리하며, 완료 응답 유실 후 재시도는 중복 생성하지 않습니다. DB 트리거가 동시 업로드 상황에서도 최대 12장을 보장합니다. 활성 배너가 없으면 기본 소개 화면을 표시합니다.
관리자 미리보기는 실제 등록 상품과 저장된 설정으로 PC/모바일, 회원/비회원 가격 화면을 전환합니다. 고객 홈의 배너는 일반 본문보다 넓은 최대 1480px이며 모바일에서는 2:1 영역 안에 원본 비율을 유지해 전체 이미지를 표시합니다. `/homepage` 상품 진열 편집기는 카테고리별 그룹으로 보여주며 드롭다운에서 원하는 순번을 선택하거나 드래그로 순서를 바꾸면 즉시 저장합니다. 각 그룹에서 `home_sort_order`가 작은 상품이 먼저 나옵니다. 상품 상태도 `판매중`/`판매중지중`으로 함께 표시하고, `hidden` 상품은 회원 여부와 무관하게 고객 목록과 미리보기 모두에서 제외됩니다. 운영 설정에 없는 상품 카테고리는 고객 홈과 미리보기에서 제외됩니다. 비회원 화면의 온라인 기준가는 빨간색 취소선으로 표시해 회원가와 구분합니다. 홈의 별도 기획전 상품 분류 영역은 제거했습니다.
배송비는 하드코딩이 아니라 `store_settings`에서 옵니다: `calculateShippingAmount(quantity, netAmount, policy)`.

어드민 상단의 `로그아웃`은 `/api/auth/logout` POST를 거쳐 Supabase Auth 세션을 종료하고 `/login`으로 돌아갑니다. 미들웨어에서도 이 경로만 공개 예외로 둡니다.

---

## 8. 고객몰 기능 현황

- 폐쇄몰: 비로그인/비귀속 방문자에게는 상품·상세 내용·온라인가는 보여주고 회원가만 가립니다. 회원가는 렌더링에서 숨기는 게 아니라 **payload에서 제거**합니다(`stripPrices()`).
- 상품 카드·상세 가격은 `온라인가`(할인 전, 설정 시 취소선)와 `회원가`로 나눠 표시합니다. 비로그인 상태에는 `회원가입 후 회원가 확인` 안내가 나옵니다.
- 상세페이지: 상단 갤러리 + 수량 선택 + `장바구니 담기` / `바로구매`, 하단에 상세 이미지(접기/`상세정보 더보기`, 전부 lazy)
- `바로구매`도 장바구니를 거칩니다 — 금액 계산 경로를 하나로 유지하려고 일부러 그렇게 했습니다. 두 경로가 각자 계산하면 화면과 결제 금액이 어긋납니다.
- 장바구니 금액은 전부 서버(`POST /api/cart/quote`)가 계산합니다.
- `/account/addresses`: 배송지 추가·삭제·기본 배송지 지정. `addresses`는 본인 행만 CRUD 가능하고 사용자의 기본 배송지는 DB에서 1개만 허용합니다.
- `/account`: 주문 내역·장바구니·배송지 관리의 회원 허브. 본인 추천코드별 직접 유입 회원 수, 유입 회원의 표시명·가입일·유입 방식과 기록된 UTM, 수수료 요약을 보여줍니다. 추천 유입 회원 조회는 현재 로그인한 referrer에 귀속된 관계만 읽도록 제한합니다. 로그아웃은 헤더가 아니라 마이페이지 상단에서 제공합니다.
- `/account/orders`: 회원 이름을 제목에 넣고 장바구니 바로가기를 제공합니다. 결제창을 열었다가 실패·이탈한 `payment_pending`/미결제 `cancelled` 주문은 DB에 보존하되 고객 주문 내역에서는 숨기고, 실제 결제된 취소·환불 이력만 노출합니다.
- 고객몰 헤더의 중앙 메뉴는 상품 둘러보기·기업·단체 견적만 두고, 장바구니와 회원 영역을 오른쪽에 둡니다. 비로그인 상태에는 `회원가입`·`로그인`, 로그인 상태에는 회원 이름/마이페이지 링크가 보이며 회원 이름 영역은 `/account`로 이동합니다.
- 회원가입은 홈의 `초대코드로 가입 승인 받기`에서 시작합니다. `/api/referral/validate`가 코드를 서버에서 먼저 확인하고 10분짜리 HttpOnly 검증 쿠키를 발급한 뒤에만 `/signup` 폼을 엽니다. 코드가 없거나 쿠키와 코드가 일치하지 않으면 홈의 승인 영역으로 되돌리고, 실제 가입 API에서도 최종 검증을 다시 합니다.
- 결제 페이지: 지난번 선택한 기본 배송지를 자동으로 채우고 다른 저장 배송지 선택/새 배송지 입력/주소록 저장이 됩니다. 저장 배송지를 선택하면 다음 주문의 기본 배송지로 기록됩니다.
- 새 배송지의 우편번호·주소 칸은 클릭/포커스 시 주소 검색을 열며 행정안전부 검색 결과를 선택해야 채워집니다. 연락처는 행안부 API 제공값이 아니므로 받는 분/보내는 사람을 직접 입력합니다.
- 결제 페이지의 보내는 사람은 기본값을 `딜키`로 표시하고 구매자가 수정할 수 있습니다. 보내는 사람/연락처는 받는 분과 분리해 주문 스냅샷에 보관하고, 결제 고객 정보에는 입력한 보내는 사람을 우선 사용합니다.
- 주소 찾기: 브라우저 → `/api/address/search` → 행정안전부 도로명주소 검색 API. 승인키는 서버에만 있고 우편번호·행정구역·행안부 식별값을 주소록에 함께 저장합니다.
- 주문 배송지는 계속 `orders.address_snapshot`에 복사합니다. 주소록을 수정·삭제해도 이미 접수된 주문은 바뀌지 않습니다.
- 배송 요청사항 선택지: 문 앞/직접 수령/경비실/택배함
- 법적 페이지: `/legal/terms`, `/legal/privacy`, `/legal/refund`
- 상품별 **청약철회 제한 안내**를 상세페이지 구매 버튼 위에 표시합니다(전자상거래법 제17조 제2항 단서 — 미리 명확히 표시하지 않으면 제한을 주장할 수 없습니다).

---

## 9. 로컬 실행

    pnpm install
    pnpm dev          # web :3000, admin :3001

    pnpm check        # lint + typecheck + test + build

루트 `.env.local`에 값을 넣습니다. 형식은 `.env.example` 참고.
환경변수가 없으면 데모 카탈로그로 뜹니다. **production에서는 데모 모드가 절대 활성화되지 않습니다**(fail-closed).

---

## 10. 남은 일

> 2026-09-09 대표님 요청(모바일 배너 잘림, 상품·카테고리 노출 순서, 상단 카테고리 메뉴 제거, 카테고리별 홈 노출, 기획전 상품 분류 제거)은 반영 완료했습니다. 아래는 별도 남은 일입니다.

### 운영 설정 필요

- 행정안전부 도로명주소 **검색 API 운영 승인키**는 Vercel `closed-commerce-web` Production의 `JUSO_API_KEY`에 설정되어 있습니다. 변경 시 새 배포가 필요하며 `NEXT_PUBLIC_` 접두사는 금지입니다.

### 대표님 요청 중 미구현

1. **간편 회원가입**(구글/카카오/네이버) — 구글은 바로 가능, 카카오는 제한 있음
2. **가입 순서 미합의** — 대표님: "구글 가입 먼저 → 추천인 코드" / 형님: "추천인 코드 없으면 가입 자체가 안 되는 게 맞다". 결정 필요
3. 리뷰 기능 — 보류(회원제라 의미 있는지 미결)
4. 가입 전 회원가 노출 여부 — 온라인가는 공개하고 회원가는 가입 후 공개하는 것으로 확정

### 운영/법무 미결

5. 3PL 정식 상호를 개인정보 위탁 표에 기입
6. 한국결제데이터(PayDataKR) 상호를 위탁 표에 기입
7. 개인정보 **국외이전** 고지 — Vercel 실제 처리 지역 확인 필요(개인정보 보호법 제28조의8)
8. 한국결제데이터 **취소/환불 운영 정보** — 관리자 환불은 `/api/refund` 연동으로 처리하며, 운영 키와 원거래 필드 검증이 필요합니다
9. 이메일 인증(Confirm email) — 가입 API는 `admin.createUser(email_confirm=true)`로 확인 메일을 사용하지 않음. 호스티드 Supabase 프로젝트 전역 토글은 대시보드 로그인 후 필요 시 별도 확인
10. `tester@dealkey.co.kr` 오픈 전 삭제

### 기술 부채 (2026-09-01 코드 점검에서 확인)

11. `apps/admin/app/api/products/route.ts`의 **multipart 분기가 죽은 코드**입니다(~130줄). 등록 폼은 항상 JSON으로 보내고 이미지는 별도 경로로 올립니다. 이 죽은 경로에 4MB 제한이 남아 있어 실제 20MB 제한과 어긋나 보입니다
12. `order-service.ts`(521줄)와 `cart-pricing.ts`가 **상품/옵션/재고 조회 로직을 각각 따로** 갖고 있습니다. 한쪽만 고치면 장바구니 미리보기와 실제 결제 금액이 갈라집니다
13. `OrderStatus`/`CommissionStatus` 값 목록이 `types` / `validation` / `db` **세 곳에 따로** 박혀 있습니다
14. `packages/validation`, `packages/payment`의 `@closed-commerce/types` 의존성이 선언만 되고 안 쓰입니다
15. 어드민 폼 3개에 `readResponse`/에러 처리가 거의 같은 모양으로 복붙돼 있습니다

### 데이터 정리

16. 육포 420g 두 종(`...420g`, `...420g+쇼핑백`)은 `status='paused'`, 이미지 0장입니다. 판매하려면 이미지 등록 + active 전환 필요
17. **과대 이미지 4장** — 업로드 한도(20MB) 안이라 통과했지만 실제로는 너무 큽니다. 특히 대표 이미지는 목록 카드에도 쓰여서 목록 로딩을 직접 끌어내립니다.

    | 상품 | 용도 | 크기 | 픽셀 |
    | --- | --- | --- | --- |
    | 육포 300g+쇼핑백 | **대표** | 20.3MB | 6616×4411 |
    | 그릭요거트 메이커 | 상세 | 19.7MB | 1080×54562 |
    | 주방세제 500ml | 상세 | 14.0MB | 1080×46207 |
    | 오토웍 회전냄비 | 상세 | 10.7MB | 1000×25961 |

    대표 이미지는 1080×1080 내외로 줄여서 재등록하는 게 맞습니다. 상세 이미지는 세로로 긴 게 정상이지만 `상세정보 더보기` 아래에 접혀 있고 전부 lazy라 첫 화면은 막지 않습니다.

---

## 11. 함정 — 이거 모르면 같은 자리에서 막힙니다

### 11.1 한국결제데이터 SDK와 키 역할

현재 결제 경로는 `buildCheckoutParams()`로 만든 인증결제 필드를 `/kpdWebPayment/KpdCredit`에 form POST한다. SDK·위젯 토큰 경로는 사용하지 않는다. 별도의 `PAYDATAKR_CHECKOUT_URL`은 필요하지 않다. `PAYDATAKR_PAY_KEY`는 서버가 `/api/get`·환불 요청의 `Authorization` 헤더에만 사용한다. 2026-09-09 실제 신한카드 인증 화면 진입과 1,000원 테스트 승인, webhook·return 수신, Pay Key 재조회, 주문 `paid` 확정을 확인했다. 환불은 아직 실행하지 않았다.

SDK callback은 중첩 `result`/`pay`, webhook은 평면 JSON으로 올 수 있으므로 서버가 먼저 공통 결과로 정규화한 뒤 Pay Key로 거래를 재조회한다. 결제창 URL이나 Pay Key를 클라이언트 코드에 하드코딩하지 않는다.

### 11.2 `NEXT_PUBLIC_WEB_URL`이 틀리면 결제 후 고객이 사라집니다

이 값이 한국결제데이터 `returnUrl`·`webhookUrl`과 결과 페이지 리다이렉트에 쓰입니다. `closed-commerce-web.vercel.app`으로 돼 있으면 결제 후 고객이 딜키 도메인 밖으로 튕기고, 세션 쿠키가 `dealkey.co.kr` 스코프라 **로그아웃 상태로 보입니다.**

확인:

    // 브라우저 콘솔
    (await fetch('/api/payments/paydatakr/return', {redirect:'follow'})).url
    // → https://dealkey.co.kr/checkout/result?status=unknown 이어야 정상

### 11.3 Vercel 함수 리전이 서울이 아니면 페이지가 10배 느립니다

DB는 서울(`icn1`)인데 함수가 버지니아(`iad1`)에서 돌면 매 쿼리마다 태평양을 왕복합니다. **2,348ms → 181ms**의 차이였습니다.

`apps/web/vercel.json`과 `apps/admin/vercel.json` 양쪽에 `"regions": ["icn1"]`이 있어야 합니다.
응답 헤더 `x-vercel-id`가 `icn1::iad1::`이면 잘못된 상태입니다.

### 11.4 `auth.users`의 토큰 컬럼이 NULL이면 가입 전체가 막힙니다

SQL로 직접 만든 계정은 `confirmation_token` 등이 NULL로 남습니다. GoTrue는 이 컬럼을 빈 문자열로 기대하기 때문에, 가입 시 중복 검사 쿼리에서 스캔 에러가 나고 **신규 가입이 전부 실패**합니다.
증상: `Database error finding user`

    -- 진단
    select id, email from auth.users
    where confirmation_token is null or email_change is null or email_change_token_new is null
       or email_change_token_current is null or recovery_token is null
       or phone_change is null or phone_change_token is null;

    -- 복구
    update auth.users set
      confirmation_token = coalesce(confirmation_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      recovery_token = coalesce(recovery_token, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, '')
    where confirmation_token is null or email_change is null or email_change_token_new is null
       or email_change_token_current is null or recovery_token is null
       or phone_change is null or phone_change_token is null;

**계정은 가급적 Supabase Auth API로 만드세요.** SQL 직접 INSERT는 이 문제를 만듭니다.

### 11.5 참조되지 않는 CTE는 실행되지 않습니다

PostgreSQL은 결과에 쓰이지 않는 CTE를 아예 평가하지 않습니다. 부수효과를 노리고 CTE 안에서 함수를 부르면 **조용히 실행되지 않습니다.** 재고 반환을 이 방식으로 넣었다가 안 돌아간 적이 있습니다. 부수효과가 필요한 호출은 별도 문장으로 실행하세요.

### 11.6 readOnly 주소 입력은 서버 검증과 함께 사용합니다

우편번호·주소는 행정안전부 검색 결과로만 채우기 위해 `readOnly`입니다. `required`만으로는 빈 값을 막을 수
없으므로 최종 주문은 `addressSchema` 서버 검증을 통과해야 합니다. 클릭/포커스하면 검색 모달을 열고,
상세주소만 사용자가 직접 입력합니다.

### 11.7 주소 검색 영역에 `<form>`을 중첩하면 hydration이 깨집니다

`AddressSearchFields`는 배송지 추가 폼과 주문 폼 안에 들어갑니다. 검색 모달 내부를 다시 `<form>`으로 만들면
브라우저가 중첩 form DOM을 고치면서 React 서버 HTML과 달라져 hydration 오류가 납니다. 검색 영역은
`role="search"`인 일반 컨테이너로 두고 버튼 클릭/Enter 키에서 검색 함수를 호출합니다.

행정안전부 API 호출은 반드시 `/api/address/search` 서버 경로를 거칩니다. `JUSO_API_KEY`를
`NEXT_PUBLIC_` 환경변수로 만들거나 브라우저에서 직접 호출하지 마세요.

### 11.8 `<input type=file>`의 FileList는 읽기 전용입니다

항목 하나만 뺄 수 없습니다. `DataTransfer`로 나머지를 다시 담아 `input.files`를 통째로 교체해야 합니다.

### 11.9 청약철회 제한은 "표시해야" 주장할 수 있습니다

전자상거래법 제17조 제2항 단서. 표시를 안 하면 제한 자체를 주장할 수 없습니다.
"굳이 표시 안 하면 된다"는 반대입니다 — 표시를 안 하면 뜯은 육포도 환불해줘야 합니다.

### 11.10 lazy loading은 실제로 지연되는지 확인해야 합니다

`loading={index === 0 ? 'eager' : 'lazy'}` 같은 코드가 슬라이스 이후 인덱스 기준이면 무의미할 수 있습니다.
이미지가 접힌 영역 아래에 실제로 있는지, 네트워크 탭에서 정말 나중에 받는지 확인하세요.

### 11.11 목록 대표 이미지는 상세 원본과 분리해야 합니다

`product_images`는 `role='thumbnail'`과 `role='detail'`을 함께 가질 수 있습니다. 목록/장바구니에서
전체 이미지를 `sort_order` 첫 장으로 가져오면 세로로 긴 상세 원본이 카드 썸네일로 내려가 페이지가 무거워집니다.
목록·장바구니는 반드시 `role='thumbnail'`을 조건으로 조회하고, 상세만 전체 이미지를 사용하세요.

### 11.12 서버 페이지에서 `'use client'` 모듈을 import하지 마세요

`'use client'`가 붙은 컴포넌트 파일에서 순수 함수 하나만 가져와도 파일 전체가 클라이언트 모듈로 취급됩니다.
그 함수를 서버 컴포넌트에서 호출하면 `Attempted to call ... from the server` 예외로 페이지 전체가 깨집니다.
서버·클라이언트 양쪽에서 쓰는 상태 판별 함수는 `lib/`의 별도 순수 모듈로 분리하세요.

### 11.13 모바일 배너를 `object-fit: cover`로 바꾸면 원본이 잘립니다

홈 배너는 PC 권장 비율(8:3)을 모바일 2:1 영역에 넣습니다. 모바일에서도 `cover`를 쓰면 좌우가 잘려 대표님이 올린 배너 문구가 사라집니다. 모바일은 `contain`으로 원본 전체를 표시하고, 배너 영역 배경색으로 남는 여백을 처리합니다.

---

## 12. 계정

- 관리자 role은 `public.profiles.role`이 `operator` 또는 `admin`인 경우입니다. 사용자 metadata가 아닙니다.
- 로그인 ID에 `@`가 없으면 `ADMIN_LOGIN_EMAIL_DOMAIN`(기본 `dealkey.co.kr`)을 붙입니다.
- **비밀번호는 이 문서와 Git에 적지 않습니다.** 필요하면 Supabase Auth Dashboard에서 재설정하세요.

계정 만든 뒤 role 확인:

    select id, display_name, role from public.profiles where id = '<auth-user-uuid>';

---

## 13. 다음 세션 시작 체크리스트

    cd C:\dev\closedshopping
    git status
    git log -5 --oneline
    pnpm check

1. 이 문서 11절(함정)을 읽습니다.
2. Vercel 최신 Production 커밋이 로컬 HEAD와 같은지 확인합니다.
3. `select jobname, active from cron.job;` — 재고 만료 잡이 살아 있는지 확인합니다.
4. 재고 현황을 확인합니다(6절 SQL). `reserved_quantity`가 이유 없이 크면 만료 잡을 의심하세요.
5. 새 DB 변경은 새 timestamp 마이그레이션 → live 적용 → 커밋 순서로 합니다.
6. 코드 변경 후 `pnpm check`를 돌리고 `main`에 push합니다.
7. 배포 후 **실제로 내려오는 JS를 읽어** 반영을 확인합니다(2절).

---

## 14. 관련 문서

- 프로젝트 개요: `README.md`
- 구조: `docs/architecture.md`
- DB 원칙: `docs/database.md`
- 배포: `docs/deployment.md`
- 사업 규칙: `docs/business-rules.md`
- 원 설계: `closed_mall_monorepo_2depth_referral_design.md`
- 2026-08-21 점검: `docs/code-review-2026-08-21.md`

기능이 바뀌면 이 문서의 **갱신일, 0절, 10절(남은 일), 11절(함정)** 을 같이 고치세요.
특히 새로 데인 자리는 11절에 추가해 주세요. 그게 이 문서에서 제일 값어치 있는 부분입니다.
