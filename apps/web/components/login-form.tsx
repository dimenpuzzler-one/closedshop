'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LoginResult = { message?: string; error?: string; requestId?: string };

async function readResponse(response: Response): Promise<LoginResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as LoginResult;
    } catch {
      return { error: `서버 응답을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const body = await response.text().catch(() => '');
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim() };
}

export function LoginForm({ redirectTo = '/products' }: { redirectTo?: string }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setStatus('submitting');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setError(`${result.error ?? '로그인하지 못했습니다.'}${result.requestId ? ` (오류번호 ${result.requestId})` : ''}`);
        setStatus('idle');
        return;
      }
      // 로그인 성공은 "메시지"가 아니라 "이동"으로 보여야 한다.
      // 예전에는 문구만 띄우고 그 자리에 머물러서, 로그인이 된 건지 알 수 없었다.
      // refresh()는 세션 쿠키가 생긴 뒤 서버 컴포넌트를 다시 그리게 한다(헤더 로그인 상태 등).
      setStatus('done');
      router.replace(redirectTo);
      router.refresh();
    } catch (caught) {
      setError(`로그인 요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
      setStatus('idle');
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>다시 만나요.</h1>
        <p className="muted">초대받은 회원 전용 주문 공간입니다.</p>
      </div>
      <label className="field"><span className="field-label">이메일</span><input className="input" type="email" name="email" autoComplete="email" required /></label>
      <label className="field"><span className="field-label">비밀번호</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
      <button className="button button-primary button-large" disabled={status !== 'idle'}>
        {status === 'submitting' ? '로그인 중…' : status === 'done' ? '이동 중…' : '로그인'}
      </button>
      {error ? <p className="form-message form-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p> : null}
      <div className="auth-links">
        <Link href="/signup">초대 코드로 가입하기</Link>
        <Link href="/products">상품 보기</Link>
      </div>
    </form>
  );
}
