'use client';

import { useEffect } from 'react';

// v2는 예전 구현이 세션에 남긴 "1" 값을 건너뛰고 UTM snapshot을 새로 저장한다.
const ATTRIBUTION_KEY = 'closed-commerce-attribution:v2';

export type AttributionSnapshot = {
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export function readAttributionSnapshot(): AttributionSnapshot | undefined {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw || raw === '1') return undefined;
    const parsed = JSON.parse(raw) as AttributionSnapshot;
    return {
      referralCode: parsed.referralCode?.trim().toUpperCase() || undefined,
      utmSource: parsed.utmSource?.trim() || undefined,
      utmMedium: parsed.utmMedium?.trim() || undefined,
      utmCampaign: parsed.utmCampaign?.trim() || undefined,
    };
  } catch {
    return undefined;
  }
}

export function AttributionTracker() {
  useEffect(() => {
    if (window.sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const payload: AttributionSnapshot = { referralCode: params.get('ref')?.trim().toUpperCase() || undefined, utmSource: params.get('utm_source') || undefined, utmMedium: params.get('utm_medium') || undefined, utmCampaign: params.get('utm_campaign') || undefined };
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(payload));
    void fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName: 'landing', ...payload }) });
  }, []);
  return null;
}
