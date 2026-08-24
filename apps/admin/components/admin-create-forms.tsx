'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { slugify } from '@closed-commerce/validation';

type ValidationDetails = { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
type ApiResult = { message?: string; error?: string; code?: string; requestId?: string; details?: ValidationDetails };

const NUMERIC_KEYS = [
  'basePrice', 'supplyCost', 'shippingFee', 'optionPrice', 'stock',
  'discountRate', 'discountAmount', 'minimumOrderAmount', 'minimumQuantity', 'totalUsageLimit', 'perMemberUsageLimit',
];

/** Vercel 함수 요청 본문 한도(4.5MB)보다 넉넉히 아래로 잡는다. */
const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
const COMPRESS_ABOVE_BYTES = 900 * 1024;
const MAX_IMAGE_EDGE = 1600;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const FIELD_LABELS: Record<string, string> = {
  slug: '상품 주소', name: '상품명', category: '카테고리', shortDescription: '짧은 소개',
  description: '상세 설명', basePrice: '기본가', supplyCost: '공급가', shippingFee: '배송비',
  visibility: '노출 대상', status: '판매 상태', optionName: '옵션명', optionValue: '옵션값',
  optionPrice: '옵션가', stock: '초기재고', shippingCutoffTime: '배송 마감 시간',
  code: '코드', ownerUserId: '소유자 User ID', discountRate: '할인율', discountAmount: '정액할인',
};

function formatValidationDetails(details?: ValidationDetails) {
  if (!details) return '';
  const fieldMessages = Object.entries(details.fieldErrors ?? {}).map(
    ([field, messages]) => `${FIELD_LABELS[field] ?? field}: ${(messages ?? []).join(', ')}`,
  );
  return [...(details.formErrors ?? []), ...fieldMessages].join(' / ');
}

/**
 * 예전에는 응답이 JSON이 아니면(413, 502, 타임아웃 등) response.json()이 그대로 throw했고,
 * 그 예외를 아무도 잡지 않아 화면에 오류가 전혀 표시되지 않았다.
 * "상품 등록은 안되요"인데 메시지가 없던 이유가 이것이다.
 */
async function readResponse(response: Response): Promise<ApiResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ApiResult;
    } catch {
      return { error: `서버 응답(JSON)을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const text = await response.text().catch(() => '');
  if (response.status === 413) {
    return {
      error: `업로드 용량이 서버 한도를 넘었습니다 (HTTP 413). 이미지 총합을 ${formatBytes(MAX_TOTAL_UPLOAD_BYTES)} 이하로 줄여 주세요.`,
      code: 'payload_too_large',
    };
  }
  return {
    error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${text.slice(0, 200)}`.trim(),
    code: 'non_json_response',
  };
}

function describeFailure(response: Response, result: ApiResult) {
  const base = result.error ?? '저장하지 못했습니다.';
  const validation = formatValidationDetails(result.details);
  // 서버 문구에 이미 같은 내용이 들어 있으면 다시 붙이지 않는다.
  // 예전에는 "slug: Invalid slug: Invalid"처럼 두 번 찍혔다.
  const parts = validation && !base.includes(validation) ? [base, validation] : [base];
  const tags = [`HTTP ${response.status}`];
  if (result.code) tags.push(result.code);
  if (result.requestId) tags.push(`오류번호 ${result.requestId}`);
  return `${parts.join(' ')} [${tags.join(' · ')}]`;
}

/**
 * 휴대폰 사진은 보통 3~5MB라 한 장만 넣어도 플랫폼 한도를 넘긴다.
 * 브라우저에서 미리 줄여 보내면 원인 자체가 사라진다(보통 300~600KB).
 * 변환에 실패하면 원본을 그대로 보내고 서버가 이유를 알려준다.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const needsResize = longestEdge > MAX_IMAGE_EDGE;
    if (!needsResize && file.size <= COMPRESS_ABOVE_BYTES) {
      bitmap.close();
      return file;
    }
    const scale = needsResize ? MAX_IMAGE_EDGE / longestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function useCreate(endpoint: string, options?: { multipart?: boolean }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React는 핸들러가 끝나면 event.currentTarget을 null로 만든다.
    // await 뒤에서 event.currentTarget.reset()을 부르면 TypeError가 났고,
    // 그 탓에 등록 성공 후에도 router.refresh()가 실행되지 않아 목록이 갱신되지 않았다.
    const formElement = event.currentTarget;
    setMessage('');
    setError('');
    setBusy(true);

    try {
      const formData = new FormData(formElement);
      let request: RequestInit;

      if (options?.multipart) {
        for (const key of NUMERIC_KEYS) {
          const value = formData.get(key);
          if (typeof value !== 'string') continue;
          if (value.trim() === '') formData.delete(key);
          else formData.set(key, String(Number(value)));
        }

        const compressed = new FormData();
        let totalBytes = 0;
        for (const [key, value] of formData.entries()) {
          if (!(value instanceof File)) {
            compressed.append(key, value);
            continue;
          }
          if (value.size === 0) continue;
          const next = await compressImage(value);
          totalBytes += next.size;
          compressed.append(key, next, next.name);
        }

        if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
          setError(
            `이미지를 줄여도 총 ${formatBytes(totalBytes)}라 한도(${formatBytes(MAX_TOTAL_UPLOAD_BYTES)})를 넘습니다. 장수를 줄이고 다시 시도해 주세요.`,
          );
          return;
        }
        request = { method: 'POST', body: compressed };
      } else {
        const values: Record<string, unknown> = Object.fromEntries(formData.entries());
        for (const key of NUMERIC_KEYS) if (typeof values[key] === 'string' && values[key] !== '') values[key] = Number(values[key]);
        request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) };
      }

      const response = await fetch(endpoint, request);
      const result = await readResponse(response);

      if (!response.ok) {
        setError(describeFailure(response, result));
        return;
      }
      setMessage([result.message ?? '저장되었습니다.', result.requestId ? `(처리번호 ${result.requestId})` : ''].filter(Boolean).join(' '));
      formElement.reset();
      router.refresh();
    } catch (caught) {
      // 네트워크 끊김, 업로드 중단, 브라우저 예외까지 여기서 잡아 화면에 남긴다.
      setError(`요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return { submit, message, error, busy };
}

function ImagePicker({ label, name, multiple = false, hint }: { label: string; name: string; multiple?: boolean; hint: string }) {
  const [previews, setPreviews] = useState<{ url: string; name: string; size: number }[]>([]);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPreviews(Array.from(event.currentTarget.files ?? []).map((file) => ({ url: URL.createObjectURL(file), name: file.name, size: file.size })));
  }

  useEffect(() => () => previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url)), []);

  const total = previews.reduce((sum, preview) => sum + preview.size, 0);

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="file" name={name} accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={handleChange} />
      <span className="field-hint">{hint}</span>
      {previews.length ? (
        <>
          <span className="field-hint">
            선택 {previews.length}장 · 원본 합계 {formatBytes(total)} · 업로드 전 자동으로 줄여서 전송합니다.
          </span>
          <div className="image-preview-grid" aria-label="이미지 미리보기">
            {previews.map((preview, index) => (
              <div className="image-preview" key={preview.url}>
                <Image src={preview.url} alt={`선택 이미지 ${index + 1}`} width={160} height={100} unoptimized />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FormFeedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error ? (
        <p className="admin-note" role="alert" style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="admin-note" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}

export function ProductCreateForm() {
  const form = useCreate('/api/products', { multipart: true });
  // 상품명에서 상품 주소를 자동으로 만든다. 운영자가 URL 규칙을 알 필요가 없다.
  // 직접 고치면 그때부터는 손댄 값을 존중한다.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <details className="card admin-section">
      <summary className="button button-secondary">상품 등록 열기</summary>
      <form
        className="stack"
        onSubmit={form.submit}
        onReset={() => { setName(''); setSlug(''); setSlugTouched(false); }}
        encType="multipart/form-data"
      >
        <p className="field-hint">옵션은 고객이 선택하는 구성·중량입니다. 단일 구성 상품이면 기본값을 그대로 쓰고 옵션가는 비워두세요.</p>
        <div className="form-grid">
          <label className="field"><span className="field-label">상품명</span><input className="input" name="name" value={name} onChange={(event) => setName(event.currentTarget.value)} required /></label>
          <label className="field">
            <span className="field-label">상품 주소 (자동)</span>
            <input
              className="input"
              name="slug"
              value={effectiveSlug}
              onChange={(event) => { setSlugTouched(true); setSlug(event.currentTarget.value); }}
              placeholder="상품명을 입력하면 자동으로 만들어집니다"
            />
            <span className="field-hint">
              {effectiveSlug
                ? `고객몰 주소: /products/${effectiveSlug}`
                : '비워 두시면 서버가 자동으로 만듭니다. 직접 넣으실 때만 영문 소문자·숫자·하이픈을 쓰세요.'}
            </span>
          </label>
          <label className="field"><span className="field-label">제품 카테고리</span><input className="input" name="category" defaultValue="기타" maxLength={80} required /><span className="field-hint">고객몰에서 상품을 분류할 이름입니다.</span></label>
          <label className="field"><span className="field-label">기본가</span><input className="input" type="number" min="0" name="basePrice" required /><span className="field-hint">옵션가를 비워두면 이 금액이 판매가가 됩니다.</span></label>
          <label className="field"><span className="field-label">공급가(선택)</span><input className="input" type="number" min="0" name="supplyCost" /></label>
          <label className="field"><span className="field-label">배송비</span><input className="input" type="number" min="0" name="shippingFee" defaultValue="0" required /></label>
          <label className="field"><span className="field-label">노출 대상</span><select className="select" name="visibility" defaultValue="referral"><option value="referral">추천 회원 전용</option><option value="member">회원 전용</option><option value="public">공개</option><option value="hidden">비공개</option></select></label>
          <label className="field"><span className="field-label">판매 상태</span><select className="select" name="status" defaultValue="active"><option value="active">즉시 판매</option><option value="draft">초안</option><option value="paused">판매 중지</option></select></label>
          <label className="field"><span className="field-label">옵션명</span><input className="input" name="optionName" defaultValue="구성" required /></label>
          <label className="field"><span className="field-label">옵션값</span><input className="input" name="optionValue" placeholder="예: 300g / 기본 구성" required /></label>
          <label className="field"><span className="field-label">옵션가(선택)</span><input className="input" type="number" min="0" name="optionPrice" /><span className="field-hint">옵션별 최종 판매가입니다. 비워두면 기본가를 사용합니다.</span></label>
          <label className="field"><span className="field-label">초기재고</span><input className="input" type="number" min="0" name="stock" required /></label>
        </div>
        <label className="field"><span className="field-label">짧은 소개</span><input className="input" name="shortDescription" maxLength={300} placeholder="목록에 표시할 한 줄 소개" /></label>
        <label className="field"><span className="field-label">상세페이지 설명</span><textarea className="textarea" name="description" maxLength={4000} placeholder="고객이 상세 페이지에서 볼 상품 설명" /></label>
        <div className="form-grid">
          <ImagePicker label="썸네일 이미지(선택, 1장)" name="thumbnail" hint="JPG, PNG, WEBP / 아이폰 HEIC는 지원하지 않습니다" />
          <ImagePicker label="상세페이지 이미지(선택, 여러 장)" name="detailImages" multiple hint="최대 8장 / 전송 전 자동 축소" />
        </div>
        <button className="button button-primary" disabled={form.busy}>{form.busy ? '등록 중…' : '상품 등록'}</button>
        <FormFeedback error={form.error} message={form.message} />
      </form>
    </details>
  );
}

export function ShippingSettingsForm({ defaultValue }: { defaultValue: string }) {
  const form = useCreate('/api/settings');
  return (
    <details className="card admin-section">
      <summary className="button button-secondary">배송 마감 설정 열기</summary>
      <form className="stack" onSubmit={form.submit}>
        <label className="field"><span className="field-label">배송 마감 시간</span><input className="input" type="time" name="shippingCutoffTime" defaultValue={defaultValue} required /><span className="field-hint">기본값은 14:00이며, 이 시간은 고객몰에도 안내됩니다.</span></label>
        <button className="button button-primary" disabled={form.busy}>{form.busy ? '저장 중…' : '배송 설정 저장'}</button>
        <FormFeedback error={form.error} message={form.message} />
      </form>
    </details>
  );
}

export function ReferralCreateForm() {
  const form = useCreate('/api/referrals');
  return (
    <details className="card admin-section">
      <summary className="button button-secondary">Referral Code 생성</summary>
      <form className="stack" onSubmit={form.submit}>
        <label className="field"><span className="field-label">Code</span><input className="input" name="code" placeholder="PARTNER001" required /></label>
        <label className="field"><span className="field-label">소유자 User ID(UUID)</span><input className="input" name="ownerUserId" required /></label>
        <button className="button button-primary" disabled={form.busy}>{form.busy ? '생성 중…' : '생성'}</button>
        <FormFeedback error={form.error} message={form.message} />
      </form>
    </details>
  );
}

export function PromotionCreateForm() {
  const form = useCreate('/api/promotions');
  return (
    <details className="card admin-section">
      <summary className="button button-secondary">Promotion Code 생성</summary>
      <form className="stack" onSubmit={form.submit}>
        <label className="field"><span className="field-label">Code</span><input className="input" name="code" placeholder="EARLYBIRD" required /></label>
        <div className="form-grid">
          <label className="field"><span className="field-label">할인율(0~1)</span><input className="input" type="number" step="0.01" name="discountRate" /></label>
          <label className="field"><span className="field-label">정액할인</span><input className="input" type="number" name="discountAmount" /></label>
          <label className="field"><span className="field-label">최소 주문금액</span><input className="input" type="number" name="minimumOrderAmount" /></label>
          <label className="field"><span className="field-label">총 사용한도</span><input className="input" type="number" name="totalUsageLimit" /></label>
        </div>
        <button className="button button-primary" disabled={form.busy}>{form.busy ? '생성 중…' : '생성'}</button>
        <FormFeedback error={form.error} message={form.message} />
      </form>
    </details>
  );
}
