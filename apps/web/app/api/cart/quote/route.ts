import { NextResponse } from 'next/server';
import { logServerError, newRequestId } from '@closed-commerce/observability';
import { cartQuoteSchema } from '@closed-commerce/validation';
import { quoteCart } from '@/lib/cart-pricing';

/**
 * 장바구니 금액을 서버가 계산해서 돌려준다.
 * 브라우저는 상품 id/수량만 들고 있고, 이름·단가·배송비·합계는 전부 여기서 온다.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const parsed = cartQuoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: '장바구니 정보가 올바르지 않습니다.', requestId }, { status: 400 });
    }
    return NextResponse.json({ ...(await quoteCart(parsed.data.items)), requestId });
  } catch (error) {
    logServerError('web.cart.quote', requestId, error);
    return NextResponse.json({ error: '장바구니 금액을 계산하지 못했습니다.', requestId }, { status: 500 });
  }
}
