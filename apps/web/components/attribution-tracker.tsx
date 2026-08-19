'use client';

import { useEffect } from 'react';

const ATTRIBUTION_KEY = 'closed-commerce-attribution';

export function AttributionTracker() {
  useEffect(() => {
    if (window.sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const payload = { eventName: 'landing', referralCode: params.get('ref')?.trim().toUpperCase() || undefined, utmSource: params.get('utm_source') || undefined, utmMedium: params.get('utm_medium') || undefined, utmCampaign: params.get('utm_campaign') || undefined };
    window.sessionStorage.setItem(ATTRIBUTION_KEY, '1');
    void fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }, []);
  return null;
}
