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
| `PAYMENT_WEBHOOK_SECRET`               | 결제 웹훅 서명 검증용 시크릿                          |
| `CC_DISABLE_DEMO`                      | 데모 데이터/동작 비활성화 플래그                      |

`SUPABASE_SERVICE_ROLE_KEY`와 `PAYMENT_WEBHOOK_SECRET`는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 커밋·브라우저 번들·에러 메시지에 값이 들어가면 안 됩니다.

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

## 알려진 제한

- 결제·정산 실연동은 환경에 따라 별도 설정과 검증이 필요합니다.
- 기존 저해상도 이미지를 서버에서 원본 수준으로 복원할 수 없습니다.
- 관리자 대량 상품 목록은 데이터가 크게 늘면 페이지네이션·서버 집계 RPC를 추가해야 합니다.
- 운영 데이터 변경은 migration 또는 승인된 관리자 흐름을 통해서만 수행합니다.

## 변경 체크리스트

- [ ] 관련 migration과 환경 변수 변경을 함께 기록했는가
- [ ] 고객용·관리자용 앱을 각각 typecheck/build 했는가
- [ ] 이미지 업로드는 JSON prepare/complete 계약을 유지하는가
- [ ] 가격·재고·권한 검증을 서버에서 수행하는가
- [ ] `git diff --check`와 배포 후 운영 URL smoke test를 실행했는가
- [ ] 로그에 시크릿이나 개인정보가 포함되지 않았는가
