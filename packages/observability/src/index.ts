/**
 * 서버 라우트의 오류를 "무엇이, 어디서, 왜" 수준으로 남기고
 * 같은 식별자를 클라이언트 응답에도 실어 보내기 위한 최소 도구.
 *
 * 원칙
 * - requestId 하나로 화면의 에러 문구와 서버 로그를 이어 붙일 수 있어야 한다.
 * - 사용자에게 보여줄 문구(message)와 로그에만 남길 원인(cause)을 분리한다.
 * - Supabase PostgrestError처럼 code/details/hint가 있는 오류는 그대로 보존한다.
 */

export interface ErrorContext {
  [key: string]: unknown;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  requestId: string;
  details?: unknown;
}

/** 로그와 응답을 잇는 짧은 식별자. 대표님이 화면에서 읽어 전달할 수 있는 길이. */
export function newRequestId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  return `${stamp}${random}`.toUpperCase();
}

interface SupabaseLikeError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

/** Supabase(PostgrestError/StorageError)와 Error를 같은 모양으로 눕힌다. */
export function describeError(error: unknown): {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (error && typeof error === 'object') {
    const candidate = error as SupabaseLikeError;
    const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
    return {
      message,
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    };
  }
  return { message: String(error) };
}

/**
 * 구조화된 한 줄 로그. Vercel 런타임 로그에서 `[cc:error]`로 바로 검색된다.
 * 비밀값이 실리지 않도록 호출부에서 context를 고른다.
 */
export function logServerError(scope: string, requestId: string, error: unknown, context: ErrorContext = {}): void {
  const described = describeError(error);
  console.error(
    `[cc:error] ${JSON.stringify({
      scope,
      requestId,
      message: described.message,
      code: described.code,
      details: described.details,
      hint: described.hint,
      ...context,
      at: new Date().toISOString(),
    })}`,
  );
  if (described.stack) console.error(`[cc:stack] ${requestId} ${described.stack}`);
}

/** 정상 흐름 중 남겨두면 원인 추적이 쉬워지는 지점(업로드 시작, 재고 예약 등). */
export function logServerEvent(scope: string, requestId: string, context: ErrorContext = {}): void {
  console.log(`[cc:event] ${JSON.stringify({ scope, requestId, ...context, at: new Date().toISOString() })}`);
}

/**
 * 라우트가 클라이언트에 돌려줄 오류 본문.
 * message는 사용자에게 보여줄 한국어 문구, cause는 로그 전용이다.
 */
export function apiErrorBody(requestId: string, message: string, options: { code?: string; details?: unknown } = {}): ApiErrorBody {
  return { error: message, requestId, code: options.code, details: options.details };
}
