import { NextResponse } from 'next/server';
import { apiErrorBody, logServerError, logServerEvent, newRequestId } from '@closed-commerce/observability';
import type { AppSupabaseClient } from '@closed-commerce/db';
import { getAdminContext } from '@/lib/admin-auth';

/**
 * 관리자 API 8개가 모두 같은 4줄(파싱 → 컨텍스트 → demo 분기 → 권한 분기)을
 * 반복하고 있었고, 그 순서 때문에 인증 전에 요청 본문을 통째로 버퍼링했다.
 * 여기서 순서를 고정한다: 권한 확인이 항상 먼저다.
 */

export interface AdminRouteContext {
  requestId: string;
  client: AppSupabaseClient;
  userId: string;
}

/** 호출부가 상태코드와 사용자 문구를 함께 정할 수 있는 오류. 500으로 뭉개지지 않는다. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonError(requestId: string, status: number, message: string, options: { code?: string; details?: unknown } = {}) {
  return NextResponse.json(apiErrorBody(requestId, message, options), { status });
}

/** demo 응답에는 [DEMO]를 강제로 붙여 운영 응답과 절대 헷갈리지 않게 한다. */
export function demoResponse(requestId: string, payload: Record<string, unknown>) {
  const message = typeof payload.message === 'string' ? payload.message : '처리되었습니다.';
  return NextResponse.json({ ...payload, message: `[DEMO] ${message}`, requestId, mode: 'demo' });
}

interface WrapOptions {
  demo?: (requestId: string) => NextResponse;
}

async function runGuarded(
  scope: string,
  requestId: string,
  options: WrapOptions,
  run: (context: AdminRouteContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const context = await getAdminContext();

    if (context.mode === 'demo') {
      if (!options.demo) return jsonError(requestId, 503, '데모 모드에서는 지원하지 않는 기능입니다.', { code: 'demo_unsupported' });
      return options.demo(requestId);
    }
    if (context.mode === 'unauthorized') return jsonError(requestId, 403, context.message, { code: 'unauthorized' });
    if (context.mode === 'unavailable') {
      logServerError(scope, requestId, new Error(context.message), { stage: 'context' });
      return jsonError(requestId, 503, context.message, { code: 'service_unavailable' });
    }

    logServerEvent(scope, requestId, { stage: 'start', userId: context.userId });
    return await run({ requestId, client: context.client, userId: context.userId });
  } catch (error) {
    if (error instanceof ApiError) {
      logServerError(scope, requestId, error, { stage: 'handled', status: error.status, code: error.code });
      return jsonError(requestId, error.status, error.message, { code: error.code, details: error.details });
    }
    logServerError(scope, requestId, error, { stage: 'unhandled' });
    return jsonError(requestId, 500, '서버에서 처리하지 못했습니다. 화면에 표시된 오류 번호를 알려주시면 로그를 찾을 수 있습니다.', { code: 'unhandled' });
  }
}

export function withAdmin(scope: string, handler: (context: AdminRouteContext, request: Request) => Promise<NextResponse>, options: WrapOptions = {}) {
  return async function route(request: Request): Promise<NextResponse> {
    const requestId = newRequestId();
    return runGuarded(scope, requestId, options, (context) => handler(context, request));
  };
}

export function withAdminParams<P extends Record<string, string>>(
  scope: string,
  handler: (context: AdminRouteContext, request: Request, params: P) => Promise<NextResponse>,
  options: WrapOptions = {},
) {
  return async function route(request: Request, segment: { params: Promise<P> }): Promise<NextResponse> {
    const requestId = newRequestId();
    return runGuarded(scope, requestId, options, async (context) => handler(context, request, await segment.params));
  };
}

/** JSON 본문 파싱 실패를 400으로 명확히 구분한다(지금은 500으로 새어나갔다). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, '요청 본문을 읽지 못했습니다(JSON 형식이 아닙니다).', 'invalid_json');
  }
}

/** Supabase 오류를 사용자 문구 + 원인 코드로 함께 올린다. 원인은 로그에 남고 code는 화면에 보인다. */
export function failFromSupabase(message: string, error: unknown, code = 'supabase_error'): never {
  const rawCode = error && typeof error === 'object' && 'code' in error ? (error).code : undefined;
  const described = typeof rawCode === 'string' ? rawCode : undefined;
  throw new ApiError(500, message, described ? `${code}:${described}` : code, error);
}
