# Architecture

## 배포 단위

- `apps/web`: 고객용 폐쇄몰. Vercel 프로젝트 `closed-commerce-web`에 연결합니다.
- `apps/admin`: 운영자 콘솔. Vercel 프로젝트 `closed-commerce-admin`에 연결합니다.
- 두 앱은 `packages/*`만 공유하고 서로의 app 코드를 import하지 않습니다.

## 도메인 경계

- `commerce`: 상품, 장바구니, 주문 금액, Promotion 계산
- `referral`: 최초 귀속 확인과 L1/L2 Commission 계산
- `payment`: PG adapter interface와 mock provider
- `db`: Supabase client와 Database 타입
- `auth`: Supabase user 확인과 profiles.role 기반 권한
- `analytics`: Attribution snapshot과 이벤트 타입

## 보안 경계

브라우저에는 publishable key만 노출합니다. service role key는 서버 전용 route/domain service에서만 사용하고, 주문/Commission 계산은 서버에서 실행합니다. 운영자 권한은 `profiles.role`로 확인하며 사용자 수정 가능 metadata를 권한 판단에 사용하지 않습니다.
