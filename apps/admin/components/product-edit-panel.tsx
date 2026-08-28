'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@closed-commerce/types';
import { formatBytes, uploadProductImages } from '@/lib/product-image-upload';
import { CategorySelect, WithdrawalField } from './admin-create-forms';
import type { CategoryGroup } from '@/lib/admin-data';

type ApiResult = { message?: string; error?: string; code?: string; requestId?: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } };

const FIELD_LABELS: Record<string, string> = {
  name: '상품명', category: '카테고리', shortDescription: '짧은 소개', description: '상세 설명',
  basePrice: '기본가', supplyCost: '공급가', shippingFee: '배송비', visibility: '노출 대상',
  status: '판매 상태', optionName: '옵션명', optionValue: '옵션값', optionPrice: '옵션가', stock: '재고',
  withdrawalRestriction: '청약철회 제한 안내',
};

async function readResponse(response: Response): Promise<ApiResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ApiResult;
    } catch {
      return { error: `서버 응답을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const body = await response.text().catch(() => '');
  if (response.status === 413) {
    return { error: '요청 용량이 서버 한도를 넘었습니다. 이미지 파일은 직접 업로드 경로를 사용해야 합니다.', code: 'payload_too_large' };
  }
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim(), code: 'non_json_response' };
}

function describeFailure(response: Response, result: ApiResult) {
  const base = result.error ?? '처리하지 못했습니다.';
  const fields = Object.entries(result.details?.fieldErrors ?? {}).map(
    ([field, messages]) => `${FIELD_LABELS[field] ?? field}: ${(messages ?? []).join(', ')}`,
  );
  const extra = [...(result.details?.formErrors ?? []), ...fields].join(' / ');
  const parts = extra && !base.includes(extra) ? [base, extra] : [base];
  const tags = [`HTTP ${response.status}`];
  if (result.code) tags.push(result.code);
  if (result.requestId) tags.push(`오류번호 ${result.requestId}`);
  return `${parts.join(' ')} [${tags.join(' · ')}]`;
}

export function ProductEditPanel({ product, categories }: { product: Product; categories: CategoryGroup[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const stock = product.inventoryQuantity ?? product.options.reduce((sum, option) => sum + option.stock, 0);
  const option = product.options[0];
  const optionPrice = option?.price ?? product.price;

  async function send(url: string, init: RequestInit, successFallback: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(url, init);
      const result = await readResponse(response);
      if (!response.ok) {
        setError(describeFailure(response, result));
        return false;
      }
      setMessage(result.message ?? successFallback);
      router.refresh();
      return true;
    } catch (caught) {
      setError(`요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const numberOrUndefined = (key: string) => {
      const raw = text(key);
      return raw === '' ? undefined : Number(raw);
    };

    const payload = {
      name: text('name'),
      category: text('category'),
      shortDescription: text('shortDescription'),
      description: text('description'),
      withdrawalRestriction: text('withdrawalRestriction'),
      basePrice: numberOrUndefined('basePrice'),
      supplyCost: numberOrUndefined('supplyCost') ?? null,
      optionName: text('optionName'),
      optionValue: text('optionValue'),
      optionPrice: numberOrUndefined('optionPrice'),
      stock: numberOrUndefined('stock'),
      visibility: text('visibility') as Product['visibility'],
      status: text('status') as Product['status'],
    };

    await send(
      `/api/products/${product.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      '수정되었습니다.',
    );
  }

  async function addImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const picked = Array.from(new FormData(formElement).getAll('images')).filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );
    if (picked.length === 0) {
      setError('추가할 사진을 선택해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const resultMessage = await uploadProductImages(product.id, picked);
      setMessage(resultMessage);
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setError(`사진을 올리지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  const images = product.images ?? [];

  return (
    <div className="stack" style={{ padding: '0.75rem 0' }}>
      <form className="stack" onSubmit={saveDetails}>
        <div className="form-grid">
          <label className="field"><span className="field-label">상품명</span><input className="input" name="name" defaultValue={product.name} required /></label>
          <label className="field">
            <span className="field-label">카테고리</span>
            {/* 등록 화면과 같은 컴포넌트를 쓴다. 두 화면이 다르면 대표님이 또 헷갈린다. */}
            <CategorySelect categories={categories} defaultValue={product.category} />
            <span className="field-hint">목록은 “운영 설정 → 카테고리”에서 관리합니다.</span>
          </label>
          <label className="field"><span className="field-label">기본가</span><input className="input" type="number" min="0" name="basePrice" defaultValue={product.basePrice ?? product.price} /></label>
          <label className="field"><span className="field-label">옵션명</span><input className="input" name="optionName" defaultValue={option?.name ?? '구성'} required /><span className="field-hint">고객이 보는 구성 항목 이름입니다. 예: 구성</span></label>
          <label className="field"><span className="field-label">옵션값</span><input className="input" name="optionValue" defaultValue={option?.value ?? ''} placeholder="예: 300g / 기본 구성" required /><span className="field-hint">중량이나 구성 내용입니다. 예: 420g</span></label>
          <label className="field"><span className="field-label">판매가(옵션가)</span><input className="input" type="number" min="0" name="optionPrice" defaultValue={optionPrice} /><span className="field-hint">고객이 실제로 결제하는 금액입니다.</span></label>
          <label className="field"><span className="field-label">공급가(선택)</span><input className="input" type="number" min="0" name="supplyCost" defaultValue={product.supplyCost ?? ''} /></label>
          <label className="field"><span className="field-label">총재고</span><input className="input" type="number" min="0" name="stock" defaultValue={stock} /><span className="field-hint">예약 {product.reservedQuantity ?? 0}개 · 판매 가능 {Math.max(0, stock - (product.reservedQuantity ?? 0))}개</span></label>
          <label className="field">
            <span className="field-label">노출 대상</span>
            <select className="select" name="visibility" defaultValue={product.visibility}>
              <option value="referral">추천 회원 전용</option>
              <option value="member">회원 전용</option>
              <option value="public">공개</option>
              <option value="hidden">비공개</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">판매 상태</span>
            <select className="select" name="status" defaultValue={product.status}>
              <option value="active">즉시 판매</option>
              <option value="paused">판매 중지</option>
              <option value="draft">초안</option>
              <option value="archived">보관</option>
            </select>
          </label>
        </div>
        <label className="field"><span className="field-label">짧은 소개</span><input className="input" name="shortDescription" defaultValue={product.shortDescription} maxLength={300} /></label>
        <label className="field"><span className="field-label">상세페이지 설명</span><textarea className="textarea" name="description" defaultValue={product.description} maxLength={4000} /></label>
        <WithdrawalField defaultValue={product.withdrawalRestriction ?? ''} />
        <div className="row" style={{ gap: '0.5rem' }}>
          <button className="button button-primary" disabled={busy}>{busy ? '저장 중…' : '수정 내용 저장'}</button>
          <span className="field-hint">상품 주소(/products/{product.slug})는 바뀌지 않습니다.</span>
        </div>
      </form>

      <hr className="divider" />

      <div className="stack">
        <strong>사진 {images.length}장</strong>
        <span className="field-hint">맨 앞(대표)이 목록 썸네일입니다. 원본 해상도를 유지하며 한 장 20MB, 상품당 21장까지 올릴 수 있습니다.</span>
        {images.length ? (
          <div className="image-preview-grid">
            {images.map((image, index) => (
              <div className="image-preview stack" key={image.id} style={{ gap: '0.3rem' }}>
                <Image src={image.url} alt={image.altText || product.name} width={160} height={100} unoptimized />
                <span className="field-hint">
                  {index === 0 ? '대표 사진' : `상세 ${index}`} · {image.width && image.height ? `${image.width}×${image.height}` : '크기 미기록'}{image.byteSize ? ` · ${formatBytes(image.byteSize)}` : ''}
                </span>
                <div className="row" style={{ gap: '0.3rem' }}>
                  {index !== 0 ? (
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void send(`/api/products/${product.id}/images/${image.id}`, { method: 'PATCH' }, '대표 사진을 변경했습니다.')}
                    >
                      대표로
                    </button>
                  ) : null}
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void send(`/api/products/${product.id}/images/${image.id}`, { method: 'DELETE' }, '사진을 삭제했습니다.')}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="field-hint">등록된 사진이 없습니다.</span>
        )}

        <form className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }} onSubmit={addImages}>
          <label className="field" htmlFor={`images-${product.id}`}>
            <span className="field-label">추가할 상품 사진</span>
            <input id={`images-${product.id}`} className="input" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple />
          </label>
          <button className="button button-secondary" disabled={busy}>{busy ? '원본 올리는 중…' : '원본 화질로 사진 추가'}</button>
        </form>
      </div>

      <hr className="divider" />

      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {confirmDelete ? (
          <>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void send(`/api/products/${product.id}`, { method: 'DELETE' }, '상품을 삭제했습니다.')}
            >
              삭제 확정
            </button>
            <button className="button button-ghost" type="button" onClick={() => setConfirmDelete(false)}>취소</button>
            <span className="field-hint">주문 이력이 있으면 삭제되지 않습니다. 그때는 판매 상태를 “판매 중지”로 바꾸세요.</span>
          </>
        ) : (
          <button className="button button-ghost" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>상품 삭제</button>
        )}
      </div>

      {error ? <p className="admin-note" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p> : null}
      {message ? <p className="admin-note" role="status">{message}</p> : null}
    </div>
  );
}
