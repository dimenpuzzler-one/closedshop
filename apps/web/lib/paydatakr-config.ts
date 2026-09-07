import { PayDataKrPaymentProvider } from '@closed-commerce/payment';

const PAYDATAKR_API_DEFAULT = 'https://api.paydatakr.com';

function requiredHttpsUrl(value: string | undefined, label: string): string {
  const raw = (value ?? '').trim();
  if (!raw) throw new Error(`${label} 환경변수가 필요합니다.`);
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:') throw new Error('https required');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${label}은(는) HTTPS 절대 URL이어야 합니다.`);
  }
}

/** publicKey는 결제창에 전달되지만 Pay Key는 서버 API 인증에만 사용한다. */
export function payDataKrConfigured(): boolean {
  if (!process.env.PAYDATAKR_PUBLIC_KEY || !process.env.PAYDATAKR_PAY_KEY || !process.env.PAYDATAKR_CHECKOUT_URL) return false;
  try {
    payDataKrCheckoutUrl();
    payDataKrApiBaseUrl();
    payDataKrReturnUrl();
    payDataKrWebhookUrl();
    return true;
  } catch {
    return false;
  }
}

export function payDataKrCheckoutUrl(): string {
  return requiredHttpsUrl(process.env.PAYDATAKR_CHECKOUT_URL, 'PAYDATAKR_CHECKOUT_URL');
}

export function payDataKrApiBaseUrl(): string {
  return requiredHttpsUrl(process.env.PAYDATAKR_API_BASE_URL || PAYDATAKR_API_DEFAULT, 'PAYDATAKR_API_BASE_URL');
}

export function payDataKrReturnUrl(): string {
  const base = requiredHttpsUrl(process.env.NEXT_PUBLIC_WEB_URL, 'NEXT_PUBLIC_WEB_URL');
  return `${base}/api/payments/paydatakr/return`;
}

export function payDataKrWebhookUrl(): string {
  const base = requiredHttpsUrl(process.env.NEXT_PUBLIC_WEB_URL, 'NEXT_PUBLIC_WEB_URL');
  return `${base}/api/payments/paydatakr/webhook`;
}

export function getPayDataKrProvider(): PayDataKrPaymentProvider {
  const publicKey = process.env.PAYDATAKR_PUBLIC_KEY?.trim();
  const payKey = process.env.PAYDATAKR_PAY_KEY?.trim();
  if (!publicKey || !payKey) {
    throw new Error('PAYDATAKR_PUBLIC_KEY / PAYDATAKR_PAY_KEY 환경변수가 설정되지 않았습니다.');
  }
  return new PayDataKrPaymentProvider({
    publicKey,
    payKey,
    checkoutUrl: payDataKrCheckoutUrl(),
    apiBaseUrl: payDataKrApiBaseUrl(),
  });
}

export function payDataKrReceiptUrl(transactionId: string): string {
  const base = requiredHttpsUrl(
    process.env.PAYDATAKR_RECEIPT_BASE_URL || 'https://mcht.paydatakr.com/trx/receipt',
    'PAYDATAKR_RECEIPT_BASE_URL',
  );
  return `${base}/${encodeURIComponent(transactionId)}`;
}
