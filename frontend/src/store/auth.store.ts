import { getMe, logout as apiLogout, type MeResponse } from "@/api/auth";
import { ensureAccessToken } from "@/api/http";
import { setUnauthorizedCallback } from "@/api/token";
import { mastersOptionsStore } from "@/store/mastersOptions.store";
import { create } from "zustand";

export type AppRole =
  | "SUPERADMIN"
  | "SUPER_ADMIN"
  | "ROOT_ADMIN"
  | "ADMIN"
  | "PLANT_ADMIN"
  | "DEPARTMENT_INCHARGE"
  | "MAINTENANCE_MANAGER"
  | "ENGINEER"
  | "STORE_USER"
  | "VIEWER"
  | "VENDOR"
  | "VISITOR"
  | "TEMPORARY_VISITOR"
  | "SECURITY"
  | "USER"
  | "MECHANICAL_INCHARGE"
  | "ELECTRICAL_INCHARGE"
  | "UTILITY_INCHARGE"
  | "TOOLCHANGE_INCHARGE"
  | "CALIBRATION_INCHARGE"
  | "TECHNICIAN"
  | "OPERATOR"
  | "SECURITY_USER";

interface SessionUser {
  id: string;
}

export interface AppSession {
  accessToken: string | null;
  user: SessionUser;
}

export interface AppUser {
  id: string;
  authId: string;
  userCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  profileImageUrl: string | null;
  plantId: string | null;
  plantCode: string | null;
  plantName: string | null;
  department: string | null;
  isActive: boolean;
  roles: AppRole[];
  roleKey?: string;
  scopeType?: "ROOT_ADMIN" | "ORGANIZATION" | "PLANT";
  rolePrecedence?: number;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationLogoUrl?: string | null;
  mfaEnabled?: boolean;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
}

interface AuthState {
  user: AppUser | null;
  session: AppSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activePlantId: string | null;
  activePlantCode: string | null;
  activePlantName: string | null;
  setSession: (session: AppSession | null) => void;
  setUser: (user: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
  setActivePlant: (id: string | null, code: string | null, name: string | null) => void;
  logout: () => Promise<void>;
}

const isDev = import.meta.env.DEV;
function debugAuth(...args: unknown[]) {
  if (isDev) {
    console.log("[AUTH STORE]", ...args);
  }
}

function mapMeToUser(me: MeResponse): AppUser | null {
  if (!me.user || !me.profile) return null;
  const normalizedRoles = me.roles.map((role) => (role === "SUPERADMIN" ? "SUPER_ADMIN" : role)) as AppRole[];

  return {
    id: me.profile.id,
    authId: me.user.id,
    userCode: me.profile.userCode,
    fullName: me.profile.fullName,
    email: me.profile.email,
    phone: me.profile.phone,
    profileImageUrl: me.profile.profileImageUrl,
    plantId: me.profile.plantId,
    plantCode: me.plant?.plantCode ?? null,
    plantName: me.plant?.plantName ?? null,
    department: me.profile.department,
    isActive: me.profile.isActive,
    roles: normalizedRoles,
    roleKey: me.roleKey,
    scopeType: me.scopeType,
    rolePrecedence: me.rolePrecedence,
    organizationId: me.organizationId ?? null,
    organizationName: me.organization?.name ?? null,
    organizationCode: me.organization?.code ?? null,
    organizationLogoUrl: me.organization?.logoUrl ?? null,
    mfaEnabled: me.security?.mfaEnabled ?? false,
    lastLoginAt: me.security?.lastLoginAt ?? null,
    lastLoginIp: me.security?.lastLoginIp ?? null,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  activePlantId: null,
  activePlantCode: null,
  activePlantName: null,
  setSession: (session) =>
    set((state) => {
      if (state.session === session) return state;
      debugAuth("setSession", { hasSession: !!session });
      return { session };
    }),
  setUser: (user) =>
    set((state) => {
      if (state.user === user && state.isAuthenticated === !!user) return state;
      const previousUserId = state.user?.id ?? null;
      const nextUserId = user?.id ?? null;
      const previousOrganizationId = state.user?.organizationId ?? null;
      const nextOrganizationId = user?.organizationId ?? null;

      if (previousUserId !== nextUserId || previousOrganizationId !== nextOrganizationId) {
        mastersOptionsStore.invalidate();
      }

      debugAuth("setUser", { userId: user?.id ?? null, isAuthenticated: !!user });
      return { user, isAuthenticated: !!user };
    }),
  setLoading: (isLoading) =>
    set((state) => {
      if (state.isLoading === isLoading) return state;
      debugAuth("setLoading", { isLoading });
      return { isLoading };
    }),
  setActivePlant: (activePlantId, activePlantCode, activePlantName) =>
    set((state) => {
      if (
        state.activePlantId === activePlantId &&
        state.activePlantCode === activePlantCode &&
        state.activePlantName === activePlantName
      ) {
        return state;
      }
      debugAuth("setActivePlant", { activePlantId, activePlantCode });
      return { activePlantId, activePlantCode, activePlantName };
    }),
  logout: async () => {
    try {
      await apiLogout();
    } finally {
      mastersOptionsStore.invalidate();
      set({
        user: null,
        session: null,
        isAuthenticated: false,
        activePlantId: null,
        activePlantCode: null,
        activePlantName: null,
      });
      debugAuth("logout:reset");
    }
  },
}));

export async function fetchUserProfile(_unusedAuthUserId?: string): Promise<AppUser | null> {
  try {
    const me = await getMe();
    return mapMeToUser(me);
  } catch {
    return null;
  }
}

let initializeAuthStateInFlight: Promise<void> | null = null;

setUnauthorizedCallback(() => {
  const s = useAuthStore.getState();
  if (s.user || s.session || s.isAuthenticated || s.activePlantId) {
    s.setUser(null);
    s.setSession(null);
    s.setActivePlant(null, null, null);
  }
});

export async function initializeAuthState(): Promise<void> {
  if (initializeAuthStateInFlight) {
    return initializeAuthStateInFlight;
  }

  initializeAuthStateInFlight = (async () => {
    const store = useAuthStore.getState();
    if (!store.isLoading && store.isAuthenticated) {
      store.setLoading(true);
    }

    debugAuth("initialize:start");
    try {
      const hasAccessToken = await ensureAccessToken();
      if (!hasAccessToken) {
        store.setUser(null);
        store.setSession(null);
        store.setActivePlant(null, null, null);
        debugAuth("initialize:no-access-token");
        return;
      }

      const me = await getMe();
      const user = mapMeToUser(me);
      store.setUser(user);
      if (user && me.user) {
        store.setSession({
          accessToken: null,
          user: { id: me.user.id },
        });
        if (isSuperAdmin(user)) {
          store.setActivePlant(null, null, null);
        } else {
          store.setActivePlant(user.plantId, user.plantCode, user.plantName);
        }
        debugAuth("initialize:authenticated", { userId: user.id });
      } else {
        store.setSession(null);
        store.setActivePlant(null, null, null);
        debugAuth("initialize:no-user");
      }
    } catch {
      store.setUser(null);
      store.setSession(null);
      store.setActivePlant(null, null, null);
      debugAuth("initialize:error");
    } finally {
      store.setLoading(false);
      initializeAuthStateInFlight = null;
      debugAuth("initialize:done");
    }
  })();

  return initializeAuthStateInFlight;
}

export const hasRole = (user: AppUser | null, roles: AppRole[]): boolean => {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
};

export const isAdmin = (user: AppUser | null): boolean => {
  return hasRole(user, ["ROOT_ADMIN", "SUPERADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_MANAGER"]);
};

export const isSuperAdmin = (user: AppUser | null): boolean => {
  return hasRole(user, ["ROOT_ADMIN", "SUPERADMIN", "SUPER_ADMIN"]);
};

export const isRootAdmin = (user: AppUser | null): boolean => {
  return hasRole(user, ["ROOT_ADMIN"]);
};

export const isIncharge = (user: AppUser | null): boolean => {
  return hasRole(user, [
    "MECHANICAL_INCHARGE",
    "ELECTRICAL_INCHARGE",
    "UTILITY_INCHARGE",
    "TOOLCHANGE_INCHARGE",
    "CALIBRATION_INCHARGE",
  ]);
};
