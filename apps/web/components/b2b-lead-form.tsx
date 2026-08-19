'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export function B2BLeadForm() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch('/api/b2b/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) setError(result.error ?? '견적 요청을 접수하지 못했습니다.'); else { setMessage(result.message ?? '견적 요청이 접수되었습니다.'); event.currentTarget.reset(); }
  }
  return <form className="card stack" onSubmit={submit}><div className="form-grid"><label className="field"><span className="field-label">회사명</span><input className="input" name="companyName" required /></label><label className="field"><span className="field-label">담당자명</span><input className="input" name="contactName" required /></label><label className="field"><span className="field-label">연락처</span><input className="input" name="phone" required /></label><label className="field"><span className="field-label">이메일</span><input className="input" type="email" name="email" required /></label><label className="field full"><span className="field-label">희망 상품</span><input className="input" name="requestedProduct" placeholder="예: 육포 420g 200세트" required /></label><label className="field"><span className="field-label">희망 수량</span><input className="input" type="number" min="1" name="quantity" required /></label><label className="field"><span className="field-label">희망 납기</span><input className="input" type="date" name="desiredDeliveryDate" /></label><label className="field"><span className="field-label">예산(원)</span><input className="input" type="number" min="0" name="budget" /></label><label className="field full"><span className="field-label">메모</span><textarea className="textarea" name="memo" /></label></div><div className="form-actions"><button className="button button-primary button-large">견적 요청 보내기</button></div>{error ? <p className="form-message form-error">{error}</p> : null}{message ? <p className="form-message">{message}</p> : null}</form>;
}
