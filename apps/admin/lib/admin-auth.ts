import { canAccessAdmin, getProfileRole } from '@closed-commerce/auth';
import { createServiceRoleSupabaseClient, resolveRuntimeMode, type AppSupabaseClient } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export type AdminContext =
  | { mode: 'demo'; userId: 'demo'; client?: undefined }
  | { mode: 'supabase'; userId: string; client: AppSupabaseClient }
  | { mode: 'unauthorized'; message: string }
  | { mode: 'unavailable'; message: string };

/**
 * 환경변수가 빠졌을 때 예전에는 demo로 넘어가면서 관리자 화면과 API가
 * 무인증으로 열렸다. resolveRuntimeMode가 production에서는 demo를 막는다.
 */
export async function getAdminContext(): Promise<AdminContext> {
  const mode = resolveRuntimeMode({ requireServiceRole: true });
  if (mode === 'demo') return { mode: 'demo', userId: 'demo' };
  if (mode === 'unavailable') {
    return { mode: 'unavailable', message: 'Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.' };
  }

  const sessionClient = await createServerAppClient();
  const { data, error } = await sessionClient.auth.getUser();
  if (error || !data.user) return { mode: 'unauthorized', message: '관리자 로그인이 필요합니다.' };
  const role = await getProfileRole(sessionClient, data.user.id);
  if (!canAccessAdmin(role)) return { mode: 'unauthorized', message: '관리자 권한이 없습니다.' };
  return { mode: 'supabase', userId: data.user.id, client: createServiceRoleSupabaseClient() };
}

/**
 * 서버 컴포넌트/데이터 로더가 쓰는 진입점.
 * 예전에는 admin-data.ts가 인증과 무관하게 service role 클라이언트를 직접 만들어서,
 * layout이 권한을 막아도 page의 데이터 조회는 그대로 실행됐다.
 * 이제 권한을 통과해야만 client를 손에 넣을 수 있다.
 */
export async function requireAdminClient(): Promise<
  { ok: true; client: AppSupabaseClient; userId: string } | { ok: false; mode: 'demo' | 'unauthorized' | 'unavailable'; message: string }
> {
  const context = await getAdminContext();
  if (context.mode === 'supabase') return { ok: true, client: context.client, userId: context.userId };
  if (context.mode === 'demo') return { ok: false, mode: 'demo', message: '데모 데이터입니다.' };
  return { ok: false, mode: context.mode, message: context.message };
}
