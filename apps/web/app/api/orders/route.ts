import { NextResponse } from 'next/server';
import { getCommissionRule } from '@closed-commerce/config';
import { DEMO_REFERRAL_CODES, DEMO_REFERRAL_GRAPH, summarizeOrderInput } from '@closed-commerce/commerce';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { calculateTwoDepthCommissions, findValidReferralCode } from '@closed-commerce/referral';
import { orderCreateSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';
import { prepareOrder, OrderServiceError } from '@/lib/order-service';
import { korpayConfigured } from '@/lib/korpay-config';

export async function POST(request: Request) {
  const requestId = newRequestId();
  const mode = resolveRuntimeMode({ requireServiceRole: true });

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: '주문 정보를 읽지 못했습니다.', requestId }, { status: 400 });
    }

    const parsed = orderCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const summary = Object.entries(flat.fieldErrors)
        .map(([field, messages]) => `${field}: ${(messages ?? []).join(', ')}`)
        .join(' / ');
      return NextResponse.json(
        { error: `주문 정보가 올바르지 않습니다. ${summary}`.trim(), details: flat, requestId },
        { status: 400 },
      );
    }
    const input = parsed.data;

    if (mode === 'unavailable') {
      // 운영에서 환경변수가 빠진 상태. 예전에는 조용히 데모로 넘어가
      // 저장되지 않은 주문에 "주문이 접수됐어요"를 돌려줬다.
      logServerError('web.orders.create', requestId, new Error('runtime mode unavailable'), { stage: 'mode' });
      return NextResponse.json({ error: '주문 시스템 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.', requestId }, { status: 503 });
    }

    if (mode === 'supabase') {
      const supabase = await createServerAppClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return NextResponse.json({ error: '로그인 후 주문해 주세요.', requestId }, { status: 401 });
      if (!korpayConfigured()) {
        // 결제 설정이 없으면 주문을 만들지 않는다. 만들어두면 재고만 잡히고 결제는 못 한다.
        logServerError('web.orders.create', requestId, new Error('korpay not configured'), { stage: 'config' });
        return NextResponse.json({ error: '결제 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.', requestId }, { status: 503 });
      }
      try {
        logServerEvent('web.orders.create', requestId, { stage: 'start', userId: data.user.id, itemCount: input.items.length });
        // 주문만 만들고 재고를 잡는다. 결제는 코페이 결제창을 거쳐 리턴 URL에서 확정된다.
        const result = await prepareOrder(input, data.user.id, requestId);
        return NextResponse.json({ ...result, requestId });
      } catch (caught) {
        if (caught instanceof OrderServiceError) {
          logServerError('web.orders.create', requestId, caught, { stage: 'order_service', status: caught.status, userId: data.user.id });
          return NextResponse.json({ error: caught.message, requestId }, { status: caught.status });
        }
        logServerError('web.orders.create', requestId, caught, { stage: 'unhandled', userId: data.user.id });
        return NextResponse.json({ error: '주문을 처리하지 못했습니다.', requestId }, { status: 500 });
      }
    }

    // ---- 아래는 로컬 개발용 데모 경로 (production에서는 mode가 절대 'demo'가 되지 않는다) ----
    const referral = input.referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, input.referralCode) : DEMO_REFERRAL_CODES[0];
    if (!referral) return NextResponse.json({ error: '주문에는 유효한 Referral Code가 필요합니다.', requestId }, { status: 400 });
    let summary;
    try {
      summary = summarizeOrderInput(input);
    } catch (caught) {
      return NextResponse.json(
        { error: caught instanceof Error ? caught.message : '주문 금액을 계산하지 못했습니다.', requestId },
        { status: 400 },
      );
    }
    const buyerUserId = input.buyerUserId ?? 'user-demo';
    const orderId = `order_${Date.now()}`;
    const orderNumber = `CC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderId.slice(-5)}`;
    const payment = new MockPaymentProvider();
    const paymentSession = await payment.createPayment({ orderId, amount: summary.paidAmount, customerName: input.address.recipientName });
    const verified = await payment.verifyPayment({ paymentId: paymentSession.paymentId, orderId, amount: summary.paidAmount });
    const commissions = calculateTwoDepthCommissions(
      { orderId, buyerUserId, commissionableAmount: summary.commissionableAmount, createdAt: verified.paidAt, rule: getCommissionRule() },
      { getReferrer: (userId) => DEMO_REFERRAL_GRAPH.get(userId) },
    );
    return NextResponse.json({
      orderNumber,
      orderId,
      payment: verified,
      totals: summary,
      commissionPreview: commissions.commissions.map(({ depth, beneficiaryName, commissionAmount, status }) => ({ depth, beneficiaryName, commissionAmount, status })),
      message: '[DEMO] 결제가 검증되고 주문이 생성되었습니다. 실제로 저장되지 않았습니다.',
      mode: 'demo',
      requestId,
    });
  } catch (error) {
    logServerError('web.orders.create', requestId, error, { stage: 'outer' });
    return NextResponse.json({ error: '주문을 처리하지 못했습니다.', requestId }, { status: 500 });
  }
}
