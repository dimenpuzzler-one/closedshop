import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@closed-commerce/db';

export async function createServerAppClient() {
  const cookieStore = await cookies();
  return createServerSupabaseClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      } catch {
        // Server Components cannot always mutate cookies; Route Handlers can.
      }
    },
  });
}

/**
 * 한 요청 안에서 auth.getUser()를 한 번만 호출한다.
 *
 * getUser()는 로컬에서 JWT를 까보는 게 아니라 Supabase 인증 서버로 HTTP 요청을 보내
 * 토큰을 검증한다. 상품 상세를 한 번 그릴 때 미들웨어·헤더·카탈로그가 각자 불러서
 * 같은 호출이 세 번 나가고 있었다. React cache()는 같은 요청 안에서만 결과를
 * 공유하므로 사용자마다 섞일 걱정이 없다.
 */
export const getRequestUser = cache(async (): Promise<{ id: string } | null> => {
  const client = await createServerAppClient();
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id } : null;
});
