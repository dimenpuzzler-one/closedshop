export function ShippingCutoffNotice({ time }: { time: string }) {
  return <div className="notice shipping-cutoff-notice"><strong>배송 마감 {time}</strong><span>마감 시간 이후 주문은 다음 출고 일정으로 처리될 수 있습니다.</span></div>;
}
