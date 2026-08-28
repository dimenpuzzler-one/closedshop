'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@closed-commerce/db';
import type { AdminCategory, AdminStoreSettings } from '@/lib/admin-data';

type ApiResult = {
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
  upload?: { path: string; token: string };
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
};

const FIELD_LABELS: Record<string, string> = {
  shippingCutoffTime: '배송 마감 시간',
  shippingFeePerCarton: '묶음당 배송비',
  shippingCartonQuantity: '묶음 수량',
  freeShippingThreshold: '무료배송 기준액',
  heroHeadline: '메인 문구',
  heroSubheadline: '메인 설명',
  heroYoutubeUrl: '유튜브 주소',
  name: '카테고리 이름',
  parentName: '상위 대분류',
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
    return { error: '요청 용량이 서버 한도를 넘었습니다.', code: 'payload_too_large' };
  }
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim() };
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

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error ? <p className="admin-note" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{error}</p> : null}
      {message ? <p className="admin-note" role="status">{message}</p> : null}
    </>
  );
}

/** 저장 요청 하나를 다루는 공통 상태. 실패해도 화면에 반드시 이유가 남는다. */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function send(url: string, init: RequestInit, fallback: string) {
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
      setMessage([result.message ?? fallback, result.requestId ? `(처리번호 ${result.requestId})` : ''].filter(Boolean).join(' '));
      router.refresh();
      return true;
    } catch (caught) {
      setError(`요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function postJson(url: string, payload: unknown, fallback: string) {
    return send(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, fallback);
  }

  return { busy, error, message, send, postJson, setError, setBusy, setMessage, router };
}

function numberOrUndefined(form: FormData, key: string) {
  const raw = form.get(key);
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text === '' ? undefined : Number(text);
}

function textOf(form: FormData, key: string) {
  const raw = form.get(key);
  return typeof raw === 'string' ? raw.trim() : '';
}

export function ShippingSettingsForm({ settings }: { settings: AdminStoreSettings }) {
  const save = useSave();
  const [preview, setPreview] = useState({
    carton: settings.shippingCartonQuantity,
    fee: settings.shippingFeePerCarton,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const freeRaw = textOf(form, 'freeShippingThreshold');
    await save.postJson(
      '/api/settings',
      {
        shippingCutoffTime: textOf(form, 'shippingCutoffTime'),
        shippingFeePerCarton: numberOrUndefined(form, 'shippingFeePerCarton'),
        shippingCartonQuantity: numberOrUndefined(form, 'shippingCartonQuantity'),
        // 빈칸은 "무료배송 없음"이다. 그래서 undefined가 아니라 null을 보낸다.
        freeShippingThreshold: freeRaw === '' ? null : Number(freeRaw),
      },
      '배송 설정을 저장했습니다.',
    );
  }

  const examples = [1, 5, 6, 10, 11].map((quantity) => ({
    quantity,
    amount: Math.ceil(quantity / Math.max(1, preview.carton)) * Math.max(0, preview.fee),
  }));

  return (
    <section className="card admin-section stack">
      <div>
        <h2>배송비</h2>
        <p className="muted">
          3PL은 카툰(묶음) 하나당 요금이 붙습니다. 아래 두 값만 정하면 수량에 따라 자동으로 계산됩니다.
        </p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">묶음 수량</span>
            <input
              className="input"
              type="number"
              min="1"
              name="shippingCartonQuantity"
              defaultValue={settings.shippingCartonQuantity}
              onChange={(event) => setPreview((current) => ({ ...current, carton: Number(event.target.value) || 1 }))}
              required
            />
            <span className="field-hint">카툰 하나에 몇 개까지 들어가는지입니다.</span>
          </label>
          <label className="field">
            <span className="field-label">묶음당 배송비</span>
            <input
              className="input"
              type="number"
              min="0"
              name="shippingFeePerCarton"
              defaultValue={settings.shippingFeePerCarton}
              onChange={(event) => setPreview((current) => ({ ...current, fee: Number(event.target.value) || 0 }))}
              required
            />
            <span className="field-hint">카툰 하나당 요금입니다. 3PL 기준 4,000원.</span>
          </label>
          <label className="field">
            <span className="field-label">무료배송 기준액(선택)</span>
            <input
              className="input"
              type="number"
              min="0"
              name="freeShippingThreshold"
              defaultValue={settings.freeShippingThreshold ?? ''}
              placeholder="비워두면 무료배송 없음"
            />
            <span className="field-hint">비워두면 금액과 관계없이 항상 배송비를 받습니다.</span>
          </label>
          <label className="field">
            <span className="field-label">배송 마감 시간</span>
            <input className="input" type="time" name="shippingCutoffTime" defaultValue={settings.shippingCutoffTime} required />
            <span className="field-hint">이 시간은 고객몰에도 그대로 안내됩니다.</span>
          </label>
        </div>

        <div className="admin-note">
          <strong>미리보기</strong>
          <div className="row" style={{ gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {examples.map((example) => (
              <span key={example.quantity}>
                {example.quantity}개 → {example.amount.toLocaleString('ko-KR')}원
              </span>
            ))}
          </div>
        </div>

        <button className="button button-primary" disabled={save.busy}>{save.busy ? '저장 중…' : '배송 설정 저장'}</button>
        <Feedback error={save.error} message={save.message} />
      </form>
    </section>
  );
}

export function CategorySettingsForm({ categories }: { categories: AdminCategory[] }) {
  const save = useSave();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await save.postJson(
      '/api/categories',
      { name: textOf(form, 'name'), parentName: textOf(form, 'parentName') || undefined, sortOrder: numberOrUndefined(form, 'sortOrder') },
      '카테고리를 추가했습니다.',
    );
    if (ok) formElement.reset();
  }

  const parents = categories.filter((category) => !category.parentName);
  // 대분류 바로 아래에 그 소분류가 오도록 정렬해서 보여준다.
  const ordered = parents.flatMap((parent) => [
    parent,
    ...categories.filter((category) => category.parentName === parent.name),
  ]);
  const orphans = categories.filter(
    (category) => category.parentName && !parents.some((parent) => parent.name === category.parentName),
  );

  return (
    <section className="card admin-section stack">
      <div>
        <h2>카테고리</h2>
        <p className="muted">
          대분류 아래에 소분류를 두는 2단계 구조입니다. 예: 식품 &gt; 축산가공식품.
          상품은 <strong>소분류에 붙습니다.</strong>
        </p>
      </div>

      {categories.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>카테고리</th><th>정렬</th><th>상품 수</th><th>관리</th></tr>
            </thead>
            <tbody>
              {[...ordered, ...orphans].map((category) => (
                <tr key={category.name}>
                  <td>
                    {category.parentName ? (
                      <span className="muted" style={{ marginRight: 6 }}>└</span>
                    ) : null}
                    <strong>{category.name}</strong>
                    {category.parentName ? null : <span className="muted" style={{ marginLeft: 6 }}>대분류</span>}
                  </td>
                  <td>{category.sortOrder}</td>
                  <td>{category.productCount}개</td>
                  <td>
                    {category.productCount > 0 ? (
                      <span className="muted">상품이 있어 삭제 불가</span>
                    ) : (
                      <button
                        className="button button-ghost"
                        type="button"
                        disabled={save.busy}
                        onClick={() =>
                          void save.send(
                            '/api/categories',
                            { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: category.name }) },
                            '카테고리를 삭제했습니다.',
                          )
                        }
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">등록된 카테고리가 없습니다.</p>
      )}

      <form className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={add}>
        <label className="field">
          <span className="field-label">새 카테고리</span>
          <input className="input" name="name" placeholder="예: 축산가공식품" maxLength={80} required />
        </label>
        <label className="field">
          <span className="field-label">상위 대분류</span>
          <select className="select" name="parentName" defaultValue="">
            <option value="">(없음 — 대분류로 만들기)</option>
            {parents.map((parent) => <option key={parent.name} value={parent.name}>{parent.name}</option>)}
          </select>
          <span className="field-hint">비우면 대분류가 됩니다. 소분류 아래에는 더 만들 수 없습니다.</span>
        </label>
        <label className="field">
          <span className="field-label">정렬 순서(선택)</span>
          <input className="input" type="number" name="sortOrder" min="0" placeholder="100" />
          <span className="field-hint">숫자가 작을수록 앞에 나옵니다.</span>
        </label>
        <button className="button button-secondary" disabled={save.busy}>{save.busy ? '추가 중…' : '카테고리 추가'}</button>
      </form>
      <Feedback error={save.error} message={save.message} />
    </section>
  );
}

const ALLOWED_BANNER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BANNER_BYTES = 20 * 1024 * 1024;

export function HomeContentForm({ settings }: { settings: AdminStoreSettings }) {
  const save = useSave();
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const router = useRouter();

  async function submitCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await save.postJson(
      '/api/settings',
      {
        heroHeadline: textOf(form, 'heroHeadline'),
        heroSubheadline: textOf(form, 'heroSubheadline'),
        heroYoutubeUrl: textOf(form, 'heroYoutubeUrl'),
      },
      '홈 화면 내용을 저장했습니다.',
    );
  }

  /** 배너도 상품 사진과 같은 방식으로 Storage에 직접 올린다. */
  async function uploadBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const picked = new FormData(formElement).get('banner');
    if (!(picked instanceof File) || picked.size === 0) {
      setBannerError('배너 이미지를 선택해 주세요.');
      return;
    }
    if (!ALLOWED_BANNER_TYPES.has(picked.type)) {
      setBannerError('JPG, PNG, WEBP 이미지만 올릴 수 있습니다.');
      return;
    }
    if (picked.size > MAX_BANNER_BYTES) {
      setBannerError(`배너는 20MB 이하여야 합니다. 선택한 파일은 ${(picked.size / 1024 / 1024).toFixed(1)}MB입니다.`);
      return;
    }

    setBannerBusy(true);
    setBannerError('');
    setBannerMessage('');
    try {
      const prepareResponse = await fetch('/api/settings/banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: picked.type, byteSize: picked.size }),
      });
      const prepared = await readResponse(prepareResponse);
      if (!prepareResponse.ok || !prepared.upload) {
        setBannerError(describeFailure(prepareResponse, prepared));
        return;
      }

      const storage = createBrowserSupabaseClient().storage.from('product-images');
      const { error: uploadError } = await storage.uploadToSignedUrl(prepared.upload.path, prepared.upload.token, picked, {
        contentType: picked.type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (uploadError) {
        setBannerError(`배너를 올리지 못했습니다: ${uploadError.message}`);
        return;
      }

      const commitResponse = await fetch('/api/settings/banner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: prepared.upload.path }),
      });
      const committed = await readResponse(commitResponse);
      if (!commitResponse.ok) {
        setBannerError(describeFailure(commitResponse, committed));
        return;
      }
      setBannerMessage(committed.message ?? '메인 배너를 바꿨습니다.');
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setBannerError(`배너를 올리지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBannerBusy(false);
    }
  }

  async function removeBanner() {
    setBannerBusy(true);
    setBannerError('');
    setBannerMessage('');
    try {
      const response = await fetch('/api/settings/banner', { method: 'DELETE' });
      const result = await readResponse(response);
      if (!response.ok) {
        setBannerError(describeFailure(response, result));
        return;
      }
      setBannerMessage(result.message ?? '메인 배너를 지웠습니다.');
      router.refresh();
    } catch (caught) {
      setBannerError(`배너를 지우지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBannerBusy(false);
    }
  }

  return (
    <section className="card admin-section stack">
      <div>
        <h2>홈 화면</h2>
        <p className="muted">고객이 처음 보는 화면의 문구, 배너, 소개 영상입니다. 비워두면 기본값이 나옵니다.</p>
      </div>

      <form className="stack" onSubmit={submitCopy}>
        <label className="field">
          <span className="field-label">메인 문구</span>
          <input className="input" name="heroHeadline" defaultValue={settings.heroHeadline} maxLength={120} placeholder="초대받은 분께만 열리는 특판몰." />
        </label>
        <label className="field">
          <span className="field-label">메인 설명</span>
          <textarea className="textarea" name="heroSubheadline" defaultValue={settings.heroSubheadline} maxLength={300} rows={2} />
        </label>
        <label className="field">
          <span className="field-label">유튜브 주소(선택)</span>
          <input className="input" name="heroYoutubeUrl" defaultValue={settings.heroYoutubeUrl} placeholder="https://www.youtube.com/watch?v=..." />
          <span className="field-hint">주소를 넣으면 홈에 영상이 함께 나옵니다. 비우면 영상이 사라집니다.</span>
        </label>
        <button className="button button-primary" disabled={save.busy}>{save.busy ? '저장 중…' : '홈 화면 내용 저장'}</button>
        <Feedback error={save.error} message={save.message} />
      </form>

      <hr className="divider" />

      <div className="stack">
        <strong>메인 배너 이미지</strong>
        {settings.heroBannerUrl ? (
          <div className="stack" style={{ gap: '0.4rem' }}>
            <Image src={settings.heroBannerUrl} alt="현재 메인 배너" width={320} height={200} unoptimized />
            <div>
              <button className="button button-ghost" type="button" disabled={bannerBusy} onClick={() => void removeBanner()}>
                배너 지우기
              </button>
            </div>
          </div>
        ) : (
          <span className="field-hint">배너가 없으면 기본 그래픽이 나옵니다.</span>
        )}
        <form className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={uploadBanner}>
          <label className="field" htmlFor="banner-file">
            <span className="field-label">새 배너 파일</span>
            <input id="banner-file" className="input" type="file" name="banner" accept="image/jpeg,image/png,image/webp" />
            <span className="field-hint">가로로 긴 이미지가 잘 어울립니다. 한 장 20MB까지.</span>
          </label>
          <button className="button button-secondary" disabled={bannerBusy}>{bannerBusy ? '올리는 중…' : '배너 올리기'}</button>
        </form>
        <Feedback error={bannerError} message={bannerMessage} />
      </div>
    </section>
  );
}
