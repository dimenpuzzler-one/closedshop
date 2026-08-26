import Link from 'next/link';
import { loadAdminProducts, loadCategories } from '@/lib/admin-data';
import { ProductCreateForm } from '@/components/admin-create-forms';
import { ProductTable } from '@/components/product-table';

export default async function AdminProductsPage() {
  const [result, categoryResult] = await Promise.all([loadAdminProducts(), loadCategories()]);
  const categories = categoryResult.categories.map((category) => category.name);
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h1>상품 관리</h1>
          <p className="muted">등록한 상품의 이름·가격·재고·사진은 “수정” 버튼에서 바꿀 수 있습니다.</p>
        </div>
        <span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span>
      </div>
      {result.source === 'unavailable' ? (
        <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 상품 데이터가 표시됩니다.</div>
      ) : null}

      <ProductTable products={result.products} editable={result.source === 'supabase'} categories={categories} />

      <ProductCreateForm categories={categories} />
      <div className="admin-section admin-note">
        주문 이력이 있는 상품은 삭제되지 않습니다 — 판매를 멈추려면 판매 상태를 “판매 중지”로 바꾸세요.
        공개 검색을 막아야 하는 상품은 노출 대상을 “추천 회원 전용” 또는 “비공개”로 두면 됩니다.
        배송비와 카테고리, 홈 화면 문구는 <Link href="/settings">운영 설정</Link>에서 바꿉니다.
      </div>
    </>
  );
}
