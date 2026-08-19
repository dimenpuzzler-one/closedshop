import type { AppSupabaseClient } from '@closed-commerce/db';

export type AppRole = 'customer' | 'operator' | 'admin';

export function canAccessAdmin(role: AppRole | null | undefined): boolean {
  return role === 'operator' || role === 'admin';
}

export async function getVerifiedUser(client: AppSupabaseClient): Promise<{ id: string } | null> {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user ? { id: data.user.id } : null;
}

export async function getProfileRole(client: AppSupabaseClient, userId: string): Promise<AppRole | null> {
  const { data, error } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data.role;
}
