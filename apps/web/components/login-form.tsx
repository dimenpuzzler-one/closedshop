'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

export function LoginForm() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) setError(result.error ?? '로그인하지 못했습니다.'); else setMessage(result.message ?? '로그인되었습니다.');
  }
  return <form className="card stack" onSubmit={submit}><div><p className="eyebrow">WELCOME BACK</p><h1>다시 만나요.</h1><p className="muted">초대받은 회원 전용 주문 공간입니다.</p></div><label className="field"><span className="field-label">이메일</span><input className="input" type="email" name="email" required /></label><label className="field"><span className="field-label">비밀번호</span><input className="input" type="password" name="password" required /></label><button className="button button-primary button-large">로그인</button>{error ? <p className="form-message form-error">{error}</p> : null}{message ? <p className="form-message">{message}</p> : null}<div className="auth-links"><Link href="/signup?ref=KGY001">초대 코드로 가입하기</Link><Link href="/products?ref=KGY001">상품 보기</Link></div></form>;
}
