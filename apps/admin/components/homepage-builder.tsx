'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@closed-commerce/db';
import type { Product } from '@closed-commerce/types';
import type { AdminHomeBanner, AdminStoreSettings } from '@/lib/admin-data';
import { HomeProductOrderEditor } from './home-product-order-editor';
import { HomepagePreview } from './homepage-preview';

type ApiResult = {
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
  upload?: { path: string; token: string };
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
};

const ALLOWED_BANNER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BANNER_BYTES = 20 * 1024 * 1024;

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
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim() };
}

function describeFailure(response: Response, result: ApiResult) {
  const fields = Object.entries(result.details?.fieldErrors ?? {})
    .flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`));
  const details = [...(result.details?.formErrors ?? []), ...fields].join(' / ');
  const tags = [`HTTP ${response.status}`];
  if (result.code) tags.push(result.code);
  if (result.requestId) tags.push(`오류번호 ${result.requestId}`);
  return `${result.error ?? '처리하지 못했습니다.'}${details ? ` ${details}` : ''} [${tags.join(' · ')}]`;
}

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error ? <p className="admin-note" role="alert">{error}</p> : null}
      {message ? <p className="admin-note" role="status">{message}</p> : null}
    </>
  );
}

function textOf(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function numberOf(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? Number(value) : Number.NaN;
}

async function imageDimensions(file: File) {
  if (typeof createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return undefined;
  }
}

async function cleanupUnregisteredBanner(path: string) {
  await fetch('/api/settings/banner', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [path] }),
  }).catch(() => undefined);
}

function BannerEditor({ banner }: { banner: AdminHomeBanner }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/settings/banner/${banner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          altText: textOf(form, 'altText'),
          sortOrder: numberOf(form, 'sortOrder'),
          isActive: form.get('isActive') === 'on',
        }),
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setError(describeFailure(response, result));
        return;
      }
      setMessage(result.message ?? '배너 설정을 저장했습니다.');
      router.refresh();
    } catch (caught) {
      setError(`배너 설정을 저장하지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('이 배너를 삭제할까요? 삭제한 이미지는 복구할 수 없습니다.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/settings/banner/${banner.id}`, { method: 'DELETE' });
      const result = await readResponse(response);
      if (!response.ok) {
        setError(describeFailure(response, result));
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(`배너를 삭제하지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card stack" style={{ padding: '1rem', opacity: banner.isActive ? 1 : 0.62 }}>
      <div style={{ overflow: 'hidden', borderRadius: 12, background: '#eee8dd' }}>
        <Image
          src={banner.imageUrl}
          alt={banner.altText || '홈 배너 미리보기'}
          width={800}
          height={300}
          sizes="(max-width: 900px) 100vw, 42vw"
          style={{ display: 'block', width: '100%', height: 'auto' }}
          unoptimized
        />
      </div>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">배너 설명</span>
            <input className="input" name="altText" defaultValue={banner.altText} maxLength={160} placeholder="예: 추석 선물세트 기획전" />
            <span className="field-hint">이미지가 보이지 않을 때와 화면 읽기 기능에서 사용합니다.</span>
          </label>
          <label className="field">
            <span className="field-label">노출 순서</span>
            <input className="input" type="number" name="sortOrder" min="0" max="9999" defaultValue={banner.sortOrder} required />
            <span className="field-hint">숫자가 작을수록 먼저 보입니다.</span>
          </label>
        </div>
        <label className="row" style={{ justifyContent: 'flex-start' }}>
          <input type="checkbox" name="isActive" defaultChecked={banner.isActive} />
          <span>홈에 노출</span>
        </label>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button className="button button-primary" disabled={busy}>{busy ? '저장 중…' : '배너 설정 저장'}</button>
          <button className="button button-ghost" type="button" disabled={busy} onClick={() => void remove()}>삭제</button>
          {banner.width && banner.height ? <span className="field-hint">원본 {banner.width}×{banner.height}px</span> : null}
        </div>
        <Feedback error={error} message={message} />
      </form>
    </article>
  );
}

export function HomepageBuilder({ settings, banners, products, categories, editable }: { settings: AdminStoreSettings; banners: AdminHomeBanner[]; products: Product[]; categories: string[]; editable: boolean }) {
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const router = useRouter();
  const nextSortOrder = banners.length ? Math.min(9999, Math.max(...banners.map((banner) => banner.sortOrder)) + 10) : 100;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSettingsBusy(true);
    setSettingsError('');
    setSettingsMessage('');
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heroSlideIntervalSeconds: numberOf(form, 'heroSlideIntervalSeconds'),
          heroHeadline: textOf(form, 'heroHeadline'),
          heroSubheadline: textOf(form, 'heroSubheadline'),
          heroYoutubeUrl: textOf(form, 'heroYoutubeUrl'),
          siteTheme: textOf(form, 'siteTheme'),
          siteWidth: textOf(form, 'siteWidth'),
          siteDensity: textOf(form, 'siteDensity'),
        }),
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setSettingsError(describeFailure(response, result));
        return;
      }
      setSettingsMessage(result.message ?? '홈 설정을 저장했습니다.');
      router.refresh();
    } catch (caught) {
      setSettingsError(`홈 설정을 저장하지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get('banner');
    if (!(file instanceof File) || file.size === 0) {
      setUploadError('배너 이미지를 선택해 주세요.');
      return;
    }
    if (!ALLOWED_BANNER_TYPES.has(file.type)) {
      setUploadError('JPG, PNG, WEBP 이미지만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setUploadError(`배너는 20MB 이하여야 합니다. 선택한 파일은 ${(file.size / 1024 / 1024).toFixed(1)}MB입니다.`);
      return;
    }

    setUploadBusy(true);
    setUploadError('');
    setUploadMessage('');
    try {
      const dimensions = await imageDimensions(file);
      const prepareResponse = await fetch('/api/settings/banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, byteSize: file.size }),
      });
      const prepared = await readResponse(prepareResponse);
      if (!prepareResponse.ok || !prepared.upload) {
        setUploadError(describeFailure(prepareResponse, prepared));
        return;
      }

      try {
        const storage = createBrowserSupabaseClient().storage.from('product-images');
        const { error: storageError } = await storage.uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        });
        if (storageError) throw new Error(`배너 이미지를 올리지 못했습니다: ${storageError.message}`);

        const commitResponse = await fetch('/api/settings/banner', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: prepared.upload.path,
            altText: textOf(form, 'altText'),
            sortOrder: numberOf(form, 'sortOrder'),
            width: dimensions?.width,
            height: dimensions?.height,
          }),
        });
        const committed = await readResponse(commitResponse);
        if (!commitResponse.ok) throw new Error(describeFailure(commitResponse, committed));
        setUploadMessage(committed.message ?? '홈 배너를 추가했습니다.');
        formElement.reset();
        router.refresh();
      } catch (caught) {
        // 완료 응답이 유실됐을 수도 있으므로 서버가 DB 등록 여부를 다시 확인한 뒤 미등록 파일만 지운다.
        await cleanupUnregisteredBanner(prepared.upload.path);
        throw caught;
      }
    } catch (caught) {
      setUploadError(`배너를 올리지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card admin-section stack">
        <div>
          <h2>배너 기본 설정</h2>
          <p className="muted">배너에는 별도 글자나 상품 보기 버튼을 얹지 않습니다. 등록한 이미지 전체가 홈 상단에 표시됩니다.</p>
        </div>
        <form className="stack" onSubmit={saveSettings}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">자동 전환 시간</span>
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <input className="input" style={{ maxWidth: 140 }} type="number" name="heroSlideIntervalSeconds" min="2" max="30" defaultValue={settings.heroSlideIntervalSeconds} required />
                <span>초</span>
              </div>
              <span className="field-hint">2~30초. 배너가 한 장이면 자동 전환하지 않습니다.</span>
            </label>
            <label className="field">
              <span className="field-label">화면 폭</span>
              <select className="select" name="siteWidth" defaultValue={settings.siteWidth}>
                <option value="wide">광폭 (권장)</option>
                <option value="standard">기본 폭</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">화면 분위기</span>
              <select className="select" name="siteTheme" defaultValue={settings.siteTheme}>
                <option value="dealkey_gold">딜키 골드</option>
                <option value="warm_beige">웜 베이지</option>
                <option value="clean_white">클린 화이트</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">섹션 간격</span>
              <select className="select" name="siteDensity" defaultValue={settings.siteDensity}>
                <option value="compact">촘촘하게 (권장)</option>
                <option value="balanced">기본</option>
                <option value="spacious">여유 있게</option>
              </select>
            </label>
          </div>

          <details>
            <summary>배너가 없을 때 기본 화면·영상 설정</summary>
            <div className="stack" style={{ marginTop: '1rem' }}>
              <label className="field">
                <span className="field-label">기본 메인 문구</span>
                <input className="input" name="heroHeadline" defaultValue={settings.heroHeadline} maxLength={120} placeholder="초대받은 분께만 열리는 특판몰." />
              </label>
              <label className="field">
                <span className="field-label">기본 설명</span>
                <textarea className="textarea" name="heroSubheadline" defaultValue={settings.heroSubheadline} maxLength={300} rows={2} />
              </label>
              <label className="field">
                <span className="field-label">홈 유튜브 주소(선택)</span>
                <input className="input" name="heroYoutubeUrl" defaultValue={settings.heroYoutubeUrl} placeholder="https://www.youtube.com/watch?v=..." />
              </label>
            </div>
          </details>

          <button className="button button-primary" disabled={settingsBusy}>{settingsBusy ? '저장 중…' : '홈 설정 저장'}</button>
          <Feedback error={settingsError} message={settingsMessage} />
        </form>
      </section>

      <HomeProductOrderEditor products={products} categories={categories} editable={editable} />

      <HomepagePreview settings={settings} banners={banners} products={products} categories={categories} />

      <section className="card admin-section stack">
        <div>
          <h2>새 배너 추가</h2>
          <p className="muted">권장 크기 1600×600px(8:3), JPG·PNG·WEBP, 한 장 최대 20MB입니다. 같은 비율로 올리면 전환할 때 화면 높이가 안정적입니다.</p>
        </div>
        <form className="stack" onSubmit={upload}>
          <label className="field">
            <span className="field-label">배너 이미지</span>
            <input className="input" type="file" name="banner" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">배너 설명</span>
              <input className="input" name="altText" maxLength={160} placeholder="예: 추석 선물세트 기획전" />
            </label>
            <label className="field">
              <span className="field-label">노출 순서</span>
              <input className="input" type="number" name="sortOrder" min="0" max="9999" defaultValue={nextSortOrder} required />
            </label>
          </div>
          <button className="button button-secondary" disabled={uploadBusy || banners.length >= 12}>
            {uploadBusy ? '올리는 중…' : banners.length >= 12 ? '최대 12장 등록됨' : '배너 추가'}
          </button>
          <Feedback error={uploadError} message={uploadMessage} />
        </form>
      </section>

      <section className="stack">
        <div className="admin-heading" style={{ marginBottom: 0 }}>
          <div>
            <h2>등록된 배너</h2>
            <p className="muted">활성 배너 {banners.filter((banner) => banner.isActive).length}장 · 전체 {banners.length}장</p>
          </div>
        </div>
        {banners.length ? (
          <div className="form-grid">
            {banners.map((banner) => <BannerEditor banner={banner} key={banner.id} />)}
          </div>
        ) : (
          <div className="card empty"><p className="muted">등록된 배너가 없습니다. 위에서 첫 배너를 올려 주세요.</p></div>
        )}
      </section>
    </div>
  );
}
