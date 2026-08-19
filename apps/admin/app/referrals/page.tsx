import { formatWon } from '@closed-commerce/config';
import { Badge } from '@closed-commerce/ui';
import { loadAdminReferralCodes } from '@/lib/admin-data';
import { ReferralCreateForm } from '@/components/admin-create-forms';

export default async function ReferralsPage() {
  const result = await loadAdminReferralCodes();
  return <><div className="admin-heading"><div><p className="eyebrow">ATTRIBUTION</p><h1>Referral 관리</h1><p className="muted">누가 고객을 데려왔는지, 직접·간접 귀속과 수수료를 분리해 봅니다.</p></div><span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span></div>{result.source === 'unavailable' ? <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 Referral 관계와 Commission이 표시됩니다.</div> : null}<div className="card table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>소유자</th><th>상태</th><th>가입 회원</th><th>L1 Commission</th><th>L2 Commission</th></tr></thead><tbody>{result.codes.map((code) => <tr key={code.id}><td><strong>{code.code}</strong></td><td>{code.ownerName}</td><td><Badge tone="success">{code.status}</Badge></td><td>{code.members}명</td><td>{formatWon(code.l1Commission)}</td><td>{formatWon(code.l2Commission)}</td></tr>)}</tbody></table></div><ReferralCreateForm /><div className="admin-section admin-note">추천 관계는 최초 귀속 후 임의 변경하지 않습니다. 예외 수정이 필요하면 관리자 audit log를 남기고, 과거 주문의 beneficiary는 수정하지 않아야 합니다.</div></>;
}
