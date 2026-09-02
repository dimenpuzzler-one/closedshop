import Link from 'next/link';
import { loadAdminProducts, loadCategories, toCategoryGroups } from '@/lib/admin-data';
import { ProductCreateForm } from '@/components/admin-create-forms';
import { ProductTable } from '@/components/product-table';

export default async function AdminProductsPage() {
  const [result, categoryResult] = await Promise.all([loadAdminProducts(), loadCategories()]);
  const categories = toCategoryGroups(categoryResult.categories);
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h1>상품 관리</h1>
          <p className="muted">등록한 상품은 “수정”에서 내용을 바꾸고, 홈 진열 순서와 목록의 “삭제”에서 정리할 수 있습니다.</p>
        </div>
        <span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span>
      </div>
      {result.source === 'unavailable' ? (
        <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 상품 데이터가 표시됩니다.</div>
      ) : null}

      <ProductTable products={result.products} editable={result.source === 'supabase'} categories={categories} />

      <ProductCreateForm categories={categories} />
      <div className="admin-section admin-note">
        목록의 “삭제” 버튼으로 상품을 정리할 수 있습니다. 주문 이력이 있는 상품은 삭제되지 않으니 판매 상태를 “판매 중지”로 바꾸세요.
        공개 검색을 막아야 하는 상품은 노출 대상을 “추천 회원 전용” 또는 “비공개”로 두면 됩니다.
        배송비와 카테고리, 홈 화면 문구는 <Link href="/settings">운영 설정</Link>에서 바꿉니다.
      </div>
    </>
  );
}
