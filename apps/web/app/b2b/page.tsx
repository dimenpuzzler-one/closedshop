import { Container } from '@closed-commerce/ui';
import { B2BLeadForm } from '@/components/b2b-lead-form';

export default function B2BPage() {
  return <><section className="page-header"><Container><p className="breadcrumb">BUSINESS / BULK ORDER</p><h1>기업·단체 대량구매</h1><p className="muted">수량과 납기를 알려주시면 상품 조건과 배송 가능 일정을 확인해 드립니다.</p></Container></section><section className="section"><Container className="two-column"><div><p className="eyebrow">B2B LEAD</p><h2>선물 준비를 함께 설계합니다.</h2><p className="muted">초기에는 관리자 화면에서 견적 요청을 확인하고 수동으로 상담합니다. 향후 기업별 가격표·재주문·세금계산서 흐름을 확장할 수 있습니다.</p><div className="notice">대량 주문은 일반 회원 주문과 공급가·배송비·납기 조건이 달라질 수 있습니다.</div></div><B2BLeadForm /></Container></section></>;
}
