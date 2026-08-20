'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

function useCreate(endpoint: string) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setError('');
    const values: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget).entries());
    for (const key of ['basePrice', 'supplyCost', 'shippingFee', 'optionPrice', 'stock', 'discountRate', 'discountAmount', 'minimumOrderAmount', 'minimumQuantity', 'totalUsageLimit', 'perMemberUsageLimit']) if (typeof values[key] === 'string' && values[key] !== '') values[key] = Number(values[key]);
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json() as { message?: string; error?: string };
    if (response.ok) { setMessage(result.message ?? '저장되었습니다.'); event.currentTarget.reset(); } else setError(result.error ?? '저장하지 못했습니다.');
  }
  return { submit, message, error };
}

export function ProductCreateForm() {
  const form = useCreate('/api/products');
  return <details className="card admin-section"><summary className="button button-secondary">상품 등록 열기</summary><form className="stack" onSubmit={form.submit}><div className="form-grid"><label className="field"><span className="field-label">Slug</span><input className="input" name="slug" placeholder="premium-pear-500g" required /></label><label className="field"><span className="field-label">상품명</span><input className="input" name="name" required /></label><label className="field"><span className="field-label">기본가</span><input className="input" type="number" min="0" name="basePrice" required /></label><label className="field"><span className="field-label">공급가(선택)</span><input className="input" type="number" min="0" name="supplyCost" /></label><label className="field"><span className="field-label">배송비</span><input className="input" type="number" min="0" name="shippingFee" defaultValue="0" required /></label><label className="field"><span className="field-label">노출 대상</span><select className="select" name="visibility" defaultValue="referral"><option value="referral">추천 회원 전용</option><option value="member">회원 전용</option><option value="public">공개</option><option value="hidden">비공개</option></select></label><label className="field"><span className="field-label">판매 상태</span><select className="select" name="status" defaultValue="active"><option value="active">즉시 판매</option><option value="draft">초안</option><option value="paused">판매 중지</option></select></label><label className="field"><span className="field-label">옵션명</span><input className="input" name="optionName" defaultValue="구성" required /></label><label className="field"><span className="field-label">옵션값</span><input className="input" name="optionValue" required /></label><label className="field"><span className="field-label">옵션가</span><input className="input" type="number" min="0" name="optionPrice" required /></label><label className="field"><span className="field-label">초기재고</span><input className="input" type="number" min="0" name="stock" required /></label></div><label className="field"><span className="field-label">짧은 소개</span><input className="input" name="shortDescription" maxLength={300} placeholder="목록에 표시할 한 줄 소개" /></label><label className="field"><span className="field-label">상품 설명</span><textarea className="textarea" name="description" maxLength={4000} placeholder="상품 설명" /></label><button className="button button-primary">상품 등록</button>{form.error ? <p className="admin-note">{form.error}</p> : null}{form.message ? <p className="admin-note">{form.message}</p> : null}</form></details>;
}

export function ReferralCreateForm() {
  const form = useCreate('/api/referrals');
  return <details className="card admin-section"><summary className="button button-secondary">Referral Code 생성</summary><form className="stack" onSubmit={form.submit}><label className="field"><span className="field-label">Code</span><input className="input" name="code" placeholder="PARTNER001" required /></label><label className="field"><span className="field-label">소유자 User ID(UUID)</span><input className="input" name="ownerUserId" required /></label><button className="button button-primary">생성</button>{form.error ? <p className="admin-note">{form.error}</p> : null}{form.message ? <p className="admin-note">{form.message}</p> : null}</form></details>;
}

export function PromotionCreateForm() {
  const form = useCreate('/api/promotions');
  return <details className="card admin-section"><summary className="button button-secondary">Promotion Code 생성</summary><form className="stack" onSubmit={form.submit}><label className="field"><span className="field-label">Code</span><input className="input" name="code" placeholder="EARLYBIRD" required /></label><div className="form-grid"><label className="field"><span className="field-label">할인율(0~1)</span><input className="input" type="number" step="0.01" name="discountRate" /></label><label className="field"><span className="field-label">정액할인</span><input className="input" type="number" name="discountAmount" /></label><label className="field"><span className="field-label">최소 주문금액</span><input className="input" type="number" name="minimumOrderAmount" /></label><label className="field"><span className="field-label">총 사용한도</span><input className="input" type="number" name="totalUsageLimit" /></label></div><button className="button button-primary">생성</button>{form.error ? <p className="admin-note">{form.error}</p> : null}{form.message ? <p className="admin-note">{form.message}</p> : null}</form></details>;
}
