import { describe, expect, it } from 'vitest';
import { savedAddressSchema } from '../src/index';

const validAddress = {
  label: '우리집',
  recipientName: '김건엽',
  phone: '010-1234-5678',
  postalCode: '06716',
  addressLine1: '서울특별시 서초구 반포대로 58',
  addressLine2: '101동 1203호',
  deliveryMessage: '문 앞에 놓아 주세요',
};

describe('savedAddressSchema', () => {
  it('accepts a complete Korean shipping address', () => {
    expect(savedAddressSchema.safeParse(validAddress).success).toBe(true);
  });

  it('requires a detail address for address-book entries', () => {
    expect(
      savedAddressSchema.safeParse({ ...validAddress, addressLine2: '' })
        .success,
    ).toBe(false);
  });

  it('rejects a non-five-digit postal code', () => {
    expect(
      savedAddressSchema.safeParse({ ...validAddress, postalCode: '123456' })
        .success,
    ).toBe(false);
  });

  it('accepts optional sender details for gift orders', () => {
    expect(
      savedAddressSchema.safeParse({
        ...validAddress,
        senderName: '선물 보내는 사람',
        senderPhone: '010-9876-5432',
      }).success,
    ).toBe(true);
  });
});
