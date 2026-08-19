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
