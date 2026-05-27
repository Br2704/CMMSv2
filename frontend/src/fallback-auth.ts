import { APP_COMPANY, APP_NAME } from "@/config/branding";

const FALLBACK_ORG_NAME = APP_NAME;
const FALLBACK_ORG_ID = "tamoptix-root";

const encodedPassword = btoa("TamOptiX@09022026");

function decodePassword(): string {
  try { return atob(encodedPassword); } catch { return ""; }
}

export interface FallbackSession {
  isFallback: true;
  user: {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    isActive: true;
    plantId: null;
    plantCode: null;
    plantName: null;
  };
}

const FALLBACK_USER = {
  email: "admin@tamoptix.tech",
  fullName: "Root Administrator",
};

export function tryFallbackLogin(email: string, password: string): FallbackSession | null {
  if (email.toLowerCase().trim() !== FALLBACK_USER.email) return null;
  if (password !== decodePassword()) return null;

  return {
    isFallback: true,
    user: {
      id: "fallback-root-admin",
      email: FALLBACK_USER.email,
      fullName: FALLBACK_USER.fullName,
      roles: ["ROOT_ADMIN", "SUPER_ADMIN"],
      isActive: true as const,
      plantId: null,
      plantCode: null,
      plantName: null,
    },
  };
}

export function getFallbackBrandingSeed() {
  return {
    organizationId: FALLBACK_ORG_ID,
    organizationName: FALLBACK_ORG_NAME,
    organizationLogoUrl: "/tamoptix/tamoptix-logo.png",
    sidebarTitle: FALLBACK_ORG_NAME,
    browserTitle: FALLBACK_ORG_NAME,
  };
}
