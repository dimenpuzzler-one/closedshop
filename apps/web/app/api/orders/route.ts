import { NextResponse } from 'next/server';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import { orderCreateSchema } from '@closed-commerce/validation';
import { createServerAppClient } from '@/lib/supabase-server';
import { prepareOrder, OrderServiceError } from '@/lib/order-service';
import { payDataKrConfigured } from '@/lib/paydatakr-config';

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
      if (!payDataKrConfigured()) {
        // 결제 설정이 없으면 주문을 만들지 않는다. 만들어두면 재고만 잡히고 결제는 못 한다.
        logServerError('web.orders.create', requestId, new Error('paydatakr not configured'), { stage: 'config' });
        return NextResponse.json({ error: '결제 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.', requestId }, { status: 503 });
      }
      try {
        logServerEvent('web.orders.create', requestId, { stage: 'start', userId: data.user.id, itemCount: input.items.length });
        // 주문만 만들고 재고를 잡는다. 결제는 한국결제데이터 인증창을 거쳐 결과 URL에서 확정된다.
        const result = await prepareOrder(input, data.user.id, requestId);
        // 서버가 발급한 일회성 위젯 URL·토큰만 내려준다. Pay Key는 응답에 포함하지 않는다.
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

    // 로컬 데모 모드에서는 가짜 결제 성공을 반환하지 않는다. 실제 결제창 URL·토큰이
    // 없는데 200을 반환하면 고객 화면이 결제창을 열지 못한 원인을 오해하게 된다.
    logServerEvent('web.orders.create', requestId, { stage: 'demo_blocked' });
    return NextResponse.json(
      {
        error: '현재 로컬 데모 모드에서는 실제 결제창을 열 수 없습니다. 운영 사이트에서 테스트하거나 로컬에 Supabase·PayDataKR 환경변수를 설정해 주세요.',
        code: 'payment_demo_mode',
        requestId,
      },
      { status: 503 },
    );
  } catch (error) {
    logServerError('web.orders.create', requestId, error, { stage: 'outer' });
    return NextResponse.json({ error: '주문을 처리하지 못했습니다.', requestId }, { status: 500 });
  }
}
