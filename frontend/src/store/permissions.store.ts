import { getPermissionsMe, type PermissionsMeResponse } from "@/api/permissionsMe";
import { getMe } from "@/api/auth";
import { getOrganizationRbacVersion, getRbacPermissionsMe, getRbacVersion } from "@/api/rbac";
import { getStoredAccessToken } from "@/api/http";
import { useAuthStore } from "@/store/auth.store";
import { create } from "zustand";

const PERMISSIONS_CACHE_TTL_MS = 60_000;
const RBAC_WATCH_INTERVAL_MS = 8_000;
const RBAC_REFRESH_DEBOUNCE_MS = 300;
const RBAC_UPDATED_EVENT = "cmms:permissions-invalidated";
const RBAC_UPDATED_STORAGE_KEY = "cmms:permissions-updated-at";
const RBAC_UPDATED_BROADCAST_CHANNEL = "cmms:permissions-channel";
const ENABLE_RBAC_VERSION_ENDPOINT =
  String(import.meta.env.VITE_ENABLE_RBAC_VERSION_ENDPOINT ?? "true").toLowerCase() !== "false";
const isDev = import.meta.env.DEV;

let watcherIntervalId: number | null = null;
let watcherSubscribers = 0;
let initialVersionCheckDone = false;
let focusHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let invalidateHandler: (() => void) | null = null;
let storageHandler: ((event: StorageEvent) => void) | null = null;
let permissionsBroadcastChannel: BroadcastChannel | null = null;

let permissionsFetchInFlight: Promise<void> | null = null;
let lastPermissionsFetchAtMs = 0;
let lastFallbackRefreshAtMs = 0;
let queuedPermissionsRefreshId: number | null = null;
let lastPermissionsSnapshot = "";

function debugLog(...args: unknown[]) {
  if (isDev) {
    console.log("[PERMISSIONS]", ...args);
  }
}

function emitPermissionsInvalidationSignal() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(RBAC_UPDATED_EVENT));

  try {
    window.localStorage.setItem(RBAC_UPDATED_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage write failures in private/locked contexts.
  }

  try {
    if (typeof BroadcastChannel !== "undefined") {
      if (!permissionsBroadcastChannel) {
        permissionsBroadcastChannel = new BroadcastChannel(RBAC_UPDATED_BROADCAST_CHANNEL);
      }
      permissionsBroadcastChannel.postMessage({ type: RBAC_UPDATED_EVENT, timestamp: Date.now() });
    }
  } catch {
    // Ignore broadcast failures in restricted environments.
  }
}

function normalizeAction(action: string): string {
  const input = action.trim().toUpperCase();
  if (input === "VIEW") return "READ";
  if (input === "ADD") return "CREATE";
  if (input === "EDIT") return "UPDATE";
  if (input === "REMOVE") return "DELETE";
  return input;
}

function normalizeRole(role: string): string {
  const normalized = role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized === "SUPER_ADMIN" || normalized === "SUPERADMIN") return "SUPERADMIN";
  if (normalized === "ROOT_ADMIN" || normalized === "ROOTADMIN") return "ROOT_ADMIN";
  if (normalized === "PLANT_ADMIN" || normalized === "PLANTADMIN") return "ADMIN";
  if (normalized === "ORG_ADMIN" || normalized === "ORGANIZATION_ADMIN") return "ADMIN";
  if (normalized === "SECURITY_USER") return "SECURITY";
  return normalized || "USER";
}

function rolePrecedence(roleKey: string): number {
  const normalized = normalizeRole(roleKey);
  if (normalized === "ROOT_ADMIN") return 400;
  if (normalized === "SUPERADMIN") return 300;
  if (normalized === "ADMIN") return 200;
  if (normalized === "MAINTENANCE_MANAGER") return 180;
  if (normalized === "ENGINEER") return 140;
  if (normalized === "TECHNICIAN") return 130;
  if (normalized === "STORE_USER") return 125;
  if (normalized === "VIEWER") return 110;
  if (normalized === "VENDOR") return 105;
  if (normalized === "SECURITY") return 102;
  return 100;
}

function uniqueRoles(roles: string[]): string[] {
  return Array.from(new Set(roles.map((role) => normalizeRole(role)).filter(Boolean)));
}

function getPrimaryRole(roles: string[]): string {
  if (roles.length === 0) return "USER";
  return [...roles].sort((a, b) => rolePrecedence(b) - rolePrecedence(a))[0];
}

function allowedRoleTargetsForCreate(roleKey: string): string[] {
  const role = normalizeRole(roleKey);
  if (role === "ROOT_ADMIN") return ["ROOT_ADMIN", "SUPERADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "VENDOR", "VISITOR", "USER"];
  if (role === "SUPERADMIN") return ["MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "VENDOR", "VISITOR", "USER"];
  if (role === "ADMIN") return ["MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "USER", "VENDOR", "VISITOR"];
  return [];
}

function allowedRoleTargetsForEdit(roleKey: string): string[] {
  const role = normalizeRole(roleKey);
  if (role === "ROOT_ADMIN") return ["ROOT_ADMIN", "SUPERADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "VENDOR", "VISITOR", "USER"];
  if (role === "SUPERADMIN") return ["MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "VENDOR", "VISITOR", "USER"];
  if (role === "ADMIN") return ["MAINTENANCE_MANAGER", "ENGINEER", "TECHNICIAN", "STORE_USER", "VIEWER", "SECURITY", "USER", "VENDOR", "VISITOR"];
  return [];
}

function normalizePermissionMap(permissionMap: Record<string, string[]> | undefined): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  if (!permissionMap) return normalized;
  Object.entries(permissionMap).forEach(([moduleKey, actions]) => {
    const nextModule = moduleKey.trim().toUpperCase();
    if (!nextModule) return;
    normalized[nextModule] = Array.from(new Set((actions ?? []).map((action) => normalizeAction(action)).filter(Boolean)));
  });
  return normalized;
}

function buildPermissionKeys(permissionMap: Record<string, string[]>): string[] {
  const keys = new Set<string>();
  Object.entries(permissionMap).forEach(([moduleKey, actions]) => {
    const moduleName = moduleKey.trim().toLowerCase();
    actions.forEach((action) => {
      keys.add(`${moduleName}.${normalizeAction(action).toLowerCase()}`);
    });
  });
  return Array.from(keys).sort();
}

function normalizePermissionsPayload(payload: PermissionsMeResponse, currentVersion: number | null): PermissionsMeResponse {
  const normalizedRoles = uniqueRoles(payload.roles ?? []);
  const roles = normalizedRoles.length > 0 ? normalizedRoles : ["USER"];
  const roleKey = normalizeRole(payload.roleKey ?? getPrimaryRole(roles));
  const scopeType = payload.scopeType ?? (roleKey === "ROOT_ADMIN" ? "ROOT_ADMIN" : roleKey === "SUPERADMIN" ? "ORGANIZATION" : "PLANT");
  const permissionMap = normalizePermissionMap(payload.permissions ?? {});
  const kpis = Array.isArray(payload.kpis) ? payload.kpis : [];
  const roleNames = Array.isArray(payload.roleNames) && payload.roleNames.length > 0 ? uniqueRoles(payload.roleNames) : roles;
  const nextVersion = typeof payload.rbacVersion === "number" ? payload.rbacVersion : currentVersion ?? undefined;
  const permissionKeys = Array.isArray(payload.permissionKeys) && payload.permissionKeys.length > 0
    ? payload.permissionKeys
    : buildPermissionKeys(permissionMap);
  const fallbackPlantId = payload.plantId ?? null;
  const plantIds = Array.isArray(payload.plantIds)
    ? payload.plantIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : fallbackPlantId
      ? [fallbackPlantId]
      : [];

  const hasGlobalPlantAccess = roleKey === "ROOT_ADMIN" || roleKey === "SUPERADMIN";

  return {
    ...payload,
    roleNames,
    roles,
    roleKey,
    scopeType,
    rolePrecedence: typeof payload.rolePrecedence === "number" ? payload.rolePrecedence : rolePrecedence(roleKey),
    isRootAdmin: payload.isRootAdmin ?? roles.includes("ROOT_ADMIN"),
    isGlobal: payload.isGlobal ?? (roles.includes("ROOT_ADMIN") || roles.includes("SUPERADMIN")),
    organizationId: payload.organizationId ?? null,
    orgRoleId: payload.orgRoleId ?? null,
    plantId: fallbackPlantId,
    permissions: permissionMap,
    permissionKeys,
    allowedModules: payload.allowedModules ?? Object.keys(permissionMap),
    allowedActionsByModule: payload.allowedActionsByModule ?? permissionMap,
    allowedRoleTargetsForCreate: payload.allowedRoleTargetsForCreate ?? allowedRoleTargetsForCreate(roleKey),
    allowedRoleTargetsForEdit: payload.allowedRoleTargetsForEdit ?? allowedRoleTargetsForEdit(roleKey),
    kpis,
    kpiVisibility: payload.kpiVisibility ?? kpis,
    plantIds,
    accessAllPlants: Boolean(payload.accessAllPlants) || hasGlobalPlantAccess,
    rbacVersion: nextVersion,
  };
}

async function buildPermissionsFromAuthMe(currentVersion: number | null): Promise<PermissionsMeResponse | null> {
  try {
    const me = await getMe();
    const roles = uniqueRoles(Array.isArray(me.roles) ? me.roles : []);
    if (roles.length === 0) {
      return null;
    }

    const hasRootAdmin = roles.includes("ROOT_ADMIN");
    const effectiveRoles = hasRootAdmin ? ["ROOT_ADMIN"] : roles;
    const roleKey = normalizeRole(me.roleKey ?? getPrimaryRole(effectiveRoles));
    const scopeType = me.scopeType ?? (roleKey === "ROOT_ADMIN" ? "ROOT_ADMIN" : roleKey === "SUPERADMIN" ? "ORGANIZATION" : "PLANT");
    const permissionMap = normalizePermissionMap(me.allowedActionsByModule ?? {});
    const kpis = Array.isArray(me.kpiVisibility) ? me.kpiVisibility : [];
    const plantId = me.plantId ?? me.profile?.plantId ?? null;
    const plantIds = Array.isArray(me.plantIds) && me.plantIds.length > 0
      ? me.plantIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : plantId
        ? [plantId]
        : [];
    const permissionKeys = Array.isArray(me.permissionKeys) && me.permissionKeys.length > 0
      ? me.permissionKeys
      : buildPermissionKeys(permissionMap);

    return {
      roleNames: effectiveRoles,
      roles: effectiveRoles,
      roleKey,
      scopeType,
      rolePrecedence: typeof me.rolePrecedence === "number" ? me.rolePrecedence : rolePrecedence(roleKey),
      isRootAdmin: roleKey === "ROOT_ADMIN",
      isGlobal: roleKey === "ROOT_ADMIN" || roleKey === "SUPERADMIN",
      organizationId: me.organizationId ?? null,
      orgRoleId: null,
      plantId,
      permissions: permissionMap,
      permissionKeys,
      allowedModules: me.allowedModules ?? Object.keys(permissionMap),
      allowedActionsByModule: permissionMap,
      allowedRoleTargetsForCreate: me.allowedRoleTargetsForCreate ?? allowedRoleTargetsForCreate(roleKey),
      allowedRoleTargetsForEdit: me.allowedRoleTargetsForEdit ?? allowedRoleTargetsForEdit(roleKey),
      kpis,
      kpiVisibility: kpis,
      plantIds,
      accessAllPlants: me.accessAllPlants ?? (roleKey === "ROOT_ADMIN" || roleKey === "SUPERADMIN"),
      rbacVersion: currentVersion ?? undefined,
    };
  } catch {
    return null;
  }
}

function serializePermissions(data: PermissionsMeResponse | null): string {
  if (!data) return "";
  try {
    return JSON.stringify(data);
  } catch {
    return "";
  }
}

export function __testOnly_arePermissionsEqual(a: PermissionsMeResponse | null, b: PermissionsMeResponse | null) {
  return serializePermissions(a) === serializePermissions(b);
}

interface PermissionsStoreState {
  permissionsMe: PermissionsMeResponse | null;
  loading: boolean;
  fetchedAt: number | null;
  lastSyncedAt: number | null;
  rbacVersion: number | null;
  rbacVersionEndpointAvailable: boolean | null;
  fetchPermissionsMe: (forceRefresh?: boolean) => Promise<void>;
  fetchRbacVersion: (forceRefresh?: boolean) => Promise<void>;
  startWatcher: () => void;
  stopWatcher: () => void;
  invalidate: () => void;
  reset: () => void;
  can: (moduleKey: string, action?: string) => boolean;
}

export const usePermissionsStore = create<PermissionsStoreState>((set, get) => ({
  permissionsMe: null,
  loading: false,
  fetchedAt: null,
  lastSyncedAt: null,
  rbacVersion: null,
  rbacVersionEndpointAvailable: ENABLE_RBAC_VERSION_ENDPOINT ? null : false,

  fetchPermissionsMe: async (forceRefresh = false) => {
    const auth = useAuthStore.getState();
    const accessToken = getStoredAccessToken();
    const now = Date.now();

    if (auth.isLoading) {
      if (!get().permissionsMe && !get().loading) {
        set({ loading: true });
      }
      return;
    }

    if (!auth.user || !accessToken) {
      lastPermissionsFetchAtMs = 0;
      lastPermissionsSnapshot = "";
      if (get().permissionsMe || get().loading || get().fetchedAt || get().rbacVersion) {
        set({ permissionsMe: null, loading: false, fetchedAt: null, rbacVersion: null });
      }
      return;
    }

    if (!forceRefresh && now - lastPermissionsFetchAtMs < PERMISSIONS_CACHE_TTL_MS) {
      return;
    }

    if (permissionsFetchInFlight) {
      return permissionsFetchInFlight;
    }

    const shouldBlock = !get().permissionsMe;
    if (shouldBlock && !get().loading) {
      set({ loading: true });
    }

    permissionsFetchInFlight = (async () => {
      try {
        let nextPermissions: PermissionsMeResponse | null = null;
        let source: "permissions" | "rbac" | "auth-me" = "permissions";

        try {
          const response = await getPermissionsMe();
          nextPermissions = response.data;
        } catch (error: any) {
          const status = Number(error?.status || 0);
          if (status === 403 || status === 404) {
            try {
              const response = await getRbacPermissionsMe();
              nextPermissions = response.data;
              source = "rbac";
            } catch {
              const meFallback = await buildPermissionsFromAuthMe(get().rbacVersion);
              if (meFallback) {
                nextPermissions = meFallback;
                source = "auth-me";
              }
            }

            if (!nextPermissions) {
              throw error;
            }
          } else {
            const meFallback = await buildPermissionsFromAuthMe(get().rbacVersion);
            if (meFallback) {
              nextPermissions = meFallback;
              source = "auth-me";
            }
          }

          if (!nextPermissions) {
            throw error;
          }
        }

        if (!nextPermissions) {
          throw new Error("permissions_unavailable");
        }

        const normalizedPermissions = normalizePermissionsPayload(nextPermissions, get().rbacVersion);
        const nextVersion = typeof nextPermissions?.rbacVersion === "number" ? nextPermissions.rbacVersion : null;
        const nextSnapshot = serializePermissions(normalizedPermissions);
        const state = get();
        const previousSnapshot = serializePermissions(state.permissionsMe);
        const changed = nextSnapshot !== previousSnapshot;
        const nowMs = Date.now();
        lastPermissionsFetchAtMs = nowMs;

        if (changed || (nextVersion !== null && nextVersion !== state.rbacVersion)) {
          lastPermissionsSnapshot = nextSnapshot;
          set({
            permissionsMe: normalizedPermissions,
            loading: false,
            fetchedAt: nowMs,
            lastSyncedAt: nowMs,
            rbacVersion: nextVersion ?? state.rbacVersion,
          });
          debugLog("fetchPermissionsMe:updated", {
            forceRefresh,
            changed,
            version: nextVersion ?? state.rbacVersion,
            source,
          });
          return;
        }

        if (state.loading) {
          set({ loading: false });
        }
        debugLog("fetchPermissionsMe:unchanged", { forceRefresh, source });
      } catch (error: any) {
        const failedAt = Date.now();
        lastPermissionsFetchAtMs = failedAt;
        debugLog("fetchPermissionsMe:failed", { status: error?.status ?? null, message: error?.message ?? "unknown" });
        if (get().loading || get().fetchedAt === null) {
          set({ loading: false, fetchedAt: failedAt });
        }
      } finally {
        permissionsFetchInFlight = null;
      }
    })();

    return permissionsFetchInFlight;
  },

  fetchRbacVersion: async (_forceRefresh = false) => {
    const auth = useAuthStore.getState();
    const accessToken = getStoredAccessToken();
    if (!auth.user || !accessToken) {
      return;
    }

    const state = get();
    if (state.rbacVersionEndpointAvailable === false) {
      const now = Date.now();
      if (now - lastFallbackRefreshAtMs >= PERMISSIONS_CACHE_TTL_MS) {
        lastFallbackRefreshAtMs = now;
        await get().fetchPermissionsMe(false);
      }
      return;
    }

    try {
      const orgId = get().permissionsMe?.organizationId;
      const response = orgId ? await getOrganizationRbacVersion(orgId) : await getRbacVersion();
      const nextVersion = Number(response.data?.version || 0);
      const currentVersion = get().rbacVersion;

      if (get().rbacVersionEndpointAvailable !== true) {
        set({ rbacVersionEndpointAvailable: true });
      }

      if (!Number.isFinite(nextVersion) || nextVersion <= 0) {
        return;
      }

      if (currentVersion === null) {
        set({ rbacVersion: nextVersion });
        return;
      }

      if (nextVersion === currentVersion) {
        return;
      }

      set({ rbacVersion: nextVersion });
      if (queuedPermissionsRefreshId !== null && typeof window !== "undefined") {
        window.clearTimeout(queuedPermissionsRefreshId);
      }

      if (typeof window === "undefined") {
        await get().fetchPermissionsMe(true);
        return;
      }

      queuedPermissionsRefreshId = window.setTimeout(() => {
        queuedPermissionsRefreshId = null;
        void get()
          .fetchPermissionsMe(true)
          .then(() => {
            window.dispatchEvent(new Event(RBAC_UPDATED_EVENT));
          });
      }, RBAC_REFRESH_DEBOUNCE_MS);
    } catch (error: any) {
      const status = Number(error?.status || 0);
      if (status === 404 || status === 403) {
        set({ rbacVersionEndpointAvailable: false });
      }
    }
  },

  startWatcher: () => {
    if (typeof window === "undefined") {
      return;
    }

    watcherSubscribers += 1;
    if (watcherSubscribers > 1) {
      return;
    }

    if (!initialVersionCheckDone) {
      initialVersionCheckDone = true;
      void get().fetchRbacVersion(true);
    }

    watcherIntervalId = window.setInterval(() => {
      void get().fetchRbacVersion(true);
    }, RBAC_WATCH_INTERVAL_MS);

    if (!focusHandler) {
      focusHandler = () => {
        void get().fetchRbacVersion(true);
      };
      window.addEventListener("focus", focusHandler);
    }

    if (!visibilityHandler) {
      visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          void get().fetchRbacVersion(true);
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);
    }

    if (!invalidateHandler) {
      invalidateHandler = () => {
        void get().fetchRbacVersion(true);
        void get().fetchPermissionsMe(true);
      };
      window.addEventListener(RBAC_UPDATED_EVENT, invalidateHandler);
    }

    if (!storageHandler) {
      storageHandler = (event: StorageEvent) => {
        if (event.key !== RBAC_UPDATED_STORAGE_KEY || !event.newValue) {
          return;
        }
        void get().fetchRbacVersion(true);
        void get().fetchPermissionsMe(true);
      };
      window.addEventListener("storage", storageHandler);
    }

    if (typeof BroadcastChannel !== "undefined") {
      try {
        if (!permissionsBroadcastChannel) {
          permissionsBroadcastChannel = new BroadcastChannel(RBAC_UPDATED_BROADCAST_CHANNEL);
        }
        permissionsBroadcastChannel.onmessage = (event: MessageEvent<{ type?: string }>) => {
          if (event.data?.type !== RBAC_UPDATED_EVENT) {
            return;
          }
          void get().fetchRbacVersion(true);
          void get().fetchPermissionsMe(true);
        };
      } catch {
        permissionsBroadcastChannel = null;
      }
    }
  },

  stopWatcher: () => {
    if (typeof window === "undefined" || watcherSubscribers === 0) {
      return;
    }

    watcherSubscribers -= 1;
    if (watcherSubscribers > 0) {
      return;
    }

    if (watcherIntervalId !== null) {
      window.clearInterval(watcherIntervalId);
      watcherIntervalId = null;
    }

    if (focusHandler) {
      window.removeEventListener("focus", focusHandler);
      focusHandler = null;
    }

    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }

    if (invalidateHandler) {
      window.removeEventListener(RBAC_UPDATED_EVENT, invalidateHandler);
      invalidateHandler = null;
    }

    if (storageHandler) {
      window.removeEventListener("storage", storageHandler);
      storageHandler = null;
    }

    if (permissionsBroadcastChannel) {
      permissionsBroadcastChannel.close();
      permissionsBroadcastChannel = null;
    }
  },

  invalidate: () => {
    lastPermissionsFetchAtMs = 0;
    set({ fetchedAt: null });
    emitPermissionsInvalidationSignal();
    void get().fetchRbacVersion(true);
    void get().fetchPermissionsMe(true);
  },

  reset: () => {
    initialVersionCheckDone = false;
    lastPermissionsFetchAtMs = 0;
    lastFallbackRefreshAtMs = 0;
    lastPermissionsSnapshot = "";

    if (queuedPermissionsRefreshId !== null && typeof window !== "undefined") {
      window.clearTimeout(queuedPermissionsRefreshId);
      queuedPermissionsRefreshId = null;
    }

    set({
      permissionsMe: null,
      loading: false,
      fetchedAt: null,
      lastSyncedAt: null,
      rbacVersion: null,
      rbacVersionEndpointAvailable: ENABLE_RBAC_VERSION_ENDPOINT ? null : false,
    });
  },

  can: (moduleKey: string, action = "READ") => {
    const normalizedModule = moduleKey.trim().toUpperCase();
    const normalizedAction = normalizeAction(action);
    const permissionMap = get().permissionsMe?.permissions ?? {};
    const actions = [...(permissionMap[normalizedModule] ?? []), ...(permissionMap["*"] ?? [])].map((item) => item.toUpperCase());
    return actions.includes(normalizedAction) || actions.includes("*");
  },
}));

export function getPermissionsUpdatedEventName() {
  return RBAC_UPDATED_EVENT;
}

export function notifyPermissionsInvalidated() {
  emitPermissionsInvalidationSignal();
}
