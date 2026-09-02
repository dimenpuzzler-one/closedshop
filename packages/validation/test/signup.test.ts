import { describe, expect, it } from 'vitest';
import { signupSchema } from '../src/index';

const validSignup = {
  email: 'member@example.com',
  password: 'correct-horse-battery',
  confirmPassword: 'correct-horse-battery',
  displayName: '딜키 회원',
};

describe('signupSchema', () => {
  it('accepts matching passwords', () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it('rejects a different confirmation password', () => {
    const result = signupSchema.safeParse({ ...validSignup, confirmPassword: 'different-password' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('비밀번호가 일치하지 않습니다.');
  });

  it('rejects a password shorter than eight characters', () => {
    expect(signupSchema.safeParse({ ...validSignup, password: '1234567', confirmPassword: '1234567' }).success).toBe(false);
  });
});
