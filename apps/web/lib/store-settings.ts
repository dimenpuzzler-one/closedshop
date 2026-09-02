import { DEFAULT_SHIPPING_POLICY, type ShippingPolicy } from '@closed-commerce/commerce';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { createServerAppClient } from '@/lib/supabase-server';

export const DEFAULT_SHIPPING_CUTOFF_TIME = '14:00';

export interface HomeBanner {
  id: string;
  imageUrl: string;
  altText: string;
  width?: number;
  height?: number;
}

/**
 * 운영자가 관리자 화면에서 바꾸는 값 전부. 코드 상수로 되돌리지 말 것.
 * store_settings는 anon도 select 할 수 있으므로(공개 정책) 세션 클라이언트로 충분하다.
 */
export interface StoreSettings {
  shippingCutoffTime: string;
  shippingPolicy: ShippingPolicy;
  heroHeadline: string;
  heroSubheadline: string;
  heroYoutubeUrl: string;
  heroBannerUrl: string;
  heroSlideIntervalSeconds: number;
  homeBanners: HomeBanner[];
}

const FALLBACK: StoreSettings = {
  shippingCutoffTime: DEFAULT_SHIPPING_CUTOFF_TIME,
  shippingPolicy: DEFAULT_SHIPPING_POLICY,
  heroHeadline: '',
  heroSubheadline: '',
  heroYoutubeUrl: '',
  heroBannerUrl: '',
  heroSlideIntervalSeconds: 6,
  homeBanners: [],
};

const COLUMNS =
  'shipping_cutoff_time, shipping_fee_per_carton, shipping_carton_quantity, free_shipping_threshold, hero_headline, hero_subheadline, hero_youtube_url, hero_banner_path, hero_slide_interval_seconds';

export async function loadStoreSettings(): Promise<StoreSettings> {
  if (!hasSupabaseEnv()) return FALLBACK;
  const client = await createServerAppClient();
  const [{ data }, { data: bannerRows }] = await Promise.all([
    client.from('store_settings').select(COLUMNS).eq('id', 1).maybeSingle(),
    client
      .from('home_banners')
      .select('id, image_path, alt_text, width, height, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  const homeBanners: HomeBanner[] = (bannerRows ?? []).map((banner) => ({
    id: banner.id,
    imageUrl: client.storage.from('product-images').getPublicUrl(banner.image_path).data.publicUrl,
    altText: banner.alt_text,
    width: banner.width ?? undefined,
    height: banner.height ?? undefined,
  }));
  // 새 테이블이 아직 비었을 때는 기존 단일 배너를 한 번 더 읽어 배포 순서 차이에도 안전하게 한다.
  if (homeBanners.length === 0 && data?.hero_banner_path) {
    homeBanners.push({
      id: 'legacy-home-banner',
      imageUrl: client.storage.from('product-images').getPublicUrl(data.hero_banner_path).data.publicUrl,
      altText: '딜키 메인 배너',
    });
  }
  return {
    shippingCutoffTime: data?.shipping_cutoff_time?.slice(0, 5) ?? DEFAULT_SHIPPING_CUTOFF_TIME,
    shippingPolicy: {
      cartonQuantity: data?.shipping_carton_quantity ?? DEFAULT_SHIPPING_POLICY.cartonQuantity,
      feePerCarton: data?.shipping_fee_per_carton ?? DEFAULT_SHIPPING_POLICY.feePerCarton,
      // null(무료배송 없음)과 0(전액 무료배송)은 다르다. ?? 로 뭉개면 안 된다.
      freeShippingThreshold: data?.free_shipping_threshold ?? undefined,
    },
    heroHeadline: data?.hero_headline ?? '',
    heroSubheadline: data?.hero_subheadline ?? '',
    heroYoutubeUrl: data?.hero_youtube_url ?? '',
    heroBannerUrl: data?.hero_banner_path
      ? client.storage.from('product-images').getPublicUrl(data.hero_banner_path).data.publicUrl
      : '',
    heroSlideIntervalSeconds: data?.hero_slide_interval_seconds ?? FALLBACK.heroSlideIntervalSeconds,
    homeBanners,
  };
}

/** 배송 마감 시간만 필요한 화면용. 예전 이름을 유지해 호출부를 한 번에 안 고쳐도 되게 한다. */
export async function loadShippingSettings(): Promise<{ shippingCutoffTime: string }> {
  const settings = await loadStoreSettings();
  return { shippingCutoffTime: settings.shippingCutoffTime };
}
