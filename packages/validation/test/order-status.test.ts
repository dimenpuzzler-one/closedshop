import { describe, expect, it } from 'vitest';
import { orderUpdateSchema } from '../src/index';

describe('order status validation', () => {
  it('requires actual shipping information when marking an order shipped', () => {
    expect(orderUpdateSchema.safeParse({ status: 'shipped' }).success).toBe(false);
    expect(orderUpdateSchema.safeParse({
      status: 'shipped',
      shippingCompany: 'CJ대한통운',
      trackingNumber: '입력 필요',
    }).success).toBe(false);
  });

  it('accepts a carrier and real tracking number', () => {
    expect(orderUpdateSchema.safeParse({
      status: 'shipped',
      shippingCompany: 'CJ대한통운',
      trackingNumber: '123456789012',
    }).success).toBe(true);
  });

  it('does not require shipping fields for non-shipping transitions', () => {
    expect(orderUpdateSchema.safeParse({ status: 'preparing' }).success).toBe(true);
    expect(orderUpdateSchema.safeParse({ status: 'delivered' }).success).toBe(true);
  });
});
