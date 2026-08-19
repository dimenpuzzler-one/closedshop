import { NextResponse } from 'next/server';
import { getCommissionRule } from '@closed-commerce/config';
import { DEMO_REFERRAL_CODES, DEMO_REFERRAL_GRAPH, summarizeOrderInput } from '@closed-commerce/commerce';
import { hasServiceRoleEnv, hasSupabaseEnv } from '@closed-commerce/db';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { calculateTwoDepthCommissions, findValidReferralCode } from '@closed-commerce/referral';
import { orderCreateSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';
import { createPersistedOrder, OrderServiceError } from '@/lib/order-service';

export async function POST(request: Request) {
  const parsed = orderCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '주문 정보가 올바르지 않습니다.', details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (hasSupabaseEnv()) {
    if (!hasServiceRoleEnv()) return NextResponse.json({ error: '서버의 Supabase service role 설정이 필요합니다.' }, { status: 503 });
    const supabase = await createServerAppClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: '로그인 후 주문해 주세요.' }, { status: 401 });
    try {
      return NextResponse.json(await createPersistedOrder(input, data.user.id));
    } catch (error) {
      if (error instanceof OrderServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error('[order-service]', error);
      return NextResponse.json({ error: '주문을 처리하지 못했습니다.' }, { status: 500 });
    }
  }
  const referral = input.referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, input.referralCode) : undefined;
  if (!referral) return NextResponse.json({ error: '주문에는 유효한 Referral Code가 필요합니다.' }, { status: 400 });
  let summary;
  try { summary = summarizeOrderInput(input); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '주문 금액을 계산하지 못했습니다.' }, { status: 400 }); }
  const orderId = `order_${Date.now()}`;
  const orderNumber = `CC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderId.slice(-5)}`;
  const payment = new MockPaymentProvider();
  const paymentSession = await payment.createPayment({ orderId, amount: summary.paidAmount, customerName: input.address.recipientName });
  const verified = await payment.verifyPayment({ paymentId: paymentSession.paymentId, orderId, amount: summary.paidAmount });
  const commissions = calculateTwoDepthCommissions({ orderId, buyerUserId: input.buyerUserId, commissionableAmount: summary.commissionableAmount, createdAt: verified.paidAt, rule: getCommissionRule() }, { getReferrer: (userId) => DEMO_REFERRAL_GRAPH.get(userId) });
  return NextResponse.json({ orderNumber, orderId, payment: verified, totals: summary, commissionPreview: commissions.commissions.map(({ depth, beneficiaryName, commissionAmount, status }) => ({ depth, beneficiaryName, commissionAmount, status })), message: '결제가 검증되고 주문이 생성되었습니다.' });
}
