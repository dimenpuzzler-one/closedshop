import { HomepageBuilder } from '@/components/homepage-builder';
import { loadAdminProducts, loadHomeBanners, loadHomeCategoryNames, loadStoreSettings } from '@/lib/admin-data';

export default async function AdminHomepagePage() {
  const [settings, bannerResult, productResult, categoryResult] = await Promise.all([
    loadStoreSettings(),
    loadHomeBanners(),
    loadAdminProducts(),
    loadHomeCategoryNames(),
  ]);
  const source = settings.source === 'supabase' && bannerResult.source === 'supabase' && productResult.source === 'supabase' && categoryResult.source === 'supabase'
    ? 'supabase'
    : settings.source === 'unavailable' || bannerResult.source === 'unavailable' || productResult.source === 'unavailable' || categoryResult.source === 'unavailable'
      ? 'unavailable'
      : 'demo';

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">HOMEPAGE</p>
          <h1>홈페이지 꾸미기</h1>
          <p className="muted">배너·화면 스타일·상품 진열 순서를 관리하고 PC/모바일 화면을 미리 확인합니다.</p>
        </div>
        <span className={`badge ${source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{source}</span>
      </div>

      {source !== 'supabase' ? (
        <div className="admin-note">Supabase 연결과 홈 배너 테이블이 준비되면 실제 배너를 관리할 수 있습니다.</div>
      ) : null}

      <HomepageBuilder settings={settings} banners={bannerResult.banners} products={productResult.products} categories={categoryResult.categories} editable={source === 'supabase'} />
    </>
  );
}
