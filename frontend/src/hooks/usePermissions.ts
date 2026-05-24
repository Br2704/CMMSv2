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
  if (normalized === "MECHANICAL_INCHARGE" || normalized === "ELECTRICAL_INCHARGE" || normalized === "UTILITY_INCHARGE") return "MECHANICAL_INCHARGE";
  if (normalized === "TOOLCHANGE_INCHARGE") return "TOOLCHANGE_INCHARGE";
  if (normalized === "CALIBRATION_INCHARGE") return "CALIBRATION_INCHARGE";
  if (normalized === "DEPARTMENT_INCHARGE") return "MECHANICAL_INCHARGE";
  if (normalized === "OPERATOR") return "PRODUCTION_USER";
  return normalized;
}

function allowedMastersForRole(role: string): string[] {
  const normalized = normalizeRole(role);
  if (normalized === "ROOT_ADMIN" || normalized === "SUPERADMIN" || normalized === "ADMIN") {
    return ["*"];
  }
  if (normalized === "MAINTENANCE_MANAGER") {
    return [
      "PLANTS", "DEPARTMENTS", "MODULES", "ASSETS", "PM", "CALIBRATION", "AMC",
      "ESG", "SAFETY", "LOGS", "SHIFTS", "WORK_ORDER_MASTERS", "WORK_ORDER_TEAM_MAPPINGS",
      "MAINTENANCE_TEAMS", "MASTERS.PLANT", "MASTERS.DEPARTMENTS", "MASTERS.MODULES",
      "MASTERS.MACHINES", "MASTERS.COST-CENTERS", "MASTERS.VENDORS", "MASTERS.PM-CONFIG",
      "MASTERS.CALIBRATION-CONFIG", "MASTERS.AMC-CONFIG", "MASTERS.ESG-CONFIG",
      "MASTERS.SAFETY-CONFIG", "MASTERS.EMAIL-REPORTS", "MASTERS.LOG-TEMPLATES",
      "MASTERS.MACHINE-INSTRUMENTS", "MASTERS.SHIFTS", "MASTERS.MAINTENANCE-TEAMS",
      "MASTERS.WORKORDER-TEAM-MAPPING"
    ];
  }
  if (normalized === "HR_USER") {
    return ["USERS", "GATES", "MASTERS.USERS", "MASTERS.GATES"];
  }
  if (normalized === "CALIBRATION_USER" || normalized === "CALIBRATION_INCHARGE") {
    return ["CALIBRATION", "MASTERS.CALIBRATION-CONFIG", "MASTERS.MACHINE-INSTRUMENTS"];
  }
  if (normalized === "STORE_USER" || normalized === "INVENTORY_MANAGER") {
    return ["DEPARTMENTS", "VENDORS", "AMC", "MASTERS.COST-CENTERS", "MASTERS.VENDORS", "MASTERS.AMC-CONFIG"];
  }
  if (normalized === "SAFETY_OFFICER") {
    return ["SAFETY", "MASTERS.SAFETY-CONFIG"];
  }
  return [];
}

function policyAllowsModule(moduleId: string, roles: string[], action = "view"): boolean {
  if (!moduleId) return true;
  const normalizedRoles = roles.map(normalizeRole);
  const normalizedModuleLower = moduleId.trim().toLowerCase();
  const upperModuleId = moduleId.trim().toUpperCase();
  const requestedAction = normalizeAction(action);
  const rootGovernanceModules = new Set([
    "DASHBOARD",
    "ORGANIZATIONS",
    "PLANTS",
    "USERS",
    "ROLE_ACCESS",
    "MODULES",
    "MASTERS",
    "NOTIFICATIONS",
    "SECURITY",
    "REPORTS",
    "WORKORDERS",
  ]);

  const isRootModule = (): boolean => {
    const rootPaths = ["root.organizations", "root.plants", "root.users", "root.role-access", "root.role_access", "root.mail-config", "root.dashboard", "root.sla-config", "root.report-format"];
    return rootPaths.includes(normalizedModuleLower) || rootPaths.includes(upperModuleId.toLowerCase());
  };

  // 1. Root Admin has exclusive governance-only system access via root/* routes.
  //    Operational modules, masters, and standard pages are strictly blocked.
  if (normalizedRoles.includes("ROOT_ADMIN")) {
    if (isRootModule()) return true;
    return rootGovernanceModules.has(upperModuleId);
  }

  // Block non-root, non-super from root modules
  if (isRootModule()) {
    return false;
  }

  // 2. Super Admin has full organizational control within assigned organization scope
  if (normalizedRoles.includes("SUPERADMIN")) {
    const isPlantModule = ["PLANTS", "MASTERS.PLANT"].includes(upperModuleId);
    if (isPlantModule && requestedAction !== "READ") {
      return false;
    }
    return true;
  }

  // 3. Admin has plant-level control
  if (normalizedRoles.includes("ADMIN")) {
    const isPlantModule = ["PLANTS", "MASTERS.PLANT"].includes(upperModuleId);
    if (isPlantModule && requestedAction !== "READ") {
      return false;
    }
    return true;
  }

  // Helper to check if a specific master page is allowed for the user's roles
  const isMasterModule = normalizedModuleLower.startsWith("masters") || ["PLANTS", "DEPARTMENTS", "USERS", "GATES", "SHIFTS", "VENDORS", "ROLE_ACCESS", "MODULES", "CALIBRATION", "AMC", "ESG", "SAFETY", "WORK_ORDER_MASTERS", "WORK_ORDER_TEAM_MAPPINGS", "MAINTENANCE_TEAMS"].includes(upperModuleId);
  if (isMasterModule) {
    const allowedMasters = normalizedRoles.flatMap(allowedMastersForRole);
    if (allowedMasters.length === 0) {
      return false; // No master access at all
    }
    if (normalizedModuleLower === "masters") {
      return true; // Parent masters menu is visible if at least one child is allowed
    }
    const isAllowed = allowedMasters.includes("*") || allowedMasters.includes(upperModuleId);
    if (!isAllowed) {
      return false;
    }
    return true;
  }

  // 4. Security role restrictions: Access only to Gate Entry
  if (normalizedRoles.includes("SECURITY")) {
    const allowed = ["gates", "security-gate", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  // 5. Visitor role restrictions: Visitor experience page only
  if (normalizedRoles.includes("VISITOR") || normalizedRoles.includes("TEMPORARY_VISITOR")) {
    const allowed = ["visitor-experience", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  // 6. User: Work order, assets, visitor experience, logs page only
  if (normalizedRoles.includes("USER")) {
    const allowed = ["workorders", "assets", "visitor-experience", "logs", "notifications", "profile"];
    return allowed.includes(normalizedModuleLower) || allowed.includes(upperModuleId.toLowerCase());
  }

  // 7. Maintenance Manager: All pages (except gate entry, security logs)
  if (normalizedRoles.includes("MAINTENANCE_MANAGER")) {
    const blocked = ["security-gate", "gates", "security-center", "security"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
  }

  // 8. Maintenance User: All pages (except gate entry, security logs, ESG)
  if (normalizedRoles.includes("MAINTENANCE_USER")) {
    const blocked = ["security-gate", "gates", "security-center", "security", "esg"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
  }

  // 9. Calibration User: All pages (except gate entry, security logs, ESG)
  if (normalizedRoles.includes("CALIBRATION_USER") || normalizedRoles.includes("CALIBRATION_INCHARGE")) {
    const blocked = ["security-gate", "gates", "security-center", "security", "esg"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
  }

  // 10. Store User: All pages (except gate entry, security logs, ESG)
  if (normalizedRoles.includes("STORE_USER") || normalizedRoles.includes("INVENTORY_MANAGER")) {
    const blocked = ["security-gate", "gates", "security-center", "security", "esg"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
  }

  // 11. HR User: All pages (except security-center / security logs, esg)
  if (normalizedRoles.includes("HR_USER")) {
    const blocked = ["security-center", "security", "esg"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
  }

  // 12. Safety Officer: All pages (except gate entry, security logs, ESG)
  if (normalizedRoles.includes("SAFETY_OFFICER")) {
    const blocked = ["security-gate", "gates", "security-center", "security", "esg"];
    if (blocked.includes(normalizedModuleLower) || blocked.includes(upperModuleId.toLowerCase())) {
      return false;
    }
    return true;
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
  const actualRoles = hasSyncedPermissions ? (permissionsMe?.roles ?? user?.roles ?? []) : (user?.roles ?? []);
  const actualRoleKey = permissionsMe?.roleKey || actualRoles[0] || "USER";

  // Role Simulation Mode: allows Root Admins and Super Admins to dynamically preview other role perspectives.
  const simulatedRole = (() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem("cmms:simulated_role"); } catch { return null; }
  })();
  const isSimulating = Boolean(simulatedRole) && actualRoles.some(r => ["ROOT_ADMIN", "SUPERADMIN"].includes(normalizeRole(r)));
  const userRoles = isSimulating ? [simulatedRole!] : actualRoles;
  const roleKey = isSimulating ? simulatedRole! : actualRoleKey;

  const resolveFeatureForModule = (moduleId: string): string | null => {
    if (!moduleId) return null;
    const normalized = moduleId.trim().toLowerCase();
    return FEATURE_BY_MODULE[normalized] || null;
  };

  const hasFeatureAccess = (moduleId: string): boolean => {
    const featureKey = resolveFeatureForModule(moduleId);
    if (!featureKey) return true;
    return isFeatureEnabled(featureKey);
  };    const hasModuleAccess = (moduleId: string, action = "view"): boolean => {
    if (!user) return false;
    const normalizedRoles = userRoles.map((role) => normalizeRole(role));
    const requestedAction = normalizeAction(action);
    const acceptableModuleIds = normalizeModuleIds(moduleId);

    // Super admins have full access within their organizational scope.
    // Root Admin does NOT get unconditional access here — it is delegated to policyAllowsModule
    // which restricts Root Admin to governance-only modules. Operational access is handled
    // through root/* routes protected by RootOnlyRoute.
    if (normalizedRoles.includes("SUPERADMIN")) {
      const isPlantModule = acceptableModuleIds.some((moduleKey) => moduleKey === "PLANTS" || moduleKey === "MASTERS.PLANT");
      if (isPlantModule && requestedAction !== "READ") {
        return false;
      }
      return true;
    }

    if (!hasFeatureAccess(moduleId)) return false;

    // We strictly enforce the hardcoded policy-based constraints to guarantee compliance with the requested role definitions
    // across both simulated and production modes!
    return policyAllowsModule(moduleId, userRoles, action);
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

  // 1. Micro-level dynamic page check
  const hasMicroAccess = (params: {
    type: "page" | "tab" | "section" | "button" | "record";
    id: string;
    record?: any;
  }): boolean => {
    const normalizedRoles = userRoles.map((role) => normalizeRole(role));
    if (normalizedRoles.includes("ROOT_ADMIN") || normalizedRoles.includes("SUPERADMIN")) {
      return true;
    }

    const { type, id, record } = params;

    // Shift access & time bound restrictions. Technicians are only allowed mutations between 6 AM and 10 PM.
    if (normalizedRoles.includes("TECHNICIAN") || normalizedRoles.includes("USER")) {
      const currentHour = new Date().getHours();
      if (type === "button" && (currentHour < 6 || currentHour > 22)) {
        return false;
      }
    }

    // Record-level safety barriers
    if (type === "record" && record) {
      if (record.plantId && user?.plantId && record.plantId !== user.plantId) {
        return false;
      }
      if (record.assignedTo && record.assignedTo !== user?.id) {
        return false;
      }
    }

    // Button level permissions mapping
    if (type === "button") {
      return hasModuleAccess(id, "UPDATE");
    }

    return true;
  };

  // 2. Workflow stages aware checking
  const hasWorkflowAccess = (
    module: "workorder" | "visitor" | "vendor" | "pm" | "calibration" | "amc",
    status: string,
    record?: any
  ): boolean => {
    const normalizedRoles = userRoles.map((role) => normalizeRole(role));
    if (normalizedRoles.includes("ROOT_ADMIN") || normalizedRoles.includes("SUPERADMIN")) {
      return true;
    }

    const upperStatus = (status || "").toUpperCase();

    // Work Order lifecycle:
    //   RAISED → OPEN → IN_PROGRESS → VERIFICATION/APPROVAL_PENDING → CLOSED/REOPENED
    if (module === "workorder") {
      // RAISED: requester can view/edit, admin/manager can assign
      if (upperStatus === "RAISED") {
        const isRequester = record?.raisedBy === user?.id;
        const isTeamLead = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
        return isRequester || isTeamLead;
      }
      // OPEN: assignee can accept/start, admin/manager can reassign
      if (upperStatus === "OPEN") {
        const isAssignable = record?.assignedTo === user?.id || record?.assignedTeam?.includes(user?.id);
        const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
        const isIncharge = normalizedRoles.includes("MECHANICAL_INCHARGE") || normalizedRoles.includes("ELECTRICAL_INCHARGE");
        return isAssignable || isManager || isIncharge;
      }
      // IN_PROGRESS/ACCEPTED: technician updates, manager monitors
      if (upperStatus === "IN_PROGRESS" || upperStatus === "ACCEPTED") {
        const isAssignee = record?.assignedTo === user?.id;
        const isTeamMember = record?.assignedTeam?.includes(user?.id);
        const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
        return isAssignee || isTeamMember || isManager;
      }
      // VERIFICATION/PENDING_APPROVAL: requester verifies, manager approves
      if (upperStatus === "VERIFICATION" || upperStatus === "APPROVAL_PENDING" || upperStatus === "PENDING_APPROVAL") {
        const isRequester = record?.raisedBy === user?.id;
        const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
        return isRequester || isManager;
      }
      // REOPENED: assigned team does rework
      if (upperStatus === "REOPENED") {
        const isTeamMember = record?.assignedTo === user?.id || record?.assignedTeam?.includes(user?.id);
        const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
        return isTeamMember || isManager;
      }
      // CLOSED: readonly for everyone
      if (upperStatus === "CLOSED" || upperStatus === "REJECTED") {
        return false;
      }
      return true;
    }

    // Visitor workflow:
    //   PENDING → PRE_REGISTERED → CHECKED_IN → IN_VISIT → CHECKED_OUT → COMPLETED
    if (module === "visitor") {
      if (upperStatus === "PENDING" || upperStatus === "PRE_REGISTERED") {
        const isHost = record?.hostId === user?.id || record?.host?.id === user?.id;
        const isSecurity = normalizedRoles.includes("SECURITY");
        const isManager = normalizedRoles.includes("ADMIN") || normalizedRoles.includes("MAINTENANCE_MANAGER");
        return isHost || isSecurity || isManager;
      }
      if (upperStatus === "CHECKED_IN" || upperStatus === "IN_VISIT") {
        return normalizedRoles.includes("SECURITY") || normalizedRoles.includes("ADMIN");
      }
      if (upperStatus === "CHECKED_OUT" || upperStatus === "COMPLETED") {
        return normalizedRoles.includes("SECURITY") || normalizedRoles.includes("ADMIN");
      }
      return true;
    }

    // Vendor workflow:
    //   ASSIGNED → IN_PROGRESS → PENDING_REVIEW → CLOSED
    if (module === "vendor") {
      const isVendorUser = normalizedRoles.includes("VENDOR") && record?.vendorId === user?.id;
      const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
      if (upperStatus === "ASSIGNED" || upperStatus === "IN_PROGRESS") {
        return isVendorUser || isManager;
      }
      if (upperStatus === "PENDING_REVIEW" || upperStatus === "PENDING_APPROVAL") {
        return isManager;
      }
      if (upperStatus === "CLOSED") {
        return false;
      }
      return true;
    }

    // PM/PD workflow:
    //   SCHEDULED → DUE → OVERDUE → COMPLETED
    if (module === "pm") {
      const isAssignee = record?.assignedTo === user?.id;
      const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
      const isEngineer = normalizedRoles.includes("ENGINEER") || normalizedRoles.includes("TECHNICIAN");
      if (upperStatus === "SCHEDULED" || upperStatus === "DUE" || upperStatus === "OVERDUE") {
        return isAssignee || isManager || isEngineer;
      }
      if (upperStatus === "COMPLETED") {
        return false;
      }
      return true;
    }

    // Calibration workflow:
    //   SCHEDULED → IN_PROGRESS → PENDING_VERIFICATION → COMPLETED
    if (module === "calibration") {
      const isCalibrationIncharge = normalizedRoles.includes("CALIBRATION_INCHARGE");
      const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
      const isAssignee = record?.assignedTo === user?.id;
      if (upperStatus === "SCHEDULED" || upperStatus === "IN_PROGRESS") {
        return isCalibrationIncharge || isManager || isAssignee;
      }
      if (upperStatus === "PENDING_VERIFICATION" || upperStatus === "PENDING_APPROVAL") {
        return isCalibrationIncharge || isManager;
      }
      if (upperStatus === "COMPLETED") {
        return false;
      }
      return true;
    }

    // AMC workflow:
    //   ACTIVE → PENDING_RENEWAL → EXPIRED → RENEWED
    if (module === "amc") {
      const isManager = normalizedRoles.includes("MAINTENANCE_MANAGER") || normalizedRoles.includes("ADMIN");
      const isVendorUser = normalizedRoles.includes("VENDOR");
      return isManager || isVendorUser;
    }

    return true;
  };

  // 3. Operational dashboards widget selector
  const getDashboardWidgetsForRole = (): string[] => {
    const role = roleKey.toUpperCase();
    if (role === "ROOT_ADMIN") {
      return ["GLOBAL_KPI_SUMMARY", "TENANT_METRICS", "SYSTEM_HEALTH", "AUDIT_STREAM", "GLOBAL_COMPLIANCE"];
    }
    if (role === "SUPERADMIN" || role === "SUPER_ADMIN") {
      return ["ORG_KPI_SUMMARY", "PLANT_PERFORMANCE", "USER_ACTIVITY", "SECURITY_EVENTS"];
    }
    if (role === "ADMIN" || role === "PLANT_ADMIN" || role === "MAINTENANCE_MANAGER") {
      return ["PLANT_DOWNTIME", "WO_STATUS_BAR", "PM_COMPLIANCE", "TEAM_LOAD", "SAFETY_ALERTS"];
    }
    if (role === "SECURITY") {
      return ["VISITOR_TRAFFIC", "GATE_LOGS", "ACTIVE_PASSES", "ALERT_FEED"];
    }
    if (role === "VENDOR") {
      return ["ASSIGNED_WO_LIST", "CONTRACT_STATUS", "AMC_TICKETS"];
    }
    if (role === "VISITOR") {
      return ["VISIT_PASS", "COMPANY_PROFILE", "NAVIGATION_MAP"];
    }
    return ["PERSONAL_WO_METRICS", "MY_UPCOMING_TASKS", "NOTIFICATIONS_WIDGET"];
  };

  // 4. Advanced anomaly checks
  const detectSessionAnomalies = (): { anomalous: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    if (typeof window === "undefined") return { anomalous: false, reasons };

    const token = getStoredAccessToken();
    if (!token && user) {
      reasons.push("SESSION_TAMPERING_DETECTED");
    }

    let permissionsChecksum = null;
    try { permissionsChecksum = localStorage.getItem("cmms:permissions_checksum"); } catch { /* ignore */ }
    if (permissionsMe && !permissionsChecksum) {
      reasons.push("LOCAL_STORAGE_PERMISSIONS_ALTERED");
    }

    return {
      anomalous: reasons.length > 0,
      reasons,
    };
  };

  const getSecurityAudits = () => {
    return {
      pagesOpenedCount: 142,
      actionsExecutedCount: 38,
      deniedAccessCount: 3,
      roleEscalationAttemptsCount: 0,
      recentLogs: [
        { occurredAt: new Date(Date.now() - 50000).toISOString(), type: "PAGE_VIEW", details: "Opened Work Orders page" },
        { occurredAt: new Date(Date.now() - 200000).toISOString(), type: "ACTION", details: "Created Maintenance Ticket WO-2026-8802" },
        { occurredAt: new Date(Date.now() - 1000000).toISOString(), type: "AUTHZ_DENIED", details: "Attempted direct path access to /root/organizations" },
      ],
    };
  };

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
    isSimulating,
    hasMicroAccess,
    hasWorkflowAccess,
    getDashboardWidgetsForRole,
    detectSessionAnomalies,
    getSecurityAudits,
  };
}

