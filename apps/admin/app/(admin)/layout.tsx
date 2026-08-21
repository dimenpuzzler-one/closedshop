import { AdminShell } from '@/components/admin-shell';

// 관리자 화면은 절대 프리렌더/캐시되면 안 된다.
// 정적 산출물이 되면 런타임 권한 확인 자체가 건너뛰어진다.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
