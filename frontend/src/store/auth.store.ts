import { getMe, logout as apiLogout, type MeResponse } from "@/api/auth";
import { ensureAccessToken, isCurrentlyRateLimited, resetUnauthorizedMode } from "@/api/http";
import { setUnauthorizedCallback } from "@/api/token";
import { mastersOptionsStore } from "@/store/mastersOptions.store";
import { create } from "zustand";
import {
  isSuperAdmin as engineIsSuperAdmin,
} from "@/lib/permission-engine";

export type AppRole = string;

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
  /**
   * Permission map (record of moduleKey -> actions[]) for the user's roles.
   * Set by the permissions store after loading from the backend.
   */
  permissionMap?: Record<string, string[]>;
}

interface AuthState {
  user: AppUser | null;
  session: AppSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isFallbackMode: boolean;
  activePlantId: string | null;
  activePlantCode: string | null;
  activePlantName: string | null;
  lastActiveAt: number | null;
  setSession: (session: AppSession | null) => void;
  setUser: (user: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
  setFallbackMode: (mode: boolean) => void;
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
  const normalizedRoles = (me.roles || []) as AppRole[];

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
  isFallbackMode: false,
  activePlantId: null,
  activePlantCode: null,
  activePlantName: null,
  lastActiveAt: (() => { try { return Number(sessionStorage.getItem("cmms:last_active")) || null; } catch { return null; } })(),
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
  setFallbackMode: (isFallbackMode) =>
    set((state) => {
      if (state.isFallbackMode === isFallbackMode) return state;
      debugAuth("setFallbackMode", { isFallbackMode });
      return { isFallbackMode };
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
      try { localStorage.removeItem("cmms:remember_me"); } catch { /* ignore */ }
      set({
        user: null,
        session: null,
        isAuthenticated: false,
        isFallbackMode: false,
        activePlantId: null,
        activePlantCode: null,
        activePlantName: null,
        lastActiveAt: null,
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
  // Always clear auth state to prevent stale data from causing blank screens
  s.setUser(null);
  s.setSession(null);
  s.setActivePlant(null, null, null);
  s.setLoading(false); // Stop loading spinner

  // Note: We deliberately DO NOT use window.location.href here.
  // Setting user to null triggers ProtectedRoute to re-evaluate,
  // which will smoothly <Navigate> to /login via React Router.
});

export function trackActivity(): void {
  const store = useAuthStore.getState();
  if (store.isAuthenticated) {
    store.lastActiveAt = Date.now();
    try { sessionStorage.setItem("cmms:last_active", String(Date.now())); } catch { /* ignore */ }
  }
}

let initializeAuthRetryCount = 0;
const MAX_INITIALIZE_RETRIES = 1;
let lastInitializeError: string | null = null;

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
      // Reset any previous unauthorized mode to allow new API requests
      resetUnauthorizedMode();
      const hasAccessToken = await ensureAccessToken();
      if (!hasAccessToken) {
        const isRateLimited = isCurrentlyRateLimited();
        const rememberMe = (() => { try { return localStorage.getItem("cmms:remember_me") === "true"; } catch { return false; } })();
        if (rememberMe && initializeAuthRetryCount < MAX_INITIALIZE_RETRIES) {
          initializeAuthRetryCount++;
          debugAuth("initialize:retry-after-delay", { attempt: initializeAuthRetryCount });
          await new Promise((r) => setTimeout(r, 1500));
          const retryResult = await ensureAccessToken();
          if (!retryResult) {
            if (isRateLimited) {
              debugAuth("initialize:rate-limited-skip-clear");
              lastInitializeError = "rate-limited";
              return;
            }
            store.setUser(null);
            store.setSession(null);
            store.setActivePlant(null, null, null);
            debugAuth("initialize:no-access-token-after-retry");
            lastInitializeError = "no-access-token-after-retry";
            return;
          }
        } else {
          if (isRateLimited) {
            debugAuth("initialize:rate-limited-skip-clear");
            lastInitializeError = "rate-limited";
            return;
          }
          store.setUser(null);
          store.setSession(null);
          store.setActivePlant(null, null, null);
          debugAuth("initialize:no-access-token");
          lastInitializeError = "no-access-token";
          return;
        }
      }

      initializeAuthRetryCount = 0; // Reset on success
      lastInitializeError = null;

      const me = await getMe();
      const user = mapMeToUser(me);
      store.setUser(user);
      if (user && me.user) {
        store.setSession({
          accessToken: null,
          user: { id: me.user.id },
        });
        if (engineIsSuperAdmin(user.roles)) {
          store.setActivePlant(null, null, null);
        } else {
          store.setActivePlant(user.plantId, user.plantCode, user.plantName);
        }
        debugAuth("initialize:authenticated", { userId: user.id });
      } else {
        store.setSession(null);
        store.setActivePlant(null, null, null);
        debugAuth("initialize:no-user");
        lastInitializeError = "no-user";
      }
    } catch (error) {
      debugAuth("initialize:error", error);
      lastInitializeError = error instanceof Error ? error.message : "unknown";

      const isAuthError = error && typeof error === "object" && "status" in error;
      const status = isAuthError ? (error as any).status : 0;

      if (status === 401) {
        // 401 means token expired/revoked — clear auth and redirect
        store.setUser(null);
        store.setSession(null);
        store.setActivePlant(null, null, null);
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          const isPublic = path === "/login" || path.startsWith("/qr/") || path.startsWith("/assets/");
          if (!isPublic) {
            window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
          }
        }
      } else {
        // Transient error (network, 5xx, etc.) — keep session alive, just mark not loading
        // The app renders cached/empty state and will retry on next action
        debugAuth("initialize:transient-error-keeping-session", { status });
      }
    } finally {
      store.setLoading(false);
      initializeAuthStateInFlight = null;
      debugAuth("initialize:done");
    }
  })();

  return initializeAuthStateInFlight;
}
