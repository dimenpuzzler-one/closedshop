import { AdminShell } from '@/components/admin-shell';

export default function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
