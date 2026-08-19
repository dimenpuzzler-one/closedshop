import type { AttributionSnapshot } from '@closed-commerce/types';

export type AnalyticsEventName = 'landing' | 'signup' | 'first_order' | 'order_paid' | 'promotion_redeemed' | 'b2b_lead_created';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  userId?: string;
  occurredAt: string;
  attribution?: AttributionSnapshot;
  properties?: Record<string, string | number | boolean | undefined>;
}

export function createAttributionSnapshot(input: {
  referralCode?: string;
  referrerUserId?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  now?: string;
}): AttributionSnapshot {
  const now = input.now ?? new Date().toISOString();
  return {
    referralCode: input.referralCode?.trim().toUpperCase(),
    referrerUserId: input.referrerUserId,
    campaignId: input.campaignId,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    landingAt: now,
  };
}

export function createAnalyticsEvent(name: AnalyticsEventName, input: Omit<AnalyticsEvent, 'name' | 'occurredAt'> = {}): AnalyticsEvent {
  return { name, occurredAt: new Date().toISOString(), ...input };
}
