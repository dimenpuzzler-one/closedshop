'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

export function ReferralGate({ compact = false }: { compact?: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError('초대받은 Referral Code를 입력해 주세요.');
      return;
    }
    setError('');
    window.location.href = `/signup?ref=${encodeURIComponent(normalized)}`;
  }

  return <div className={`gate ${compact ? 'gate-compact' : ''}`}>
    <p className="eyebrow">PRIVATE ACCESS</p>
    <h3>추천 코드가 있는 분만 입장할 수 있어요.</h3>
    <p className="muted">코드는 판매자를 구분하는 귀속 키입니다. 가격을 적용하는 Promotion Code와는 별도로 관리됩니다.</p>
    <form className="gate-form" onSubmit={submit}>
      <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="예: KGY001" aria-label="Referral Code" />
      <button className="button button-primary" type="submit">코드로 입장</button>
    </form>
    {error ? <p className="form-message form-error">{error}</p> : null}
    <p className="hero-note">이미 가입했다면 <Link href="/login" style={{ textDecoration: 'underline' }}>로그인</Link>하세요.</p>
  </div>;
}
