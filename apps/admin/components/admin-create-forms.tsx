'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { slugify } from '@closed-commerce/validation';
import type { CategoryGroup } from '@/lib/admin-data';
import { formatBytes, uploadProductImages } from '@/lib/product-image-upload';

type ValidationDetails = { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
type ApiResult = { message?: string; error?: string; code?: string; requestId?: string; productId?: string; details?: ValidationDetails };

const NUMERIC_KEYS = [
  'basePrice', 'supplyCost', 'shippingFee', 'optionPrice', 'stock',
  'discountRate', 'discountAmount', 'minimumOrderAmount', 'minimumQuantity', 'totalUsageLimit', 'perMemberUsageLimit',
];

const FIELD_LABELS: Record<string, string> = {
  slug: '상품 주소', name: '상품명', category: '카테고리', shortDescription: '짧은 소개',
  description: '상세 설명', basePrice: '기본가', supplyCost: '공급가', shippingFee: '배송비',
  visibility: '노출 대상', status: '판매 상태', optionName: '옵션명', optionValue: '옵션값',
  optionPrice: '옵션가', stock: '초기재고', shippingCutoffTime: '배송 마감 시간',
  withdrawalRestriction: '청약철회 제한 안내',
  code: '코드', ownerUserId: '소유자 User ID', label: '용도', discountRate: '할인율', discountAmount: '정액할인',
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
      error: '요청 용량이 서버 한도를 넘었습니다. 이미지 파일은 직접 업로드 경로를 사용해야 합니다.',
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

function useCreate(endpoint: string, options?: { productImages?: boolean }) {
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
      const values: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) if (typeof value === 'string') values[key] = value;
      for (const key of NUMERIC_KEYS) {
        if (typeof values[key] === 'string' && values[key] !== '') values[key] = Number(values[key]);
        else if (values[key] === '') delete values[key];
      }
      const request: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) };

      const response = await fetch(endpoint, request);
      const result = await readResponse(response);

      if (!response.ok) {
        setError(describeFailure(response, result));
        return;
      }
      let successMessage = result.message ?? '저장되었습니다.';
      if (options?.productImages) {
        // 어느 칸에 넣었는지를 그대로 들고 간다.
        // 예전에는 두 목록을 합쳐 올려서 무엇이 대표 사진인지 알 수 없었다.
        const pick = (name: string, role: 'thumbnail' | 'detail') =>
          formData.getAll(name)
            .filter((value): value is File => value instanceof File && value.size > 0)
            .map((file) => ({ file, role }));
        const files = [...pick('thumbnail', 'thumbnail'), ...pick('detailImages', 'detail')];
        if (files.length > 0) {
          if (!result.productId) throw new Error('상품은 등록됐지만 이미지 업로드에 필요한 상품 ID를 받지 못했습니다. 수정 화면에서 이미지를 다시 올려 주세요.');
          try {
            const imageMessage = await uploadProductImages(result.productId, files);
            successMessage = `${successMessage} ${imageMessage}`;
          } catch (imageError) {
            setError(`상품 정보는 등록됐지만 이미지는 올리지 못했습니다. 수정 화면에서 다시 시도해 주세요: ${imageError instanceof Error ? imageError.message : String(imageError)}`);
          }
        }
      }
      setMessage([successMessage, result.requestId ? `(처리번호 ${result.requestId})` : ''].filter(Boolean).join(' '));
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
      <label className="field-label" htmlFor={name}>{label}</label>
      <input id={name} className="input" type="file" name={name} accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={handleChange} />
      <span className="field-hint">{hint}</span>
      {previews.length ? (
        <>
          <span className="field-hint">
            선택 {previews.length}장 · 원본 합계 {formatBytes(total)} · 픽셀을 줄이지 않고 Storage로 직접 전송합니다.
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


/** 대분류로 묶어 보여주는 카테고리 선택. 상품은 소분류에 붙는다. */
export function CategorySelect({ categories, defaultValue }: { categories: CategoryGroup[]; defaultValue?: string }) {
  const flat = categories.flatMap((group) => (group.children.length > 0 ? group.children : [group.name]));
  const initial = defaultValue ?? flat[0] ?? '기타';
  const known = flat.includes(initial);
  return (
    <select className="select" name="category" defaultValue={initial} required>
      {/* 지금 값이 목록에서 빠졌더라도 선택이 풀리면 안 된다. */}
      {known ? null : <option value={initial}>{initial} (목록에 없음)</option>}
      {categories.map((group) =>
        group.children.length > 0 ? (
          <optgroup key={group.name} label={group.name}>
            {group.children.map((child) => <option key={child} value={child}>{child}</option>)}
          </optgroup>
        ) : (
          <option key={group.name} value={group.name}>{group.name}</option>
        ),
      )}
    </select>
  );
}

const WITHDRAWAL_PRESET = '개봉 후에는 식품 위생상 교환·환불이 불가합니다. 단순 변심에 의한 반품은 미개봉 상태에서만 가능합니다.';

/**
 * 청약철회 제한 안내.
 * 전자상거래법 제17조 제2항 단서상 이 문구를 표시하지 않으면 제한을 주장할 수 없다.
 * 즉 비워두면 개봉한 식품도 환불해줘야 한다. 그래서 기본 문구를 미리 채워둔다.
 */
export function WithdrawalField({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="field">
      <span className="field-label">청약철회 제한 안내</span>
      <textarea
        className="textarea"
        name="withdrawalRestriction"
        maxLength={500}
        rows={2}
        defaultValue={defaultValue ?? WITHDRAWAL_PRESET}
        placeholder={WITHDRAWAL_PRESET}
      />
      <span className="field-hint">
        상품 상세의 구매 버튼 바로 위에 표시됩니다. <strong>비워두면 개봉한 상품도 환불해 주어야 합니다</strong> —
        전자상거래법상 제한 사유를 미리 표시해야만 환불을 제한할 수 있습니다.
      </span>
    </label>
  );
}

export function ProductCreateForm({ categories }: { categories: CategoryGroup[] }) {
  const form = useCreate('/api/products', { productImages: true });
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
      >
        <p className="field-hint">옵션은 고객이 선택하는 구성·중량입니다. 단일 구성 상품이면 기본값을 그대로 쓰고 옵션가는 비워두세요.</p>
        <div className="form-grid">
          <label className="field"><span className="field-label">상품명</span><input className="input" name="name" value={name} onChange={(event) => setName(event.currentTarget.value)} required /></label>
          <label className="field">
            <span className="field-label">상품 주소 (자동, 선택)</span>
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
                : '비워 두셔도 됩니다. 서버가 상품명에서 자동으로 만듭니다.'}
            </span>
          </label>
          <label className="field">
            <span className="field-label">제품 카테고리</span>
            {/* 자유 입력이면 오타 하나로 카테고리가 갈라진다. 목록은 운영 설정에서 관리한다. */}
            <CategorySelect categories={categories} />
            <span className="field-hint">목록에 없으면 “운영 설정 → 카테고리”에서 먼저 추가해 주세요.</span>
          </label>
          <label className="field"><span className="field-label">기본가</span><input className="input" type="number" min="0" name="basePrice" required /><span className="field-hint">옵션가를 비워두면 이 금액이 판매가가 됩니다.</span></label>
          <label className="field"><span className="field-label">공급가(선택)</span><input className="input" type="number" min="0" name="supplyCost" /></label>
          <label className="field"><span className="field-label">노출 대상</span><select className="select" name="visibility" defaultValue="referral"><option value="referral">추천 회원 전용</option><option value="member">회원 전용</option><option value="public">공개</option><option value="hidden">비공개</option></select></label>
          <label className="field"><span className="field-label">판매 상태</span><select className="select" name="status" defaultValue="active"><option value="active">즉시 판매</option><option value="draft">초안</option><option value="paused">판매 중지</option></select></label>
          <label className="field"><span className="field-label">옵션명</span><input className="input" name="optionName" defaultValue="구성" required /></label>
          <label className="field"><span className="field-label">옵션값</span><input className="input" name="optionValue" placeholder="예: 300g / 기본 구성" required /></label>
          <label className="field"><span className="field-label">옵션가(선택)</span><input className="input" type="number" min="0" name="optionPrice" /><span className="field-hint">옵션별 최종 판매가입니다. 비워두면 기본가를 사용합니다.</span></label>
          <label className="field"><span className="field-label">초기재고</span><input className="input" type="number" min="0" name="stock" required /></label>
        </div>
        <label className="field"><span className="field-label">짧은 소개</span><input className="input" name="shortDescription" maxLength={300} placeholder="목록에 표시할 한 줄 소개" /></label>
        <label className="field"><span className="field-label">상세페이지 설명</span><textarea className="textarea" name="description" maxLength={4000} placeholder="고객이 상세 페이지에서 볼 상품 설명" /></label>
        <WithdrawalField />
        <div className="form-grid">
          <ImagePicker label="썸네일 이미지(선택, 1장)" name="thumbnail" hint="JPG, PNG, WEBP / 원본 화질 / 한 장 최대 20MB" />
          <ImagePicker label="상세페이지 이미지(선택, 여러 장)" name="detailImages" multiple hint="원본 화질 유지 / 전체 사진 최대 21장 / 한 번에 최대 200MB" />
        </div>
        <button className="button button-primary" disabled={form.busy}>{form.busy ? '등록 중…' : '상품 등록'}</button>
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
        <label className="field">
          <span className="field-label">용도</span>
          <input className="input" name="label" maxLength={80} placeholder="예: 릴스 광고 9월 / 이정복 대표 지인용" />
          <span className="field-hint">대시보드와 정산 화면에 코드 대신 이 이름이 보입니다. 한 사람이 여러 코드를 가질 수 있습니다.</span>
        </label>
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
