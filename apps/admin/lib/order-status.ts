/** 고객·관리자 화면에서 실제 주문으로 취급하는 상태. */
const REAL_ORDER_STATUSES = new Set([
  'paid', 'preparing', 'shipped', 'delivered',
  'cancel_requested', 'refund_requested', 'partially_refunded', 'refunded',
]);

export function isRealOrder(status: string): boolean {
  return REAL_ORDER_STATUSES.has(status);
}
