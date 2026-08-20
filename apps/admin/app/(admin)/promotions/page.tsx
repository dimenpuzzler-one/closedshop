import { formatWon } from '@closed-commerce/config';
import { Badge } from '@closed-commerce/ui';
import { loadAdminPromotions } from '@/lib/admin-data';
import { PromotionCreateForm } from '@/components/admin-create-forms';

export default async function PromotionsPage() {
  const result = await loadAdminPromotions();
  return <><div className="admin-heading"><div><p className="eyebrow">PRICING</p><h1>Promotion 관리</h1><p className="muted">가격·할인조건은 Referral 귀속과 분리해 운영합니다.</p></div><span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span></div>{result.source === 'unavailable' ? <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 Promotion 조건이 표시됩니다.</div> : null}<div className="card table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>할인</th><th>최소 주문금액</th><th>사용량</th><th>상태</th><th>조건</th></tr></thead><tbody>{result.promotions.map((promotion) => <tr key={promotion.id}><td><strong>{promotion.code}</strong></td><td>{promotion.rule.discountRate ? `${promotion.rule.discountRate * 100}%` : formatWon(promotion.rule.discountAmount ?? 0)}</td><td>{promotion.rule.minimumOrderAmount ? formatWon(promotion.rule.minimumOrderAmount) : '없음'}</td><td>{promotion.usageCount}{promotion.totalUsageLimit ? ` / ${promotion.totalUsageLimit}` : ''}</td><td><Badge tone="success">{promotion.status}</Badge></td><td>회원별 {promotion.perMemberUsageLimit ?? '제한 없음'}회</td></tr>)}</tbody></table></div><PromotionCreateForm /><div className="admin-section admin-note">Promotion Code는 주문에 discount_amount와 promotion_code를 snapshot하고, Promotion 조건 변경이 과거 주문에 영향을 주지 않도록 합니다.</div></>;
}
