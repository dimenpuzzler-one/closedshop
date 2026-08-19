import { canAccessAdmin, getProfileRole } from '@closed-commerce/auth';
import { createServiceRoleSupabaseClient, hasServiceRoleEnv, hasSupabaseEnv, type AppSupabaseClient } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export type AdminContext = { mode: 'demo'; userId: 'demo'; client?: undefined } | { mode: 'supabase'; userId: string; client: AppSupabaseClient };

export async function getAdminContext(): Promise<AdminContext | { mode: 'unauthorized' | 'unavailable'; message: string }> {
  if (!hasSupabaseEnv()) return { mode: 'demo', userId: 'demo' };
  if (!hasServiceRoleEnv()) return { mode: 'unavailable', message: 'Supabase service role 환경변수가 필요합니다.' };
  const sessionClient = await createServerAppClient();
  const { data, error } = await sessionClient.auth.getUser();
  if (error || !data.user) return { mode: 'unauthorized', message: '관리자 로그인이 필요합니다.' };
  const role = await getProfileRole(sessionClient, data.user.id);
  if (!canAccessAdmin(role)) return { mode: 'unauthorized', message: '관리자 권한이 없습니다.' };
  return { mode: 'supabase', userId: data.user.id, client: createServiceRoleSupabaseClient() };
}
