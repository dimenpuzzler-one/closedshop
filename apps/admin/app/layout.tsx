import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import './globals.css';

export const metadata: Metadata = { title: 'Closed Commerce Admin', robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><AdminShell>{children}</AdminShell></body></html>;
}
