import { formatWon } from '@closed-commerce/config';
import { Badge, Price } from '@closed-commerce/ui';
import { loadAdminMembers } from '@/lib/admin-data';

export default async function MembersPage() {
  const result = await loadAdminMembers();
  return <><div className="admin-heading"><div><p className="eyebrow">MEMBERS</p><h1>회원 관리</h1><p className="muted">회원 역할, 추천 유입, 주문 매출과 Commission을 한 화면에서 확인합니다.</p></div><span className={`badge ${result.source === 'supabase' ? 'badge-success' : 'badge-warning'}`}>{result.source}</span></div>{result.source === 'unavailable' ? <div className="admin-note">Supabase service role 환경변수를 설정하면 실제 회원 데이터가 표시됩니다.</div> : null}<div className="card table-wrap"><table className="data-table"><thead><tr><th>회원</th><th>역할</th><th>가입일</th><th>직접 추천</th><th>주문</th><th>매출</th><th>Commission</th></tr></thead><tbody>{result.members.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><br /><span className="muted">{member.id}</span></td><td><Badge tone={member.role === 'customer' ? 'neutral' : 'accent'}>{member.role}</Badge></td><td>{new Date(member.createdAt).toLocaleDateString('ko-KR')}</td><td>{member.referrals}명</td><td>{member.orders}건</td><td><Price amount={member.sales} /></td><td>{formatWon(member.commission)}</td></tr>)}</tbody></table></div></>;
}
