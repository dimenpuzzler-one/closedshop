'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiResult = { message?: string; error?: string; code?: string; requestId?: string };

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

/**
 * 상품 목록에서 바로 판매 상태를 바꾸거나 삭제한다.
 * 등록만 가능하고 수정·삭제가 없어서, 잘못 올린 상품을 DB에서 직접 지워야 했다.
 */
export function ProductRowActions({ productId, productName, status }: { productId: string; productName: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const router = useRouter();

  async function send(method: 'PATCH' | 'DELETE', payload?: Record<string, unknown>) {
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      });
      const result = await readResponse(response);
      if (!response.ok) {
        const tags = [`HTTP ${response.status}`];
        if (result.code) tags.push(result.code);
        if (result.requestId) tags.push(`오류번호 ${result.requestId}`);
        setFeedback(`${result.error ?? '처리하지 못했습니다.'} [${tags.join(' · ')}]`);
        return;
      }
      setFeedback(result.message ?? '처리되었습니다.');
      router.refresh();
    } catch (caught) {
      setFeedback(`요청을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  const nextStatus = status === 'active' ? 'paused' : 'active';
  const nextLabel = status === 'active' ? '판매 중지' : '판매 시작';

  return (
    <div className="stack" style={{ gap: '0.35rem' }}>
      <div className="row" style={{ gap: '0.35rem' }}>
        <button className="button button-ghost" type="button" disabled={busy} onClick={() => void send('PATCH', { status: nextStatus })}>
          {nextLabel}
        </button>
        <button
          className="button button-ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            // 되돌릴 수 없는 작업이라 한 번 더 확인한다.
            setFeedback(`"${productName}"을(를) 삭제하려면 아래 "삭제 확정"을 눌러 주세요.`);
          }}
        >
          삭제
        </button>
      </div>
      {feedback.includes('삭제 확정') ? (
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void send('DELETE')}>
          삭제 확정
        </button>
      ) : null}
      {feedback ? <span className="field-hint" style={{ whiteSpace: 'pre-wrap' }}>{feedback}</span> : null}
    </div>
  );
}
