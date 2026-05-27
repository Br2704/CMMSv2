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

  if (path === "/") {
    return isSuper || isPlantAdmin;
  }

  if (path === "/work-orders") {
    return isOperationalRole(roles) || isVendor;
  }

  if (path === "/assets") {
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

  if (path === "/security-gate") {
    return isSecurity || isSuper || isPlantAdmin || isHrAdmin || hasAnyRole(roles, ["HR_MANAGER", "HR_USER"]);
  }

  if (path === "/visitor-experience") {
    return isNonSecurityActor(roles);
  }

  if (path === "/logs") {
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
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["ESG_ADMIN", "ESG_MANAGER"]);
  }

  if (path === "/masters/gates") {
    return isSuper || isPlantAdmin || isHrAdmin || hasAnyRole(roles, ["HR_MANAGER"]);
  }

  if (path === "/masters/safety-config") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["SAFETY_MANAGER"]);
  }

  if (path === "/masters/email-reports") {
    return isSuper || isPlantAdmin;
  }

  if (path === "/masters/log-templates") {
    return isSuper || isPlantAdmin || isManager;
  }

  if (path === "/masters/shifts") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["HR_MANAGER"]);
  }

  if (path === "/masters/maintenance-teams") {
    return isSuper || isPlantAdmin || hasAnyRole(roles, ["MAINTENANCE_MANAGER"]);
  }

  return context.canAccessModule(pathToModuleId(path), "view");
}

function pathToModuleId(path: string): string {
  const page = NON_ROOT_APP_PAGES.find((item) => item.path === path);
  return page?.moduleId ?? path.replace(/^\//, "");
}

export function getAccessibleAppPages(context: AccessibleRouteContext): AppPageDefinition[] {
  return NON_ROOT_APP_PAGES.filter((page) => isPathAccessible(page.path, context));
}

export function resolveAccessibleLandingPath(context: AccessibleRouteContext): string {
  const roles = normalizedRoleSet([context.roleKey ?? "", ...context.roles]);

  if (roles.has("ROOT_ADMIN")) return "/root/dashboard";
  if (roles.has("SECURITY")) return "/security-gate";
  if (roles.has("VENDOR")) return isPathAccessible("/work-orders", context) ? "/work-orders" : "/visitor-experience";
  if (roles.has("VISITOR")) return "/visitor-experience";
  if (roles.has("SUPER_ADMIN") || roles.has("PLANT_ADMIN")) return "/";
  if (isAdminOrManagerRole(roles) && isPathAccessible("/masters", context)) return "/masters";

  const preferred = [
    "/work-orders",
    "/masters",
    "/visitor-experience",
    "/security-gate",
    "/logs",
    "/reports",
    "/inventory",
    "/amc",
    "/preventive-maintenance",
    "/calibration",
    "/esg",
  ];

  for (const path of preferred) {
    if (isPathAccessible(path, context)) return path;
  }

  const first = getAccessibleAppPages(context)[0];
  return first?.path ?? "/visitor-experience";
}
