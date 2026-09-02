import { CategorySettingsForm, ShippingSettingsForm } from '@/components/settings-forms';
import { loadCategories, loadStoreSettings } from '@/lib/admin-data';

export default async function AdminSettingsPage() {
  const [settings, categoryResult] = await Promise.all([loadStoreSettings(), loadCategories()]);

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>운영 설정</h1>
          <p className="muted">배송비와 상품 카테고리를 관리합니다. 홈 배너는 “홈페이지 꾸미기”에서 바꿉니다.</p>
        </div>
        <span className={`badge ${settings.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{settings.source}</span>
      </div>

      {settings.source !== 'supabase' ? (
        <div className="admin-note">Supabase 환경변수가 설정되면 실제 값이 표시되고 저장됩니다.</div>
      ) : null}

      <ShippingSettingsForm settings={settings} />
      <CategorySettingsForm categories={categoryResult.categories} />
    </>
  );
}
