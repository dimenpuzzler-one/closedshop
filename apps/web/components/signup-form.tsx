'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

export function SignupForm({ referralCode = '' }: { referralCode?: string }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password'), displayName: form.get('displayName'), referralCode: form.get('referralCode') }) });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) setError(result.error ?? '가입하지 못했습니다.'); else setMessage(result.message ?? '가입 요청이 완료되었습니다.');
  }
  return <form className="card stack" onSubmit={submit}><div><p className="eyebrow">MEMBER ONLY</p><h1>초대받은 분만 가입할 수 있어요.</h1><p className="muted">최초 Referral 귀속은 가입 시 고정됩니다.</p></div><label className="field"><span className="field-label">이름</span><input className="input" name="displayName" required /></label><label className="field"><span className="field-label">이메일</span><input className="input" type="email" name="email" required /></label><label className="field"><span className="field-label">비밀번호</span><input className="input" type="password" name="password" minLength={8} required /></label><label className="field"><span className="field-label">Referral Code</span><input className="input" name="referralCode" defaultValue={referralCode} placeholder="초대받은 코드" required /></label><button className="button button-primary button-large">가입하기</button>{error ? <p className="form-message form-error">{error}</p> : null}{message ? <p className="form-message">{message}</p> : null}<div className="auth-links"><span>이미 계정이 있나요?</span><Link href="/login">로그인</Link></div></form>;
}
