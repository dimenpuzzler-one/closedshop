import { describe, expect, it } from 'vitest';
import { nextSlugCandidate, slugify } from '../src/slug';
import { productCreateSchema } from '../src/index';

const SLUG_RULE = /^[a-z0-9-]+$/;

describe('slugify', () => {
  it('romanizes Korean product names into a valid slug', () => {
    // 대표님이 한글 상품명을 넣으면 무조건 400이 나던 것이 등록 실패의 실제 원인이었다.
    expect(slugify('한우 육포 선물세트 300g')).toBe('hanu-yukpo-seonmulseteu-300g');
    expect(slugify('제주 감귤 5kg')).toBe('jeju-gamgyul-5kg');
  });

  it('always produces a value the schema accepts', () => {
    const names = ['한우 육포 선물세트 300g', 'Gift Set 500g', '스페셜   에디션', 'Café Latte', '테스트 상품 1'];
    for (const name of names) {
      const slug = slugify(name);
      expect(slug).toMatch(SLUG_RULE);
      expect(slug.length).toBeGreaterThanOrEqual(2);
      expect(slug.length).toBeLessThanOrEqual(120);
    }
  });

  it('returns empty string when nothing usable remains, so callers can fall back', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('a')).toBe('');
  });

  it('does not leave leading, trailing, or doubled hyphens', () => {
    const slug = slugify('  ***특가***  세트  ');
    expect(slug.startsWith('-')).toBe(false);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).not.toContain('--');
  });

  it('caps long names at the schema maximum', () => {
    const slug = slugify('가'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug).toMatch(SLUG_RULE);
  });
});

describe('nextSlugCandidate', () => {
  it('appends and then increments a numeric suffix', () => {
    expect(nextSlugCandidate('gift-set')).toBe('gift-set-2');
    expect(nextSlugCandidate('gift-set-2')).toBe('gift-set-3');
    expect(nextSlugCandidate('gift-set-9')).toBe('gift-set-10');
  });

  it('keeps trailing numbers that are part of the name', () => {
    expect(nextSlugCandidate('jerky-300g')).toBe('jerky-300g-2');
  });
});

describe('productCreateSchema', () => {
  const base = {
    name: '테스트 상품',
    basePrice: 10000,
    optionName: '구성',
    optionValue: '기본',
    stock: 10,
  };

  it('accepts input without a slug so the server can generate one', () => {
    const result = productCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('explains in Korean why a Korean slug is rejected', () => {
    const result = productCreateSchema.safeParse({ ...base, slug: '한글주소' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = result.error.flatten().fieldErrors.slug?.[0] ?? '';
    // 예전에는 여기가 "Invalid" 한 단어였고 화면에 "slug: Invalid"만 떴다.
    expect(message).toContain('영문 소문자');
    expect(message).not.toBe('Invalid');
  });

  it('explains in Korean why a comma-formatted price is rejected', () => {
    const result = productCreateSchema.safeParse({ ...base, basePrice: '10,000' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.basePrice?.[0]).toContain('숫자만');
  });
});
