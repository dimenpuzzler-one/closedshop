'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export function AdminLoginForm() {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: form.get('loginId'), password: form.get('password') }) });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? '관리자 로그인을 실패했습니다.'); return; }
    window.location.href = '/';
  }
  return <form className="card stack" onSubmit={submit}><p className="eyebrow">OPERATIONS ACCESS</p><h1>관리자 로그인</h1><p className="muted">profiles.role이 operator 또는 admin인 계정만 접근할 수 있습니다.</p><label className="field"><span className="field-label">아이디 또는 이메일</span><input className="input" type="text" name="loginId" autoComplete="username" required /></label><label className="field"><span className="field-label">비밀번호</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label><button className="button button-primary">로그인</button>{error ? <p className="admin-note">{error}</p> : null}</form>;
}
