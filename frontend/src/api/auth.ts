import {
  clearStoredCsrfToken,
  clearStoredAccessToken,
  clearStoredRefreshToken,
  clearSessionBootstrapHint,
  httpRequest,
  setSessionBootstrapHint,
  setStoredCsrfToken,
  setStoredAccessToken,
  setStoredRefreshToken,
} from "@/api/http";

export interface MeResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    isActive: boolean;
  } | null;
  profile: {
    id: string;
    userId: string;
    userCode: string;
    fullName: string;
    email: string;
    phone: string | null;
    profileImageUrl: string | null;
    plantId: string | null;
    department: string | null;
    isActive: boolean;
  } | null;
  security?: {
    mfaEnabled: boolean;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
  } | null;
  roles: string[];
  roleKey?: string;
  scopeType?: "ROOT_ADMIN" | "ORGANIZATION" | "PLANT";
  rolePrecedence?: number;
  allowedModules?: string[];
  allowedActionsByModule?: Record<string, string[]>;
  permissionKeys?: string[];
  allowedRoleTargetsForCreate?: string[];
  allowedRoleTargetsForEdit?: string[];
  kpiVisibility?: Array<{ kpiKey: string; isVisible: boolean; displayOrder: number }>;
  plantId: string | null;
  organizationId?: string | null;
  organization?: {
    id: string;
    name: string;
    code?: string | null;
    logoUrl?: string | null;
  } | null;
  plantIds?: string[];
  accessAllPlants?: boolean;
  plant: {
    id: string;
    plantCode: string;
    plantName: string;
  } | null;
}

interface AuthResponse extends MeResponse {
  accessToken: string;
  csrfToken?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  captchaToken?: string;
  captchaAnswer?: string;
  mfaCode?: string;
}

export interface MfaSetupResponse {
  setupToken: string;
  secret: string;
  otpauthUri: string;
  issuer: string;
}

export async function login(input: LoginInput): Promise<MeResponse> {
  const response = await httpRequest<{ success: true; data: AuthResponse }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

  setStoredAccessToken(response.data.accessToken);
  setSessionBootstrapHint();
  if (response.data.csrfToken) {
    setStoredCsrfToken(response.data.csrfToken);
  }
  if ((response.data as any).refreshToken) {
    setStoredRefreshToken((response.data as any).refreshToken);
  }
  const { accessToken: _ignored, csrfToken: _csrfIgnored, refreshToken: _rtIgnored, ...me } = response.data;
  return me;
}

export async function beginMfaSetup(): Promise<MfaSetupResponse> {
  const response = await httpRequest<{ success: true; data: MfaSetupResponse }>("/auth/mfa/setup", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.data;
}

export async function enableMfa(setupToken: string, code: string): Promise<void> {
  await httpRequest<{ success: true; data: { mfaEnabled: boolean } }>("/auth/mfa/enable", {
    method: "POST",
    body: JSON.stringify({ setupToken, code }),
  });
}

export async function disableMfa(password: string, code?: string): Promise<void> {
  await httpRequest<{ success: true; data: { mfaEnabled: boolean } }>("/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}

export async function logout(): Promise<void> {
  try {
    await httpRequest<{ success: true; data: { loggedOut: boolean } }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    clearStoredAccessToken();
    clearStoredCsrfToken();
    clearStoredRefreshToken();
    clearSessionBootstrapHint();
  }
}

export async function getMe(): Promise<MeResponse> {
  const response = await httpRequest<{ success: true; data: MeResponse }>("/auth/me", {
    method: "GET",
  });
  return response.data;
}

export async function updateProfile(data: { fullName?: string; phone?: string | null; profileImageUrl?: string | null }) {
  return httpRequest<{ success: true; data: { user: any; profile: any } }>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
  return httpRequest<{ success: true; data: null }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
