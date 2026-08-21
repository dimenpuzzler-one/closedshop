import { Container } from '@closed-commerce/ui';
import { CheckoutForm } from '@/components/checkout-form';

export default function CheckoutPage() {
  return (
    <>
      <section className="page-header"><Container><p className="breadcrumb">HOME / CHECKOUT</p><h1>주문서</h1><p className="muted">주문 금액과 배송 정보를 확인하세요.</p></Container></section>
      <section className="section"><Container><CheckoutForm /></Container></section>
    </>
  );
}
