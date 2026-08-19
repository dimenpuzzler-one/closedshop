'use client';

import { useState } from 'react';

export function AdminActionButton({ endpoint, payload, label, doneLabel = '완료' }: { endpoint: string; payload: Record<string, unknown>; label: string; doneLabel?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  async function run() {
    setState('loading');
    const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setState(response.ok ? 'done' : 'error');
  }
  return <button className={`button ${state === 'error' ? 'button-danger' : 'button-ghost'}`} type="button" onClick={run} disabled={state === 'loading' || state === 'done'}>{state === 'loading' ? '처리 중…' : state === 'done' ? doneLabel : state === 'error' ? '다시 시도' : label}</button>;
}
