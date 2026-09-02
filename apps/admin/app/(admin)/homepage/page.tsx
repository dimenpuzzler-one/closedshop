import { HomepageBuilder } from '@/components/homepage-builder';
import { loadHomeBanners, loadStoreSettings } from '@/lib/admin-data';

export default async function AdminHomepagePage() {
  const [settings, bannerResult] = await Promise.all([loadStoreSettings(), loadHomeBanners()]);
  const source = settings.source === 'supabase' && bannerResult.source === 'supabase'
    ? 'supabase'
    : settings.source === 'unavailable' || bannerResult.source === 'unavailable'
      ? 'unavailable'
      : 'demo';

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">HOMEPAGE</p>
          <h1>홈페이지 꾸미기</h1>
          <p className="muted">홈 상단 전체 이미지 배너와 자동 전환 시간을 관리합니다.</p>
        </div>
        <span className={`badge ${source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{source}</span>
      </div>

      {source !== 'supabase' ? (
        <div className="admin-note">Supabase 연결과 홈 배너 테이블이 준비되면 실제 배너를 관리할 수 있습니다.</div>
      ) : null}

      <HomepageBuilder settings={settings} banners={bannerResult.banners} />
    </>
  );
}
