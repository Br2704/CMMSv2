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

const ROOT_ADMIN_ALLOWED_MODULE_IDS = new Set([
  "DASHBOARD",
  "MASTERS",
  "PLANTS",
  "USERS",
  "ROLE_ACCESS",
  "ROOT.ORGANIZATIONS",
  "ROOT.PLANTS",
  "ROOT.ROLE_ACCESS",
  "ROOT.ROLE-ACCESS",
  "SECURITY-CENTER",
]);

function normalizeAction(action: string): string {
  const input = action.toUpperCase();
  if (input === "VIEW" || input === "READ") return "READ";
  if (input === "CREATE" || input === "ADD") return "CREATE";
  if (input === "EDIT" || input === "UPDATE") return "UPDATE";
  if (input === "DELETE" || input === "REMOVE") return "DELETE";
  return input;
}

function normalizeModuleIds(moduleId: string): string[] {
  const key = moduleId.toLowerCase();
  const aliases = MODULE_ALIAS[key] ?? [moduleId, "*"];
  return aliases.map((item) => item.toUpperCase());
}

function normalizeRole(role: string): string {
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
  const normalizedRoles = roles.map(normalizeRole);
  const normalizedModuleId = moduleId.trim();
  const normalizedModuleLower = normalizedModuleId.toLowerCase();
  const upperModuleId = normalizedModuleId.toUpperCase();

  if (normalizedModuleLower === "security-center" || upperModuleId === "SECURITY-CENTER") {
    return (
      normalizedRoles.includes("ROOT_ADMIN") ||
      normalizedRoles.includes("SUPERADMIN") ||
      normalizedRoles.includes("ADMIN")
    );
  }

  if (normalizedRoles.includes("ROOT_ADMIN")) {
    return ROOT_ADMIN_ALLOWED_MODULE_IDS.has(upperModuleId);
  }

  if (normalizedRoles.includes("SUPERADMIN")) {
    return true;
  }

  if (normalizedRoles.includes("ADMIN")) {
    if (upperModuleId === "PLANTS" || normalizedModuleLower === "masters.plant") {
      return false;
    }
    return true;
  }

  if (normalizedRoles.includes("USER")) {
    if (upperModuleId === "PLANTS" || normalizedModuleLower === "masters" || normalizedModuleLower.startsWith("masters.")) {
      return false;
    }
    return true;
  }

  if (normalizedRoles.includes("VENDOR")) {
    return upperModuleId === "AMC" || normalizedModuleLower === "amc";
  }

  if (normalizedRoles.includes("SECURITY")) {
    return upperModuleId === "GATES" || normalizedModuleLower === "security-gate" || normalizedModuleLower === "visitor-experience";
  }

  if (normalizedRoles.includes("VISITOR") || normalizedRoles.includes("TEMPORARY_VISITOR")) {
    return upperModuleId === "GATES" || normalizedModuleLower === "security-gate" || normalizedModuleLower === "visitor-experience";
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

    // Super admins are not blocked by feature flags or transient RBAC sync gaps,
    // except Plant Master create/delete which is intentionally restricted.
    if (normalizedRoles.includes("SUPERADMIN")) {
      const isPlantModule = acceptableModuleIds.some((moduleKey) => moduleKey === "PLANTS" || moduleKey === "MASTERS.PLANT");
      if (isPlantModule && (requestedAction === "CREATE" || requestedAction === "DELETE")) {
        return false;
      }
      return true;
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
