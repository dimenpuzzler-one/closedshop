# Closed Commerce

폐쇄형 특판 커머스 모노레포입니다. 고객용 상품몰과 운영자용 관리자 화면을 분리하고, Supabase를 공통 데이터 계층으로 사용합니다.

## 운영 주소

| 서비스        | 운영 주소                     | Vercel 프로젝트         | 소스 경로    |
| ------------- | ----------------------------- | ----------------------- | ------------ |
| 고객용 상품몰 | <https://dealkey.co.kr>       | `closed-commerce-web`   | `apps/web`   |
| 관리자        | <https://admin.dealkey.co.kr> | `closed-commerce-admin` | `apps/admin` |

관리자 권한은 Supabase `profiles.role`로 판정합니다. 일반 운영자는 `operator`, 최고 관리자는 `admin`을 사용합니다.

## 아키텍처

```text
apps/
  web/                 고객용 Next.js App Router
  admin/               운영자용 Next.js App Router
packages/
  analytics/           이벤트·운영 지표
  auth/                인증·세션·역할
  commerce/            상품·주문·재고·프로모션
  db/                  Supabase 타입·클라이언트·저장소 추상화
  observability/       구조화 로그·오류 추적
  payment/             PaymentProvider 어댑터
  referral/            추천인·L1/L2 수수료 규칙
  types/               공통 타입
  ui/                  공통 UI 컴포넌트
  validation/          입력 검증 스키마
supabase/
  migrations/          스키마 및 RLS 변경 이력
  seed.sql             로컬 개발용 샘플 데이터
```

서비스 경계는 다음 원칙을 따릅니다.

- 추천인·프로모션은 주문 시점의 스냅샷을 주문 데이터에 보존합니다.
- L1/L2 수수료는 주문과 분리된 정산 흐름에서 승인 상태를 관리합니다.
- 상품 노출(`products.visibility`)과 가격 노출은 서로 다른 축입니다. 아래 "폐쇄몰 가격 노출" 참고.
- 배송비·카테고리·홈 문구처럼 운영자가 바꾸는 값은 코드 상수가 아니라 `store_settings`에 둡니다.
- 브라우저에는 publishable key만 노출하고, service role key는 서버 코드에서만 사용합니다.
- 앱 간 공통 로직은 `packages/*`로 이동하고, 한 앱의 UI 상태를 다른 앱이 직접 참조하지 않습니다.

세부 설계와 배포 설정은 [아키텍처 문서](docs/architecture.md)와 [배포 문서](docs/deployment.md)를 함께 확인합니다.

## 요구 사항

- Node.js 22 이상
- pnpm 11 (`package.json`의 `packageManager` 기준)
- 로컬 Supabase CLI
- 배포 시 Vercel 프로젝트와 Supabase 프로젝트

## 빠른 시작

PowerShell 기준입니다.

```powershell
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

기본 포트는 고객용 `http://localhost:3000`, 관리자 `http://localhost:3001`입니다. 두 앱을 모두 실행하려면 루트에서 `pnpm dev`를 사용하고, 한 앱만 실행하려면 다음처럼 실행합니다.

```powershell
pnpm --filter web dev
pnpm --filter admin dev
```

## 환경 변수

`.env.example`를 기준으로 각 앱의 로컬 환경 파일을 준비합니다. 모노레포 루트의 `.env.local`은 두 앱에서 공통으로 읽을 수 있지만, 배포 환경에서는 Vercel 프로젝트별로 등록하는 편이 안전합니다.

| 변수                                   | 용도                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase 프로젝트 URL                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저용 publishable key                            |
| `NEXT_PUBLIC_WEB_URL`                  | 고객용 절대 URL (로컬 기본값 `http://localhost:3000`) |
| `SUPABASE_SERVICE_ROLE_KEY`            | 서버 전용 관리자 작업·Storage 서명                    |
| `ADMIN_LOGIN_EMAIL_DOMAIN`             | 관리자 로그인 허용 이메일 도메인                      |
| `L1_COMMISSION_RATE`                   | 1단계 추천 수수료율                                   |
| `L2_COMMISSION_RATE`                   | 2단계 추천 수수료율                                   |
| `COMMISSION_APPROVAL_DAYS`             | 수수료 승인 대기 일수                                 |
| `KORPAY_MERCHANT_ID`                   | 코페이 가맹점 ID(서버 전용)                           |
| `KORPAY_MKEY`                          | 코페이 서명·승인 비밀키(서버 전용)                    |
| `KORPAY_BASE_URL`                      | 코페이 API 기준 URL                                   |
| `JUSO_API_KEY`                         | 행정안전부 주소 검색 승인키(서버 전용)                |
| `CC_DISABLE_DEMO`                      | 데모 데이터/동작 비활성화 플래그                      |

`SUPABASE_SERVICE_ROLE_KEY`, `KORPAY_MKEY`, `JUSO_API_KEY`에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 커밋·브라우저 번들·에러 메시지에 값이 들어가면 안 됩니다.

Supabase 환경 변수가 없으면 고객몰의 데모 카탈로그와 mock 주문 흐름을 확인할 수 있습니다. 실제 회원·상품·주문·재고·결제 snapshot·추천 수수료·분석 데이터를 사용하려면 Supabase 연결과 migration 적용이 필요합니다.

## Supabase 설정

원격 프로젝트를 연결한 뒤 마이그레이션을 적용합니다.

```powershell
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref <supabase-project-ref>
pnpm dlx supabase@latest db push
```

로컬 DB가 필요하면 다음을 사용합니다.

```powershell
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
```

`supabase/seed.sql`은 로컬 검증용 상품·옵션·재고·프로모션 데이터를 넣습니다. 운영 DB에 샘플 데이터를 직접 실행하지 말고, 변경은 항상 새 migration으로 남깁니다.

현재 주요 migration에는 다음 변경이 포함되어 있습니다.

- 상품 이미지에 `width`, `height`, `byte_size`, `mime_type` 메타데이터 저장
- `product-images` Storage 버킷과 파일당 20MB 제한
- 상품별 이미지 경로 중복 방지 인덱스
- 상품 수정과 옵션·재고 변경을 하나의 `admin_update_product` RPC로 원자 처리
- service role만 관리자 RPC를 실행하도록 권한 제한
- `store_settings`에 배송비 규칙(`shipping_carton_quantity`, `shipping_fee_per_carton`, `free_shipping_threshold`)과 홈 콘텐츠(`hero_headline`, `hero_subheadline`, `hero_youtube_url`, `hero_banner_path`) 추가
- 홈 전체 이미지 배너 목록 `home_banners`와 자동 전환 시간(`hero_slide_interval_seconds`) 추가
- 홈 배너의 공개 읽기와 관리자 쓰기 RLS 정책을 분리해 중복 정책 평가 제거
- 홈 배너 최대 12장 제한을 동시 업로드에서도 DB 트리거로 보장
- 고객몰 디자인 프리셋(`site_theme`, `site_width`, `site_density`)과 광폭 배너 설정 추가
- 카테고리 마스터 `product_categories` 신설(공개 읽기, 운영자만 쓰기)
- 상품관리 빠른 체크박스(노출·판매 상태)와 판매 가능 재고 표시 추가
- 판매 가능 재고가 0개가 되면 DB 트리거가 상품을 자동 판매중지하고, 재고를 다시 넣어도 수동 확인 전에는 자동 재개하지 않음
- 관리자 상단 로그아웃에서 Supabase Auth 세션과 쿠키를 함께 종료

## 회원가입·이메일 인증

딜키는 초대코드가 검증된 회원만 가입할 수 있는 폐쇄몰입니다.

- 가입 폼에서 비밀번호와 비밀번호 확인을 모두 입력해야 합니다.
- `apps/web/app/api/auth/signup/route.ts`는 공개 `auth.signUp` 대신 서버 전용 `auth.admin.createUser`를 사용합니다.
- `email_confirm: true`로 사용자를 즉시 인증하고, 가입 직후 `signInWithPassword`로 세션을 만들어 상품 목록으로 이동합니다. 따라서 가입 확인 이메일을 기다리거나 메일함을 확인할 필요가 없습니다.
- 이 흐름은 `SUPABASE_SERVICE_ROLE_KEY`가 서버 환경변수로 있을 때만 실행됩니다. 서비스 롤 키는 절대 `NEXT_PUBLIC_` 접두사를 붙이거나 브라우저에 노출하지 않습니다.
- 로컬 Supabase는 `supabase/config.toml`의 `[auth.email] enable_confirmations = false`로 설정되어 있습니다. 호스티드 프로젝트의 다른 Auth 호출까지 전역으로 확인 메일을 끄려면 Supabase Dashboard → Authentication → Sign In / Providers → User Signups에서 `Confirm email`을 끕니다.

확인 메일이 필요한 별도 가입 경로를 추가할 때는 이 정책과 분리해 설계하고, 공개 클라이언트에서 서비스 롤 키를 사용하지 않습니다.

## 폐쇄몰 가격 노출

상품 노출과 **온라인가·회원가 노출은 서로 다른 축**입니다. 누구나 상품과 온라인 기준가는 볼 수 있지만, 추천 코드로 가입한 회원에게만 회원가와 주문 기능을 공개합니다.

| 방문자                    | 상품 목록·상세 | 온라인가 | 회원가       | 장바구니·주문 |
| ------------------------- | -------------- | -------- | ------------ | ------------- |
| 비회원                    | 보임           | 보임     | 비노출       | 불가          |
| 회원 (추천 코드 귀속 없음) | 보임           | 보임     | 비노출       | 불가          |
| 회원 (추천 코드 귀속)      | 보임           | 보임     | 특판가       | 가능          |
| 위 + 프로모션 코드         | 보임           | 보임     | 추가 할인 적용 | 가능        |

- `products.visibility = 'hidden'`은 자격과 무관하게 아무에게도 보이지 않습니다. 상품 자체를 감추는 유일한 수단입니다.
- 비회원에게도 목록·상세를 보여주는 이유는 유입 경로 때문입니다. 당근·QR·지인 공유는 대부분 비로그인 상태로 상세 링크를 받습니다.
- 회원가는 화면에서 가리는 것이 아니라 **서버 페이로드에서 제거**합니다(`stripPrices`). `base_price`와 옵션 가격은 자격이 없을 때 0으로 제거하고, 공개 온라인가는 유지합니다.
- `POST /api/cart/quote`도 자격 없는 회원에게는 견적을 반환하지 않습니다. 주문 생성은 추천 귀속이 없으면 `403`입니다.

주의: 비회원 카탈로그는 세션 클라이언트로 읽을 수 없어(RLS가 0행) service role로 읽습니다. 따라서 회원가 차단은 RLS와 애플리케이션 코드가 함께 담당합니다. `catalog-data.ts`를 수정할 때 `stripPrices` 호출이 빠지지 않는지 확인해야 합니다.

## 배송비

3PL은 카툰(묶음) 단위로 요금이 발생합니다. 상품별 배송비가 아니라 **주문 전체 수량** 기준으로 한 번 계산합니다.

```text
배송비 = 올림(총수량 ÷ shipping_carton_quantity) × shipping_fee_per_carton
```

기본값은 묶음 5개 / 4,000원이며, 이 경우 1~5개 4,000원 · 6~10개 8,000원 · 11~15개 12,000원입니다.

- `free_shipping_threshold`가 `null`이면 무료배송이 없습니다. 기본값은 `null`입니다.
- `null`(무료배송 없음)과 `0`(전액 무료배송)은 다른 값입니다. 저장 시 뭉개지 않도록 주의합니다.
- 장바구니·주문서·주문 생성이 모두 같은 값을 읽습니다. 한 곳만 바꾸면 고객이 본 금액과 결제 금액이 어긋납니다.
- `products.shipping_fee` 컬럼은 남아 있으나 합계 계산에 쓰지 않습니다. 관리자 입력란도 제거했습니다.

## 운영 설정·홈페이지 꾸미기

관리자에서 개발자 없이 바꿀 수 있는 값입니다.

| 화면 | 항목 | 내용 |
| ---- | ---- | ---- |
| `/settings` | 배송비 | 묶음 수량, 묶음당 요금, 무료배송 기준액(선택), 배송 마감 시간 |
| `/settings` | 카테고리 | 추가·삭제. 상품이 붙어 있는 카테고리는 삭제를 거부합니다 |
| `/homepage` | 홈 화면 | 전체 이미지 배너, 디자인 프리셋, 상품 진열 순서, PC·모바일/회원·비회원 미리보기 |

- 배송비 입력란에는 수량별 계산 결과 미리보기가 함께 표시됩니다.
- 카테고리는 `product_categories`가 원천이며, 상품 등록·수정 화면의 선택지가 됩니다. 자유 입력이면 오타 하나로 카테고리가 갈라집니다.
- `products.category`는 여전히 `text`입니다. FK가 아니므로 DB 제약이 아니라 화면 제약입니다.
- 배너는 최대 12장, PC 권장 1600×600px(8:3)입니다. PC에서는 이미지 전체를 표시하고, 모바일에서는 배너 영역을 2:1로 넓혀 좌우를 자연스럽게 잘라냅니다. 모바일용 핵심 문구는 중앙에 배치하며 별도 문구·상품 링크·상품 보기 버튼은 얹지 않습니다.
- 배너 이미지는 상품 사진과 같은 서명 업로드 경로를 사용합니다(`banners/` 접두사, 20MB 제한). 브라우저가 Storage로 직접 올리므로 Vercel 본문 한도를 거치지 않습니다.
- 비활성 배너는 어드민에 남지만 고객몰에서는 읽히지 않습니다. 활성 배너가 없으면 기존 기본 소개 화면으로 돌아갑니다.
- 화면 분위기·본문 폭·섹션 간격은 안전한 프리셋만 저장합니다. 임의 CSS 입력은 허용하지 않습니다.
- 홈 상품은 `home_sort_order`가 작은 순서로 진열합니다. 홈페이지 꾸미기에서는 카테고리별로 상품을 묶어 각 카테고리 안의 진열 순서를 바로 바꿀 수 있고, 상품마다 `판매중`/`판매중지중` 상태를 확인할 수 있습니다. 저장된 결과는 PC/모바일 및 회원/비회원 화면으로 미리 볼 수 있습니다.
- 모든 변경은 `admin_audit_logs`에 기록됩니다.

## 상품 이미지 업로드

관리자 이미지 업로드는 파일을 API 본문에 직접 보내지 않고, 다음의 3단계 흐름을 사용합니다.

```text
POST JSON (파일 메타데이터)       -> 서명 업로드 URL 발급
브라우저 -> Supabase Storage 직접 업로드
PUT JSON (업로드 결과/메타데이터) -> DB 등록 및 검증
```

현재 계약과 제한은 다음과 같습니다.

- 허용 형식: JPEG, PNG, WEBP
- 파일당 최대 20MB, 한 번의 배치 최대 200MB
- 상품당 최대 21장
- 원본 픽셀 해상도와 MIME·바이트 메타데이터 보존
- 업로드 실패나 취소 시 미완성 Storage 객체 정리
- 상품 상세에서는 썸네일, 좌우 화살표, 키보드 이동으로 여러 이미지를 탐색

`invalid_json` 또는 `upload_client_outdated`가 보이면 오래 열린 관리자 탭이 예전 업로드 계약을 사용 중인 경우가 많습니다. 페이지를 `Ctrl+F5`로 새로고침하고 다시 업로드합니다. 서버는 오래된 multipart 요청을 409로 거부하며, 이때 DB에 부분 저장하지 않습니다.

이미 낮은 해상도로 저장된 기존 이미지는 원본을 복원할 수 없으므로 원본 파일을 다시 업로드해야 합니다. 새 업로드는 리사이즈하지 않고 원본 픽셀을 유지합니다.

## 고객몰 홈·상품 카드

- 홈 화면은 광폭 롤링 히어로 배너, 카테고리별 상품 진열, 설정된 유튜브 소개 영상 순서로 표시합니다. 모바일의 배너 좌우 여백과 카테고리–상품 사이 간격은 별도로 좁혀 두었습니다.
- `초대코드로 가입 승인 받기` 영역은 홈 최하단에 배치하며, 기존 `#member-access` 앵커 링크로 바로 이동할 수 있습니다.
- 홈·상품 목록·장바구니는 `product_images.role = 'thumbnail'` 이미지만 사용합니다. 상세 본문 이미지는 상품 상세 화면에서만 사용합니다.
- 홈 상품 카드는 모바일에서 2열로 표시하고 설명·태그를 생략합니다. 상품명은 최대 3줄로 말줄임 처리하며 카드 높이와 `상세 보기` 버튼을 하단에 맞춰 긴 상품명도 레이아웃을 밀어내지 않습니다.
- 상품 등록·수정에서 `회원가`와 `온라인가`를 각각 관리합니다. 기존 `products.supply_cost` 컬럼은 온라인가 저장용으로 사용하며, 옵션가 입력란은 두지 않고 회원가를 첫 옵션의 결제 가격으로 동기화합니다.
- 비로그인 방문자에게는 상품·상세 내용·`온라인 기준가`를 보여주고, 기준가는 빨간색 취소선으로 회원가와 구분해 `회원가입 후 회원가 확인`을 안내합니다. 추천 코드로 가입·승인된 회원에게만 회원가와 주문 기능을 제공합니다.

## 로컬 개발

```powershell
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check`는 Turbo를 통해 lint, typecheck, test, build를 모두 실행합니다. 문서나 설정만 바꾼 경우에도 커밋 전 아래 검사를 실행합니다.

```powershell
git diff --check
```

## Vercel 배포

| 서비스 | Vercel Root Directory | Build                                | 함수 리전            |
| ------ | --------------------- | ------------------------------------ | -------------------- |
| 고객용 | `apps/web`            | `pnpm turbo build --filter=web...`   | 프로젝트 설정에 따름 |
| 관리자 | `apps/admin`          | `pnpm turbo build --filter=admin...` | `icn1` (서울)        |

Supabase 운영 프로젝트는 서울 리전(`ap-northeast-2`)에 있으므로 관리자 함수는 `apps/admin/vercel.json`의 `regions: ["icn1"]`로 서울에서 실행합니다. 리전을 바꿔도 브라우저·Storage 다운로드가 자동으로 빨라지는 것은 아니며, DB 왕복과 함수 로그를 함께 확인해야 합니다.

직접 배포할 때는 각 앱 디렉터리에서 실행합니다.

```powershell
cd apps/admin
pnpm dlx vercel --prod

cd ../web
pnpm dlx vercel --prod
```

배포를 확인할 때 유용한 명령은 다음과 같습니다.

```powershell
pnpm dlx vercel ls <project-name>
pnpm dlx vercel inspect <deployment-url> --logs
curl.exe -I https://admin.dealkey.co.kr/login
```

Vercel Deployment Protection이 켜진 프리뷰는 인증 없이 `401`이 정상일 수 있습니다. 운영 도메인에서 확인하고, 프리뷰를 외부에 공유할 때는 보호 정책을 먼저 확인합니다.

## 성능 점검 및 장애 대응

관리자 화면이 느리면 다음 순서로 확인합니다.

1. Vercel에서 최신 배포가 `READY`인지, 함수 리전이 `[icn1]`인지 확인합니다.
2. `vercel inspect <deployment-url> --logs`로 요청 ID와 `[cc:error]` 로그를 찾습니다.
3. 같은 시간대 Supabase 로그에서 쿼리 지연·실패를 확인합니다.
4. 오래된 관리자 탭, 중복 세션 갱신, 큰 이미지 미리보기, 무제한 목록 요청을 확인합니다.
5. 이미지 업로드는 브라우저 → Storage 직접 업로드가 유지되는지와 20MB/200MB 제한을 확인합니다.

로그에는 사용자 개인정보나 시크릿을 기록하지 말고, 오류 번호·요청 ID·경로·상태 코드만 남깁니다. 네트워크 위치가 원인인지 판단할 때는 함수 리전과 Supabase 리전, 실제 왕복 시간을 함께 비교합니다.

## 보안 원칙

- RLS를 기본 방어선으로 사용하고 관리자 변경은 서버 권한과 역할 검사를 모두 통과해야 합니다.
- 가격·재고·수수료는 클라이언트 값보다 서버 계산값을 신뢰합니다.
- 주문에는 당시 상품명·가격·추천인·프로모션 정보를 스냅샷으로 저장합니다.
- Storage 업로드는 허용 MIME, 파일 크기, 상품별 개수를 서버에서도 재검증합니다.
- service role key, 웹훅 시크릿, 운영 데이터는 로그와 클라이언트 번들에서 제거합니다.

## 배포 리전

`apps/web/vercel.json`과 `apps/admin/vercel.json`은 둘 다 `regions: ["icn1"]`(서울)을
지정합니다. **이 설정을 빼면 안 됩니다.**

Supabase 프로젝트가 `ap-northeast-2`(서울)에 있습니다. 리전 지정이 없으면 Vercel 함수는
`iad1`(미국 버지니아)에서 실행되고, 그러면 요청 한 번마다 태평양을 건너는 데다
**DB 왕복 하나하나가 또 태평양을 건넙니다**. 상품 상세 한 장을 그리는 데 DB 왕복이
여러 번 일어나므로 그 차이가 초 단위로 쌓입니다.

실제로 `apps/web`에만 이 설정이 빠져 있던 동안 측정한 값입니다(서울에서 접속):

| 경로 | iad1(잘못) | 비고 |
| --- | --- | --- |
| 정적 파일(CDN, 함수 미경유) | 15~38ms | 비교 기준 |
| `/legal/terms` | 230~660ms | 페이지 내용과 무관한 고정비 |
| `/products` 로그인 | 1,700~2,300ms | 대표님이 "2~3초"라고 한 그 증상 |

응답 헤더 `x-vercel-id`로 확인할 수 있습니다. `icn1::iad1::...`처럼 두 번째 리전이
찍히면 함수가 서울 밖에서 돌고 있다는 뜻입니다. `icn1::...`로 끝나야 정상입니다.

## 알려진 제한

- 운영 결제는 코페이 인증결제이며 `MockPaymentProvider`는 환경변수가 없는 로컬 데모 주문에서만 사용합니다.
- 코페이 취소/환불 API는 아직 연결 전입니다. 관리자 환불 API는 실제 승인 취소 없이 DB만 바꾸지 않도록 `501 provider_refund_not_configured`으로 실패합니다.
- 비회원 카탈로그 경로는 온라인가만 공개하고 회원가를 애플리케이션 코드(`stripPrices`)에서 제거합니다. 온라인가 미입력 상품은 비회원에게 가격 준비 중으로 표시됩니다.
- 카테고리는 DB 제약이 아니므로 migration이나 직접 SQL로 `products.category`를 바꾸면 마스터 목록과 어긋날 수 있습니다.
- 배송비는 주문 전체 수량 기준 단일 규칙입니다. 상품마다 카툰 수량이 다르면 상품 컬럼 추가가 필요합니다.
- 기존 저해상도 이미지를 서버에서 원본 수준으로 복원할 수 없습니다.
- 관리자 대량 상품 목록은 데이터가 크게 늘면 페이지네이션·서버 집계 RPC를 추가해야 합니다.
- 운영 데이터 변경은 migration 또는 승인된 관리자 흐름을 통해서만 수행합니다.

## 변경 체크리스트

- [ ] 관련 migration과 환경 변수 변경을 함께 기록했는가
- [ ] 고객용·관리자용 앱을 각각 typecheck/build 했는가
- [ ] 이미지 업로드는 JSON prepare/complete 계약을 유지하는가
- [ ] 가격·재고·권한 검증을 서버에서 수행하는가
- [ ] 가격을 볼 자격이 없는 경로에서 페이로드에 금액이 남지 않는가
- [ ] 배송비를 장바구니·주문서·주문 생성이 같은 규칙으로 계산하는가
- [ ] `git diff --check`와 배포 후 운영 URL smoke test를 실행했는가
- [ ] 로그에 시크릿이나 개인정보가 포함되지 않았는가

## 다른 컴퓨터에서 이어서 작업하기

코드는 전부 GitHub에 있으므로 clone만 하면 됩니다. 옮겨야 하는 것은 코드가 아니라
**환경변수**입니다. `.env.local`은 의도적으로 git에 올리지 않습니다.

```bash
git clone https://github.com/dimenpuzzler-one/closedshop.git
cd closedshop
npm install -g pnpm@11.3.0     # Node 22 이상
pnpm install
```

환경변수는 Vercel에서 그대로 내려받는 것이 가장 정확합니다. 값을 손으로 옮기다
한 글자 틀리면 원인을 찾기 어려운 오류가 납니다.

```bash
npx vercel link      # closed-commerce-web 선택
npx vercel env pull apps/web/.env.local
```

관리자 앱도 같은 방식으로 `closed-commerce-admin`에 연결해 `apps/admin/.env.local`을
내려받습니다. Vercel을 쓰지 않는다면 `.env.example`을 복사해 Supabase 대시보드의
값으로 채웁니다.

확인:

```bash
pnpm check           # lint · typecheck · build · test
pnpm --filter web dev
```

`SUPABASE_SERVICE_ROLE_KEY`와 `KORPAY_MKEY`는 서버 전용 비밀값입니다.
채팅이나 문서에 붙여넣지 말고, 이 두 경로로만 옮깁니다.
