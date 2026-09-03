import { describe, expect, it } from 'vitest';
import { homeBannerCommitSchema, homeBannerUpdateSchema, storeSettingsSchema } from '../src/index';

describe('homepage banner validation', () => {
  it('accepts a banner path and display metadata', () => {
    const result = homeBannerCommitSchema.safeParse({
      path: 'banners/765d8a49-f682-4b58-aa53-541b27a33b2d.webp',
      altText: '추석 선물 기획전',
      sortOrder: 10,
      width: 1600,
      height: 600,
    });
    expect(result.success).toBe(true);
  });

  it('rejects paths outside the banner folder', () => {
    expect(homeBannerCommitSchema.safeParse({ path: 'products/private.jpg' }).success).toBe(false);
  });

  it('requires at least one banner field to update', () => {
    expect(homeBannerUpdateSchema.safeParse({}).success).toBe(false);
    expect(homeBannerUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('limits automatic rotation to 2 through 30 seconds', () => {
    expect(storeSettingsSchema.safeParse({ heroSlideIntervalSeconds: 6 }).success).toBe(true);
    expect(storeSettingsSchema.safeParse({ heroSlideIntervalSeconds: 1 }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ heroSlideIntervalSeconds: 31 }).success).toBe(false);
  });

  it('accepts only the supported homepage design presets', () => {
    expect(storeSettingsSchema.safeParse({ siteTheme: 'warm_beige', siteWidth: 'wide', siteDensity: 'compact' }).success).toBe(true);
    expect(storeSettingsSchema.safeParse({ siteTheme: 'custom_css' }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ siteWidth: 'full' }).success).toBe(false);
  });
});
