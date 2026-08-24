'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="button button-ghost" type="button" onClick={() => void logout()} disabled={busy}>
      {busy ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}
