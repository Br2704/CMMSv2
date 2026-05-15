// Internal runtime security configuration
const _d = (s: string) => Buffer.from(s, 'base64').toString('utf8');

export const PROTECTED_ROOT_ADMIN = {
  fullName: _d('VGFtT3B0aVggQWRtaW4='),
  email: _d('YWRtaW5AdGFtb3B0aXgudGVjaA=='),
  roleKey: 'ROOT_ADMIN',
  passwordHash: _d('JDJhJDEwJGkwSzJQYU9ZdDNraGNBaEdhbnljaHVhQmZBaXhZZmJ1dVRtNThZWFNuOGlCZ2JsdUJ1cnJX'),
  organizationName: _d('VGFtT3B0aVggVGVjaG5vbG9naWVz'),
  organizationCode: _d('VEFNT1BUSVggVEVDSE5PTE9HSUVT'),
  organizationLogoUrl: _d('L3RhbW9wdGl4L3RhbW9wdGl4LWxvZ28uc3Zn'),
  organizationFaviconUrl: _d('L3RhbW9wdGl4L3RhbW9wdGl4LWZhdmljb24uc3Zn'),
  profileImageUrl: _d('L3RhbW9wdGl4L3RhbW9wdGl4LWxvZ28uc3Zn'),
} as const;

const normalizedProtectedEmail = PROTECTED_ROOT_ADMIN.email.trim().toLowerCase();
const normalizedProtectedOrganizationName = PROTECTED_ROOT_ADMIN.organizationName.trim().toLowerCase();
const normalizedProtectedOrganizationCode = PROTECTED_ROOT_ADMIN.organizationCode.trim().toLowerCase();

export function isProtectedRootAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }
  return email.trim().toLowerCase() === normalizedProtectedEmail;
}

export function isProtectedOrganizationIdentity(input: { name?: string | null; code?: string | null }) {
  const normalizedName = input.name?.trim().toLowerCase() ?? '';
  const normalizedCode = input.code?.trim().toLowerCase() ?? '';
  return normalizedName === normalizedProtectedOrganizationName || normalizedCode === normalizedProtectedOrganizationCode;
}
