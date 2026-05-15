import { getStoredAccessToken } from "@/api/http";
import { NON_ROOT_APP_PAGES } from "@/config/app-page-catalog";
import { usePermissionsStore } from "@/store/permissions.store";
import { useAuthStore } from "@/store/auth.store";
import { useFeaturesStore } from "@/store/features.store";
import { useEffect } from "react";

const catalogModuleAlias = Object.fromEntries(
  NON_ROOT_APP_PAGES.map((page) => {
    const aliases = Array.from(new Set([page.permissionModuleKey, ...(page.aliases ?? []), "*"]));
    return [page.moduleId.toLowerCase(), aliases];
  }),
) as Record<string, string[]>;

const catalogFeatureByModule = Object.fromEntries(
  NON_ROOT_APP_PAGES
    .filter((page) => Boolean(page.featureKey))
    .map((page) => [page.moduleId.toLowerCase(), page.featureKey as string]),
) as Record<string, string>;

const MODULE_ALIAS: Record<string, string[]> = {
  ...catalogModuleAlias,
  calibration: ["CALIBRATION", "*"],
  amc: ["AMC", "*"],
  esg: ["ESG", "*"],
  safety: ["SAFETY", "*"],
  "security-center": ["SECURITY", "AUDIT_LOGS", "*"],
  "security-gate": ["GATES", "SECURITY_GATE", "*"],
  "data-logging": ["LOGS", "DATA_LOGGING", "*"],
  "masters.plant": ["PLANTS", "*"],
  "masters.departments": ["DEPARTMENTS", "MASTERS", "*"],
  "masters.modules": ["MODULES", "MASTERS.MODULES", "MASTERS", "*"],
  "masters.machines": ["ASSETS", "MASTERS", "*"],
  "masters.cost-centers": ["DEPARTMENTS", "MASTERS", "*"],
  "masters.vendors": ["VENDORS", "MASTERS", "*"],
  "masters.users": ["USERS", "*"],
  "masters.esg-config": ["ESG", "MASTERS", "*"],
  "masters.safety-config": ["SAFETY", "MASTERS", "*"],
  "masters.pm-config": ["PM", "PM_SCHEDULES", "MASTERS", "*"],
  "masters.calibration-config": ["CALIBRATION", "MASTERS", "*"],
  "masters.amc-config": ["AMC", "MASTERS", "*"],
  "masters.email-reports": ["REPORTS", "MASTERS", "*"],
  "masters.gates": ["GATES", "MASTERS", "*"],
  "masters.shifts": ["SHIFTS", "MASTERS", "*"],
  "masters.maintenance-teams": ["MASTERS", "*"],
  "masters.workorder-team-mapping": ["MASTERS", "*"],
  "masters.log-templates": ["LOGS", "MASTERS", "*"],
  benchmarking: ["BENCHMARKING", "*"],
  "performance-logs": ["ANALYTICS", "PERFORMANCE_LOGS", "BENCHMARKING", "*"],
  insights: ["BENCHMARKING", "INSIGHTS", "ANALYTICS", "*"],
  "global-operations": ["BENCHMARKING", "GLOBAL_OPERATIONS", "REPORTS", "ANALYTICS", "*"],
  alerts: ["NOTIFICATIONS", "ALERTS", "*"],
  diagnostics: ["REPORTS", "DIAGNOSTICS", "ANALYTICS", "*"],
};

const FEATURE_BY_MODULE: Record<string, string> = {
  ...catalogFeatureByModule,
  safety: "SAFETY",
  "masters.safety-config": "SAFETY",
  esg: "ESG",
  "masters.esg-config": "ESG",
  "security-gate": "GATE_ENTRY",
  "masters.gates": "GATE_ENTRY",
  benchmarking: "ADVANCED_ANALYTICS",
  "performance-logs": "ADVANCED_ANALYTICS",
  insights: "ADVANCED_ANALYTICS",
  "global-operations": "ADVANCED_ANALYTICS",
  diagnostics: "ADVANCED_ANALYTICS",
};

function normalizeAction(action: string | null | undefined): string {
  const input = (action || "").toUpperCase();
  if (input === "VIEW" || input === "READ") return "READ";
  if (input === "CREATE" || input === "ADD") return "CREATE";
  if (input === "EDIT" || input === "UPDATE") return "UPDATE";
  if (input === "DELETE" || input === "REMOVE") return "DELETE";
  return input;
}

function normalizeModuleIds(moduleId: string): string[] {
  if (!moduleId) return ["*"];
  const key = moduleId.toLowerCase();
  const aliases = MODULE_ALIAS[key] ?? [moduleId, "*"];
  return aliases.map((item) => item.toUpperCase());
}

function normalizeRole(role: string | null | undefined): string {
  if (!role) return "USER";
  const normalized = role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized === "SUPER_ADMIN" || normalized === "SUPERADMIN") return "SUPERADMIN";
  if (normalized === "ROOTADMIN" || normalized === "ROOT_ADMIN") return "ROOT_ADMIN";
  if (normalized === "PLANT_ADMIN" || normalized === "PLANTADMIN") return "ADMIN";
  if (normalized === "ORG_ADMIN" || normalized === "ORGANIZATION_ADMIN") return "ADMIN";
  if (normalized === "SECURITY_USER") return "SECURITY";
  return normalized;
}

function policyAllowsModule(moduleId: string, roles: string[]): boolean {
  if (!moduleId) return true;
  const normalizedRoles = roles.map(normalizeRole);
  const normalizedModuleId = moduleId.trim();
  const normalizedModuleLower = normalizedModuleId.toLowerCase();
  const upperModuleId = normalizedModuleId.toUpperCase();

  if (normalizedModuleLower === "security-center" || upperModuleId === "SECURITY-CENTER") {
    if (normalizedRoles.some(r => ["ROOT_ADMIN", "SUPERADMIN", "ADMIN"].includes(r))) return true;
    // Fall through to let explicit permission maps grant access
  }

  if (normalizedRoles.includes("ROOT_ADMIN")) {
    return true;
  }

  if (normalizedRoles.includes("SUPERADMIN")) {
    return true;
  }

  if (normalizedRoles.includes("ADMIN")) {
    // ADMIN (Plant Admin) can now access Plant Master (READ-only via hasModuleAccess)
    return true;
  }

  if (normalizedRoles.includes("MAINTENANCE")) {
    const allowed = ["dashboard", "workorders", "assets", "pmpd", "pm", "calibration", "logs"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  if (normalizedRoles.includes("USER")) {
    const allowed = ["workorders", "assets", "visitor-experience", "logs", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  if (normalizedRoles.includes("VENDOR")) {
    const allowed = ["workorders", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  if (normalizedRoles.includes("SECURITY")) {
    const allowed = ["gates", "security-gate", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  if (normalizedRoles.includes("VISITOR") || normalizedRoles.includes("TEMPORARY_VISITOR")) {
    const allowed = ["visitor-experience", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  return true;
}

export function invalidatePermissionsCache() {
  usePermissionsStore.getState().invalidate();
}

export function usePermissions() {
  const { user, isLoading: authLoading } = useAuthStore();
  const permissionsMe = usePermissionsStore((state) => state.permissionsMe);
  const loading = usePermissionsStore((state) => state.loading);
  const fetchPermissionsMe = usePermissionsStore((state) => state.fetchPermissionsMe);
  const startWatcher = usePermissionsStore((state) => state.startWatcher);
  const stopWatcher = usePermissionsStore((state) => state.stopWatcher);
  const resetPermissions = usePermissionsStore((state) => state.reset);
  const fetchedAt = usePermissionsStore((state) => state.fetchedAt);
  const lastSyncedAt = usePermissionsStore((state) => state.lastSyncedAt);
  const rbacVersion = usePermissionsStore((state) => state.rbacVersion);
  const featuresLoading = useFeaturesStore((state) => state.loading);
  const isFeatureEnabled = useFeaturesStore((state) => state.isFeatureEnabled);
  const userId = user?.id ?? null;
  const accessToken = getStoredAccessToken();

  useEffect(() => {
    if (authLoading) return;
    const accessToken = getStoredAccessToken();
    if (!user || !accessToken) {
      stopWatcher();
      resetPermissions();
      return;
    }

    void fetchPermissionsMe(false);
    startWatcher();

    return () => {
      stopWatcher();
    };
  }, [authLoading, user, userId, fetchPermissionsMe, startWatcher, stopWatcher, resetPermissions]);

  const hasSyncedPermissions = Boolean(permissionsMe);
  const permissionsBootstrapPending = Boolean(user) && Boolean(accessToken) && !hasSyncedPermissions && fetchedAt === null;
  const userRoles = hasSyncedPermissions ? (permissionsMe?.roles ?? user?.roles ?? []) : (user?.roles ?? []);
  const roleKey = permissionsMe?.roleKey || userRoles[0] || "USER";

  const resolveFeatureForModule = (moduleId: string): string | null => {
    if (!moduleId) return null;
    const normalized = moduleId.trim().toLowerCase();
    return FEATURE_BY_MODULE[normalized] || null;
  };

  const hasFeatureAccess = (moduleId: string): boolean => {
    const featureKey = resolveFeatureForModule(moduleId);
    if (!featureKey) return true;
    return isFeatureEnabled(featureKey);
  };

  const hasModuleAccess = (moduleId: string, action = "view"): boolean => {
    if (!user) return false;
    const normalizedRoles = userRoles.map((role) => normalizeRole(role));
    const requestedAction = normalizeAction(action);
    const acceptableModuleIds = normalizeModuleIds(moduleId);

    // Root admins have absolute governance access.
    // Super admins have full access within their organizational scope.
    if (normalizedRoles.includes("ROOT_ADMIN") || normalizedRoles.includes("SUPERADMIN")) {
      return true;
    }

    // ADMIN role (Plant/Org Admin) can VIEW Plant Master but cannot CREATE, UPDATE, or DELETE.
    // This ensures they only see their scoped data (handled in component) without modification rights.
    if (normalizedRoles.includes("ADMIN")) {
      const isPlantModule = acceptableModuleIds.some((moduleKey) => moduleKey === "PLANTS" || moduleKey === "MASTERS.PLANT");
      if (isPlantModule) {
        return requestedAction === "READ";
      }
    }

    if (!hasFeatureAccess(moduleId)) return false;
    if (!policyAllowsModule(moduleId, userRoles)) return false;

    const permissionMap = permissionsMe?.permissions ?? {};
    return acceptableModuleIds.some((moduleKey) => {
      const actions = (permissionMap[moduleKey.toUpperCase()] ?? []).map((item) => item.toUpperCase());
      return actions.includes(requestedAction) || actions.includes("*");
    });
  };

  const getModuleActions = (moduleId: string): string[] => {
    if (!user) return [];

    const keys = normalizeModuleIds(moduleId);
    const allActions = new Set<string>();
    keys.forEach((key) => {
      (permissionsMe?.permissions[key.toUpperCase()] ?? []).forEach((action) => allActions.add(action));
    });
    return Array.from(allActions);
  };

  const hasKpiVisible = (kpiKey: string): boolean => {
    const normalized = kpiKey.trim().toUpperCase();
    const kpis = permissionsMe?.kpis ?? [];
    if (kpis.length === 0) return true;
    const item = kpis.find((kpi) => kpi.kpiKey.toUpperCase() === normalized);
    return item ? item.isVisible : true;
  };

  const orderedKpis = (permissionsMe?.kpis ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    permissionsMe,
    permissions: permissionsMe?.permissions ?? {},
    loading: authLoading || loading || featuresLoading || permissionsBootstrapPending,
    roleKey,
    rolePrecedence: permissionsMe?.rolePrecedence ?? 0,
    allowedRoleTargetsForCreate: permissionsMe?.allowedRoleTargetsForCreate ?? [],
    allowedRoleTargetsForEdit: permissionsMe?.allowedRoleTargetsForEdit ?? [],
    can: hasModuleAccess,
    hasModuleAccess,
    hasFeatureAccess,
    isFeatureEnabled,
    getModuleActions,
    hasKpiVisible,
    orderedKpis,
    invalidateCache: invalidatePermissionsCache,
    userRoles,
    lastSyncedAt,
    rbacVersion,
  };
}
