import { PayDataKrPaymentProvider } from '@closed-commerce/payment';

/** 관리자 환불 API가 사용하는 서버 전용 한국결제데이터 설정. */
export function getPayDataKrProvider(): PayDataKrPaymentProvider {
  const payKey = process.env.PAYDATAKR_PAY_KEY?.trim();
  if (!payKey) throw new Error('PAYDATAKR_PAY_KEY 환경변수가 설정되지 않았습니다.');
  return new PayDataKrPaymentProvider({
    publicKey: process.env.PAYDATAKR_PUBLIC_KEY?.trim() || 'admin-refund-only',
    payKey,
    checkoutUrl: process.env.PAYDATAKR_CHECKOUT_URL?.trim() || 'https://api.paydatakr.com',
    apiBaseUrl: process.env.PAYDATAKR_API_BASE_URL?.trim() || 'https://api.paydatakr.com',
  });
}
