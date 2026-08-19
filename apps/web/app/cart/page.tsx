import { Container } from '@closed-commerce/ui';
import { CartView } from '@/components/cart-view';

export default function CartPage() {
  return <><section className="page-header"><Container><p className="breadcrumb">HOME / CART</p><h1>장바구니</h1><p className="muted">필요한 수량을 확인한 뒤 주문서를 작성하세요.</p></Container></section><section className="section"><Container><CartView /></Container></section></>;
}
