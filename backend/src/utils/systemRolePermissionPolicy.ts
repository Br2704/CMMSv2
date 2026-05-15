import { RBAC_ACTIONS, RBAC_MODULE_KEYS, normalizeActions, normalizeModuleKey, normalizeRoleName } from './rbac';

export type PermissionMap = Record<string, string[]>;

const SYSTEM_MANAGED_ORG_ROLE_KEYS = new Set(['SUPERADMIN']);
const USER_BLOCKED_MODULES = new Set(['MASTERS', 'PLANTS', 'ORGANIZATIONS', 'ROLE_ACCESS', 'MODULES', 'DEPARTMENTS', 'USERS', 'VENDORS', 'SHIFTS']);
const ADMIN_BLOCKED_MODULES = new Set([] as string[]);
const VENDOR_ALLOWED_MODULES = new Set(['AMC']);
const SECURITY_ALLOWED_MODULES = new Set(['GATES']);
const VISITOR_ALLOWED_MODULES = new Set(['GATES']);
const HR_ALLOWED_MODULES = new Set(['USERS', 'DEPARTMENTS', 'SHIFTS', 'LOGS']);
const SAFETY_ALLOWED_MODULES = new Set(['GATES', 'ESG', 'SAFETY', 'ALERTS']);
const INVENTORY_ALLOWED_MODULES = new Set(['INVENTORY', 'VENDORS', 'MASTERS', 'REPORTS']);
const MAINTENANCE_USER_ALLOWED_MODULES = new Set(['ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'AMC', 'INVENTORY', 'DASHBOARD']);
const MAINTENANCE_MANAGER_ALLOWED_MODULES = new Set(['ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'AMC', 'INVENTORY', 'DASHBOARD', 'REPORTS', 'MASTERS', 'DEPARTMENTS', 'VENDORS', 'ANALYTICS']);
const PRODUCTION_USER_ALLOWED_MODULES = new Set(['DASHBOARD', 'WORK_ORDERS', 'ASSETS', 'NOTIFICATIONS']);

function normalizeSystemRoleKey(roleKey: string): string {
  const normalized = normalizeRoleName(roleKey);
  if (normalized === 'SECURITY_USER') return 'SECURITY';
  return normalized;
}

function normalizePermissionMap(input: PermissionMap | null | undefined): PermissionMap {
  const normalized: PermissionMap = {};
  if (!input) {
    return normalized;
  }

  for (const [moduleKeyRaw, actionsRaw] of Object.entries(input)) {
    const moduleKey = normalizeModuleKey(moduleKeyRaw);
    if (!moduleKey) continue;
    const actions = normalizeActions(Array.isArray(actionsRaw) ? actionsRaw : []);
    if (actions.length === 0) continue;
    normalized[moduleKey] = actions;
  }

  return normalized;
}

function buildAllModulesPermissionMap(blockedModules: Set<string> = new Set()): PermissionMap {
  const map: PermissionMap = {};
  for (const moduleKey of RBAC_MODULE_KEYS) {
    if (blockedModules.has(moduleKey)) continue;
    map[moduleKey] = [...RBAC_ACTIONS];
  }
  return map;
}

function pickAllowedModules(map: PermissionMap, allowedModules: Set<string>): PermissionMap {
  const picked: PermissionMap = {};
  for (const moduleKey of allowedModules) {
    const normalizedModule = normalizeModuleKey(moduleKey);
    const actions = normalizeActions(map[normalizedModule] ?? []);
    if (actions.length > 0) {
      picked[normalizedModule] = actions;
    }
  }
  return picked;
}

function ensureModuleReadAccess(map: PermissionMap, moduleKey: string): PermissionMap {
  const normalizedModule = normalizeModuleKey(moduleKey);
  const actions = normalizeActions(map[normalizedModule] ?? []);
  map[normalizedModule] = actions.length > 0 ? actions : ['READ'];
  return map;
}

export function isSystemManagedOrganizationRole(roleKey: string): boolean {
  return SYSTEM_MANAGED_ORG_ROLE_KEYS.has(normalizeSystemRoleKey(roleKey));
}

export function applySystemRolePermissionPolicy(roleKey: string, input: PermissionMap): PermissionMap {
  const normalizedRole = normalizeSystemRoleKey(roleKey);
  const normalizedInput = normalizePermissionMap(input);
  const isInputEmpty = Object.keys(normalizedInput).length === 0;

  // SUPERADMIN policy is always strictly enforced to ensure org recovery.
  if (normalizedRole === 'SUPERADMIN') {
    const map = buildAllModulesPermissionMap();
    map.ORGANIZATIONS = ['READ'];
    map.PLANTS = ['READ', 'UPDATE'];
    return map;
  }

  // For other system roles, if the input is NOT empty, it means a Root Admin 
  // has manually configured permissions. We respect those overrides.
  if (!isInputEmpty) {
    return normalizedInput;
  }

  // Baseline defaults for newly created or unconfigured system roles:
  if (normalizedRole === 'ADMIN') {
    const map = buildAllModulesPermissionMap(ADMIN_BLOCKED_MODULES);
    map.ORGANIZATIONS = ['READ'];
    map.PLANTS = ['READ'];
    return map;
  }

  if (normalizedRole === 'MAINTENANCE_MANAGER') {
    const map = pickAllowedModules(normalizedInput, MAINTENANCE_MANAGER_ALLOWED_MODULES);
    for (const mod of MAINTENANCE_MANAGER_ALLOWED_MODULES) {
      map[mod] = [...RBAC_ACTIONS];
    }
    return map;
  }

  if (normalizedRole === 'MAINTENANCE_USER') {
    const map = pickAllowedModules(normalizedInput, MAINTENANCE_USER_ALLOWED_MODULES);
    for (const mod of MAINTENANCE_USER_ALLOWED_MODULES) {
      map[mod] = ['READ', 'CREATE', 'UPDATE', 'EXPORT'];
    }
    return map;
  }

  if (normalizedRole === 'HR_USER') {
    const map = pickAllowedModules(normalizedInput, HR_ALLOWED_MODULES);
    for (const mod of HR_ALLOWED_MODULES) {
      map[mod] = [...RBAC_ACTIONS];
    }
    return map;
  }

  if (normalizedRole === 'SAFETY_OFFICER') {
    const map = pickAllowedModules(normalizedInput, SAFETY_ALLOWED_MODULES);
    for (const mod of SAFETY_ALLOWED_MODULES) {
      map[mod] = ['READ', 'UPDATE', 'EXPORT'];
    }
    return map;
  }

  if (normalizedRole === 'INVENTORY_MANAGER') {
    const map = pickAllowedModules(normalizedInput, INVENTORY_ALLOWED_MODULES);
    for (const mod of INVENTORY_ALLOWED_MODULES) {
      map[mod] = [...RBAC_ACTIONS];
    }
    return map;
  }

  if (normalizedRole === 'PRODUCTION_USER') {
    const map = pickAllowedModules(normalizedInput, PRODUCTION_USER_ALLOWED_MODULES);
    map.DASHBOARD = ['READ'];
    map.WORK_ORDERS = ['READ', 'CREATE'];
    map.ASSETS = ['READ'];
    map.NOTIFICATIONS = ['READ', 'UPDATE'];
    return map;
  }

  if (normalizedRole === 'VISITOR') {
    return { GATES: ['READ', 'CREATE'] };
  }

  if (normalizedRole === 'VENDOR') {
    return { AMC: ['READ', 'UPDATE'] };
  }

  if (normalizedRole === 'SECURITY') {
    return { GATES: ['READ', 'CREATE', 'UPDATE', 'EXPORT'] };
  }

  if (normalizedRole === 'USER') {
    const filtered: PermissionMap = {};
    for (const [moduleKey, actions] of Object.entries(normalizedInput)) {
      if (USER_BLOCKED_MODULES.has(moduleKey)) continue;
      filtered[moduleKey] = actions;
    }
    return filtered;
  }

  return normalizedInput;
}
