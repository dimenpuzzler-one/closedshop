-- 운영자가 코드 수정 없이 고객몰의 기본 분위기·본문 폭·섹션 간격을 고른다.
-- 임의 CSS 입력은 화면 파손과 스크립트 삽입 위험이 있어 검증된 프리셋만 허용한다.
alter table public.store_settings
  add column if not exists site_theme text not null default 'dealkey_gold',
  add column if not exists site_width text not null default 'wide',
  add column if not exists site_density text not null default 'compact';

alter table public.store_settings
  drop constraint if exists store_settings_site_theme_check;
alter table public.store_settings
  add constraint store_settings_site_theme_check
  check (site_theme in ('dealkey_gold', 'warm_beige', 'clean_white'));

alter table public.store_settings
  drop constraint if exists store_settings_site_width_check;
alter table public.store_settings
  add constraint store_settings_site_width_check
  check (site_width in ('standard', 'wide'));

alter table public.store_settings
  drop constraint if exists store_settings_site_density_check;
alter table public.store_settings
  add constraint store_settings_site_density_check
  check (site_density in ('compact', 'balanced', 'spacious'));
