import { NON_ROOT_APP_PAGES, type AppPageDefinition } from "@/config/app-page-catalog";
import { normalizeRole } from "@/lib/permission-engine";

export const ROOT_APP_PATHS = [
  "/root/dashboard",
  "/root/organizations",
  "/root/plant",
  "/root/users",
  "/root/role-access",
  "/root/secret-rotation",
  "/root/backup",
  "/root/mail-config",
  "/root/report-format",
] as const;

export interface AccessibleRouteContext {
  roles: string[];
  roleKey?: string | null;
  canAccessModule: (moduleId: string, action?: string) => boolean;
}

const ADMIN_ROLES = new Set([
  'ROOT_ADMIN',
  'SUPER_ADMIN',
  'PLANT_ADMIN',
  'ESG_ADMIN',
  'HR_ADMIN',
]);

const MANAGER_ROLES = new Set([
  'MAINTENANCE_MANAGER',
  'PRODUCTION_MANAGER',
  'SCM_MANAGER',
  'HR_MANAGER',
  'CALIBRATION_MANAGER',
  'ACCOUNTS_MANAGER',
  'SAFETY_MANAGER',
  'ESG_MANAGER',
]);

const USER_ROLES = new Set([
  'MAINTENANCE_USER',
  'PRODUCTION_USER',
  'SCM_USER',
  'HR_USER',
  'CALIBRATION_USER',
  'ACCOUNTS_USER',
  'SAFETY_USER',
  'ESG_USER',
  'MAINTENANCE_TECHNICIAN',
  'PRODUCTION_OPERATOR',
]);

const OPERATIONAL_ROLES = new Set([...ADMIN_ROLES, ...MANAGER_ROLES, ...USER_ROLES]);

function normalizedRoleSet(roles: string[] = []) {
  return new Set(roles.map((role) => normalizeRole(role)).filter(Boolean));
}

function hasAnyRole(roles: Set<string>, candidates: string[]) {
  return candidates.some((role) => roles.has(role));
}

function isAdminOrManagerRole(roles: Set<string>) {
  return hasAnyRole(roles, [...ADMIN_ROLES, ...MANAGER_ROLES]);
}

function isOperationalRole(roles: Set<string>) {
  return hasAnyRole(roles, [...OPERATIONAL_ROLES]);
}

function isNonSecurityActor(roles: Set<string>) {
  return !roles.has('SECURITY');
}

export function isPathAccessible(path: string, context: AccessibleRouteContext): boolean {
  const roles = normalizedRoleSet([context.roleKey ?? "", ...context.roles]);
  const isRoot = roles.has("ROOT_ADMIN");
  const isSuper = roles.has("SUPER_ADMIN");
  const isPlantAdmin = roles.has("PLANT_ADMIN");
  const isHrAdmin = roles.has("HR_ADMIN");
  const isManager = hasAnyRole(roles, [...MANAGER_ROLES]);
  const isSecurity = roles.has("SECURITY");
  const isVendor = roles.has("VENDOR");
  const isVisitor = roles.has("VISITOR");

  if (isRoot) {
    return path.startsWith("/root/");
  }

  if (isSecurity) {
    return path === "/security-gate";
  }

  if (isVisitor) {
    return path === "/visitor-experience";
  }

  if (isVendor) {
    return path === "/visitor-experience" || path === "/work-orders";
  }

  if (path === "/approvals") {
    return context.canAccessModule("governance", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "PRODUCTION_MANAGER", "CALIBRATION_MANAGER"]);
  }

  if (path === "/") {
    return isSuper || isPlantAdmin;
  }

  if (path === "/work-orders") {
    return isOperationalRole(roles) || isVendor;
  }

  if (path.startsWith("/assets")) {
    return isOperationalRole(roles);
  }

  if (path === "/amc") {
    return context.canAccessModule("amc", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "MAINTENANCE_USER", "SCM_MANAGER", "SCM_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/preventive-maintenance") {
    return context.canAccessModule("pmpd", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "MAINTENANCE_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/calibration") {
    return context.canAccessModule("calibration", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "MAINTENANCE_USER", "CALIBRATION_MANAGER", "CALIBRATION_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/esg") {
    return context.canAccessModule("esg", "view") || hasAnyRole(roles, ["ESG_ADMIN", "ESG_MANAGER", "ESG_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/inventory") {
    return context.canAccessModule("inventory", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "MAINTENANCE_USER", "SCM_MANAGER", "SCM_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/reports") {
    return context.canAccessModule("reports", "view") || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "MAINTENANCE_USER", "SCM_MANAGER", "SCM_USER", "PLANT_ADMIN", "SUPER_ADMIN"]);
  }

  if (path === "/auditor-dashboard") {
    return hasAnyRole(roles, ["PLANT_ADMIN", "SUPER_ADMIN", "QUALITY_MANAGER", "AUDITOR"]);
  }

  if (path === "/security-gate") {
    return isSecurity || isSuper || isPlantAdmin || isHrAdmin || hasAnyRole(roles, ["HR_MANAGER", "HR_USER"]);
  }

  if (path === "/visitor-experience") {
    return isNonSecurityActor(roles);
  }

  if (path === "/logs") {
    return isOperationalRole(roles) && !isVendor && !isVisitor && !isSecurity;
  }

  if (path === "/shift-handover") {
    return isOperationalRole(roles) && !isVendor && !isVisitor && !isSecurity;
  }

  if (path === "/security-center") {
    return isSuper || isPlantAdmin;
  }

  if (path === "/masters") {
    return isAdminOrManagerRole(roles);
  }

  if (path === "/masters/plant") {
    return isAdminOrManagerRole(roles);
  }

  if (path === "/masters/departments" || path === "/masters/modules" || path === "/masters/machines") {
    return isSuper || isPlantAdmin;
  }

  if (path === "/masters/cost-centers" || path === "/masters/vendors") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["SCM_MANAGER", "ACCOUNTS_MANAGER"]);
  }

  if (path === "/masters/users") {
    return isSuper || isPlantAdmin || isHrAdmin || hasAnyRole(roles, ["HR_MANAGER"]);
  }

  if (path === "/masters/pm-config" || path === "/masters/work-order-config" || path === "/masters/sla-config") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["MAINTENANCE_MANAGER"]);
  }

  if (path === "/masters/calibration-config" || path === "/masters/machine-instruments") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["CALIBRATION_MANAGER", "MAINTENANCE_MANAGER"]);
  }

  if (path === "/masters/amc-config") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "SCM_MANAGER"]);
  }

  if (path === "/masters/esg-config") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["ESG_MANAGER"]);
  }

  if (path === "/masters/gates") {
    return isSuper || isPlantAdmin || isHrAdmin;
  }

  if (path === "/masters/safety-config") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["SAFETY_MANAGER"]);
  }

  if (path === "/masters/email-reports") {
    return isSuper || isPlantAdmin || isManager;
  }

  if (path === "/masters/log-templates") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["MAINTENANCE_MANAGER", "PRODUCTION_MANAGER"]);
  }

  if (path === "/masters/shifts") {
    return isSuper || isPlantAdmin || isManager;
  }

  if (path === "/masters/maintenance-teams") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["MAINTENANCE_MANAGER"]);
  }

  return false;
}

export const adminRoutes = [
  "/",
  "/masters",
  "/masters/plant",
  "/masters/departments",
  "/masters/modules",
  "/masters/machines",
  "/masters/cost-centers",
  "/masters/vendors",
  "/masters/users",
  "/masters/pm-config",
  "/masters/calibration-config",
  "/masters/amc-config",
  "/masters/esg-config",
  "/masters/gates",
  "/masters/safety-config",
  "/masters/email-reports",
  "/masters/log-templates",
  "/masters/machine-instruments",
  "/masters/shifts",
  "/masters/maintenance-teams",
  "/masters/work-order-config",
  "/masters/sla-config",
  "/security-center",
] as const;

const operationsRoutes = [
  "/work-orders",
  "/technician",
  "/preventive-maintenance",
  "/calibration",
  "/amc",
  "/assets",
  "/inventory",
  "/security-gate",
  "/visitor-experience",
  "/logs",
  "/shift-handover",
  "/approvals",
] as const;

export const routesWithSidebar = [
  ...adminRoutes,
  ...operationsRoutes,
  ...ROOT_APP_PATHS,
] as const;

export function getAccessibleAppPages(context: AccessibleRouteContext): AppPageDefinition[] {
  return NON_ROOT_APP_PAGES.filter((page) => isPathAccessible(page.path, context));
}

export function getDefaultRedirectPath(context: AccessibleRouteContext): string {
  const roles = normalizedRoleSet([context.roleKey ?? "", ...context.roles]);
  
  if (roles.has("ROOT_ADMIN")) return "/root/dashboard";
  if (roles.has("SUPER_ADMIN") || roles.has("PLANT_ADMIN")) return "/";
  if (roles.has("SECURITY")) return "/security-gate";
  if (roles.has("VENDOR")) return "/work-orders";
  if (roles.has("VISITOR")) return "/visitor-experience";
  if (roles.has("MAINTENANCE_TECHNICIAN") || roles.has("PRODUCTION_OPERATOR")) return "/work-orders";
  if (hasAnyRole(roles, ["MAINTENANCE_MANAGER", "PRODUCTION_MANAGER"])) return "/approvals";

  const first = getAccessibleAppPages(context)[0];
  return first?.path ?? "/visitor-experience";
}

export const resolveAccessibleLandingPath = getDefaultRedirectPath;
