import { isStrongPassword } from '../utils/passwordPolicy';

describe('password policy', () => {
  it('rejects weak passwords', () => {
    expect(isStrongPassword('password123')).toBe(false);
    expect(isStrongPassword('NoSpecials123')).toBe(false);
    expect(isStrongPassword('SHORT1!a')).toBe(false);
  });

  it('accepts strong passwords', () => {
    expect(isStrongPassword('Str0ng!Passw0rd#2026')).toBe(true);
  });
});
