'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readAttributionSnapshot } from './attribution-tracker';

type SignupResult = { message?: string; error?: string; authenticated?: boolean; requestId?: string };

async function readResponse(response: Response): Promise<SignupResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as SignupResult;
    } catch {
      return { error: `서버 응답을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const body = await response.text().catch(() => '');
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim() };
}

export function SignupForm({ referralCode = '' }: { referralCode?: string }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'needsEmail' | 'done'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    if (form.get('password') !== form.get('confirmPassword')) {
      setError('비밀번호가 일치하지 않습니다.');
      setStatus('idle');
      return;
    }
    setStatus('submitting');
    try {
      const attribution = readAttributionSnapshot();
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          confirmPassword: form.get('confirmPassword'),
          displayName: form.get('displayName'),
          referralCode: form.get('referralCode'),
          utmSource: attribution?.utmSource,
          utmMedium: attribution?.utmMedium,
          utmCampaign: attribution?.utmCampaign,
        }),
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setError(`${result.error ?? '가입하지 못했습니다.'}${result.requestId ? ` (오류번호 ${result.requestId})` : ''}`);
        setStatus('idle');
        return;
      }
      if (result.authenticated) {
        // 바로 로그인된 경우: 문구만 띄우고 멈추지 않고 상품 목록으로 보낸다.
        setStatus('done');
        router.replace('/products');
        router.refresh();
        return;
      }
      // 이메일 인증이 필요한 경우: 이동하면 안 된다. 무엇을 해야 하는지 남긴다.
      setStatus('needsEmail');
      setMessage(result.message ?? '가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.');
    } catch (caught) {
      setError(`가입 요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
      setStatus('idle');
    }
  }

  if (status === 'needsEmail') {
    return (
      <div className="card stack">
        <div>
          <p className="eyebrow">ALMOST THERE</p>
          <h1>메일함을 확인해 주세요.</h1>
          <p className="muted">{message}</p>
        </div>
        <p className="muted">메일이 보이지 않으면 스팸함도 확인해 주세요. 인증을 마치면 아래에서 로그인하시면 됩니다.</p>
        <Link href="/login" className="button button-primary button-large">로그인하러 가기</Link>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <p className="eyebrow">MEMBER ONLY</p>
        <h1>초대받은 분만 가입할 수 있어요.</h1>
        <p className="muted">최초 Referral 귀속은 가입 시 고정됩니다.</p>
      </div>
      <label className="field"><span className="field-label">이름</span><input className="input" name="displayName" autoComplete="name" required /></label>
      <label className="field"><span className="field-label">이메일</span><input className="input" type="email" name="email" autoComplete="email" required /></label>
      <label className="field"><span className="field-label">비밀번호</span><input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required /><span className="field-hint">8자 이상</span></label>
      <label className="field"><span className="field-label">비밀번호 확인</span><input className="input" type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required /><span className="field-hint">비밀번호를 한 번 더 입력해 주세요.</span></label>
      <label className="field"><span className="field-label">초대코드</span><input className="input" name="referralCode" defaultValue={referralCode} placeholder="초대받은 코드" readOnly required /><span className="field-hint">가입 승인 확인이 완료된 초대코드입니다.</span></label>
      <button className="button button-primary button-large" disabled={status !== 'idle'}>
        {status === 'submitting' ? '가입 중…' : status === 'done' ? '이동 중…' : '가입하기'}
      </button>
      {error ? <p className="form-message form-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p> : null}
      <div className="auth-links">
        <span>이미 계정이 있나요?</span>
        <Link href="/login">로그인</Link>
      </div>
    </form>
  );
}
