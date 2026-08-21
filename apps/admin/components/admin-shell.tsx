import Link from 'next/link';
import type { ReactNode } from 'react';
import { resolveRuntimeMode } from '@closed-commerce/db';
import { canAccessAdmin, getProfileRole, getVerifiedUser } from '@closed-commerce/auth';
import { createServerAppClient } from '@/lib/supabase-server';

const links: Array<[string, string]> = [
  ['/','대시보드'], ['/members','회원 관리'], ['/products','상품 관리'], ['/orders','주문 관리'], ['/referrals','Referral'], ['/promotions','Promotion'], ['/analytics','통계'], ['/settlements','정산'], ['/leads','B2B Leads'],
];

async function canRenderAdmin() {
  const mode = resolveRuntimeMode({ requireServiceRole: true });
  if (mode === 'unavailable') return false;
  if (mode === 'demo') return true;
  const client = await createServerAppClient();
  const user = await getVerifiedUser(client);
  if (!user) return false;
  const role = await getProfileRole(client, user.id);
  return canAccessAdmin(role);
}

export async function AdminShell({ children }: { children: ReactNode }) {
  const allowed = await canRenderAdmin();
  if (!allowed) return <div className="unauthorized"><div className="card"><p className="eyebrow">ADMIN ONLY</p><h1>관리자 권한이 필요합니다.</h1><p className="muted">관리자 앱은 별도 배포 단위로 운영되며, 사용자 metadata가 아니라 profiles.role을 확인합니다.</p><Link href="/login" className="button button-primary">관리자 로그인</Link></div></div>;
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  return <div className="admin-layout"><aside className="admin-sidebar"><Link href="/" className="admin-brand"><span className="admin-mark">CC</span><span>Closed Commerce<br />Admin</span></Link><nav className="admin-nav" aria-label="관리자 메뉴">{links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}</nav><div className="admin-sidebar-foot">Demo workspace<br />Commission은 L1/L2까지만 계산됩니다.</div></aside><div className="admin-main"><header className="admin-topbar"><span className="admin-topbar-title">Operations console · 2026 Chuseok drop</span><Link href={webUrl} className="button button-secondary">고객몰 열기 ↗</Link></header><main className="admin-content">{children}</main></div></div>;
}
