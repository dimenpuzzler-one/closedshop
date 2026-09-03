import { NextResponse } from 'next/server';
import { storeSettingsSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

/**
 * 운영자가 개발자를 부르지 않고 바꿔야 하는 값들.
 * 보낸 필드만 반영한다 — 배송 탭만 저장했는데 홈 문구가 지워지면 안 된다.
 */
export const POST = withAdmin(
  'admin.settings.update',
  async ({ requestId, client, userId }, request) => {
    const parsed = storeSettingsSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, '설정값이 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }

    const patch: Record<string, unknown> = { id: 1 };
    const input = parsed.data;
    if (input.shippingCutoffTime !== undefined) patch.shipping_cutoff_time = input.shippingCutoffTime;
    if (input.shippingFeePerCarton !== undefined) patch.shipping_fee_per_carton = input.shippingFeePerCarton;
    if (input.shippingCartonQuantity !== undefined) patch.shipping_carton_quantity = input.shippingCartonQuantity;
    // null은 "무료배송 없음"이라는 값이다. undefined(안 보냄)와 구분해야 한다.
    if (input.freeShippingThreshold !== undefined) patch.free_shipping_threshold = input.freeShippingThreshold;
    if (input.heroHeadline !== undefined) patch.hero_headline = input.heroHeadline;
    if (input.heroSubheadline !== undefined) patch.hero_subheadline = input.heroSubheadline;
    if (input.heroYoutubeUrl !== undefined) patch.hero_youtube_url = input.heroYoutubeUrl;
    if (input.heroSlideIntervalSeconds !== undefined) patch.hero_slide_interval_seconds = input.heroSlideIntervalSeconds;
    if (input.siteTheme !== undefined) patch.site_theme = input.siteTheme;
    if (input.siteWidth !== undefined) patch.site_width = input.siteWidth;
    if (input.siteDensity !== undefined) patch.site_density = input.siteDensity;

    const { error } = await client.from('store_settings').upsert(patch, { onConflict: 'id' });
    if (error) failFromSupabase('설정을 저장하지 못했습니다.', error, 'settings_upsert_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'store_settings_updated',
      entity_type: 'store_settings',
      after_data: { ...input, requestId },
    });
    return NextResponse.json({ message: '설정을 저장했습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '설정이 저장되었습니다.' }) },
);
