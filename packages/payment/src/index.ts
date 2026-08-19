export interface PaymentSession {
  paymentId: string;
  checkoutUrl?: string;
  status: 'ready' | 'paid';
  amount: number;
  currency: 'KRW';
}

export interface VerifiedPayment {
  paymentId: string;
  orderId: string;
  amount: number;
  status: 'paid';
  paidAt: string;
}

export interface PaymentCancellation {
  paymentId: string;
  status: 'cancelled';
  cancelledAt: string;
}

export interface PaymentRefund {
  paymentId: string;
  status: 'refunded';
  refundedAmount: number;
  refundedAt: string;
}

export interface PaymentProvider {
  createPayment(input: { orderId: string; amount: number; customerName: string }): Promise<PaymentSession>;
  verifyPayment(input: { paymentId: string; orderId: string; amount: number }): Promise<VerifiedPayment>;
  cancelPayment(input: { paymentId: string; reason: string }): Promise<PaymentCancellation>;
  refundPayment(input: { paymentId: string; amount: number; reason: string }): Promise<PaymentRefund>;
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(input: { orderId: string; amount: number; customerName: string }): Promise<PaymentSession> {
    return { paymentId: `mock_${input.orderId}`, amount: input.amount, currency: 'KRW', status: 'ready' };
  }

  async verifyPayment(input: { paymentId: string; orderId: string; amount: number }): Promise<VerifiedPayment> {
    if (input.paymentId !== `mock_${input.orderId}`) throw new Error('mock payment id가 주문과 일치하지 않습니다.');
    return { paymentId: input.paymentId, orderId: input.orderId, amount: input.amount, status: 'paid', paidAt: new Date().toISOString() };
  }

  async cancelPayment(input: { paymentId: string; reason: string }): Promise<PaymentCancellation> {
    return { paymentId: input.paymentId, status: 'cancelled', cancelledAt: new Date().toISOString() };
  }

  async refundPayment(input: { paymentId: string; amount: number; reason: string }): Promise<PaymentRefund> {
    return { paymentId: input.paymentId, status: 'refunded', refundedAmount: input.amount, refundedAt: new Date().toISOString() };
  }
}
