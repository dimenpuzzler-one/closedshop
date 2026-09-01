'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

export function ReferralGate({ compact = false }: { compact?: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError('초대받은 Referral Code를 입력해 주세요.');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const response = await fetch('/api/referral/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; referralCode?: string };
      if (!response.ok) {
        setError(result.error ?? '초대코드를 확인하지 못했습니다.');
        return;
      }
      window.location.href = `/signup?ref=${encodeURIComponent(result.referralCode ?? normalized)}`;
    } catch {
      setError('초대코드 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setChecking(false);
    }
  }

  return <div className={`gate ${compact ? 'gate-compact' : ''}`}>
    <p className="eyebrow">PRIVATE ACCESS</p>
    <h3>초대코드로 가입 승인 받기</h3>
    <p className="muted">초대코드를 확인해 가입 승인을 시작하세요. 승인된 회원에게만 특판가와 주문 기능이 공개됩니다.</p>
    <form className="gate-form" onSubmit={submit}>
      <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="초대받은 코드를 입력하세요" aria-label="Referral Code" />
      <button className="button button-primary" type="submit" disabled={checking}>
        {checking ? '코드 확인 중…' : '가입 승인 받기'}
      </button>
    </form>
    {error ? <p className="form-message form-error">{error}</p> : null}
    <p className="hero-note">이미 가입했다면 <Link href="/login" style={{ textDecoration: 'underline' }}>로그인</Link>하세요.</p>
  </div>;
}
