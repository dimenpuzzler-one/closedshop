import { CategorySettingsForm, HomeContentForm, ShippingSettingsForm } from '@/components/settings-forms';
import { loadCategories, loadStoreSettings } from '@/lib/admin-data';

export default async function AdminSettingsPage() {
  const [settings, categoryResult] = await Promise.all([loadStoreSettings(), loadCategories()]);

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>운영 설정</h1>
          <p className="muted">배송비·카테고리·홈 화면은 여기서 바꿉니다. 개발자에게 요청하지 않아도 됩니다.</p>
        </div>
        <span className={`badge ${settings.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{settings.source}</span>
      </div>

      {settings.source !== 'supabase' ? (
        <div className="admin-note">Supabase 환경변수가 설정되면 실제 값이 표시되고 저장됩니다.</div>
      ) : null}

      <ShippingSettingsForm settings={settings} />
      <CategorySettingsForm categories={categoryResult.categories} />
      <HomeContentForm settings={settings} />
    </>
  );
}
