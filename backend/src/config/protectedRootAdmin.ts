export const PROTECTED_ROOT_ADMIN = {
  fullName: 'Root Admin',
  email: 'admin@tamoptix.tech',
  roleKey: 'ROOT_ADMIN',
  passwordHash: '$2a$10$MMEsHPAlgS3Tq5W97SUI5u/K/5lPBqMFbr9X9/vxFKC/PhyFLY7fi',
  organizationName: 'TamOptiX Technologies',
  organizationCode: 'TAMOPTIX',
  organizationLogoUrl: '/tamoptix/tamoptix-logo.svg',
  organizationFaviconUrl: '/tamoptix/tamoptix-favicon.svg',
  profileImageUrl: '/tamoptix/tamoptix-logo.svg',
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
