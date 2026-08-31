import { KorpayPaymentProvider } from '@closed-commerce/payment';

/**
 * 코페이 설정. mkey는 서버 전용 비밀값이라 NEXT_PUBLIC_ 접두사를 붙이면 안 된다.
 * 붙이는 순간 브라우저 번들에 들어가고, 그러면 누구나 결제 요청을 위조할 수 있다.
 */
export function korpayConfigured(): boolean {
  return Boolean(process.env.KORPAY_MERCHANT_ID && process.env.KORPAY_MKEY);
}

/**
 * 결제창(SDK)과 서버 API가 함께 쓰는 코페이 주소.
 * 스킴이 빠지면 브라우저가 이걸 상대경로로 해석해서 결제창 POST가 우리 사이트로 가버린다.
 * (그러면 iframe이 우리 404를 띄우고, SDK는 20초 뒤 "결제 페이지 요청 시간이 초과되었습니다"를 낸다.)
 */
export function korpayBaseUrl(): string {
  const raw = (process.env.KORPAY_BASE_URL ?? 'https://payments.korpay.com/v1').trim().replace(/\/$/, '');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  // 잘못된 값이면 여기서 바로 터뜨린다. 결제창 앞에서 20초 기다린 뒤 실패하는 것보다 낫다.
  new URL(withScheme);
  return withScheme;
}

export function getKorpayProvider(): KorpayPaymentProvider {
  const merchantId = process.env.KORPAY_MERCHANT_ID;
  const mkey = process.env.KORPAY_MKEY;
  if (!merchantId || !mkey) {
    throw new Error('KORPAY_MERCHANT_ID / KORPAY_MKEY 환경변수가 설정되지 않았습니다.');
  }
  return new KorpayPaymentProvider({
    merchantId,
    mkey,
    baseUrl: korpayBaseUrl(),
  });
}

/** 코페이가 인증 결과를 POST할 주소. 절대 경로여야 한다. */
export function korpayReturnUrl(): string {
  const base = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '');
  if (!base) throw new Error('NEXT_PUBLIC_WEB_URL 환경변수가 필요합니다. 코페이가 이 주소로 결과를 보냅니다.');
  return `${base}/api/payments/korpay/return`;
}
