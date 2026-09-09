import { NextResponse } from 'next/server';
import { payDataKrReturnUrl } from '@/lib/paydatakr-config';

// 결제사는 취소 시 GET 또는 form POST로 돌아온다. 페이지에 직접 POST하면
// Next.js Server Actions의 cross-origin 검사에서 500이 발생하므로 GET으로 전환한다.
// 인증되지 않은 취소 요청으로 주문 상태나 재고를 변경하지 않는다.
function cancelled() {
  const result = new URL('/checkout/result', payDataKrReturnUrl());
  result.searchParams.set('status', 'cancelled');
  return NextResponse.redirect(result, 303);
}

export const GET = cancelled;
export const POST = cancelled;
