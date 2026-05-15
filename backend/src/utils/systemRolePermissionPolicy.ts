import { RBAC_ACTIONS, RBAC_MODULE_KEYS, normalizeActions, normalizeModuleKey, normalizeRoleName } from './rbac';

export type PermissionMap = Record<string, string[]>;

const SYSTEM_MANAGED_ORG_ROLE_KEYS = new Set(['SUPERADMIN']);
const USER_BLOCKED_MODULES = new Set(['MASTERS', 'PLANTS', 'ORGANIZATIONS', 'ROLE_ACCESS', 'MODULES', 'DEPARTMENTS', 'USERS', 'VENDORS', 'SHIFTS']);
const ADMIN_BLOCKED_MODULES = new Set([] as string[]);
const VENDOR_ALLOWED_MODULES = new Set(['AMC']);
const SECURITY_ALLOWED_MODULES = new Set(['GATES']);
const VISITOR_ALLOWED_MODULES = new Set(['GATES']);

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

  if (normalizedRole === 'SUPERADMIN') {
    const map = buildAllModulesPermissionMap();
    map.ORGANIZATIONS = ['READ'];
    map.PLANTS = ['READ', 'UPDATE'];
    return map;
  }

  if (normalizedRole === 'ADMIN') {
    const map = buildAllModulesPermissionMap(ADMIN_BLOCKED_MODULES);
    map.ORGANIZATIONS = ['READ'];
    map.PLANTS = ['READ'];
    return map;
  }

  if (normalizedRole === 'VISITOR') {
    const map = pickAllowedModules(normalizedInput, VISITOR_ALLOWED_MODULES);
    map.GATES = normalizeActions(Array.from(new Set([...(map.GATES ?? []), 'READ', 'CREATE'])));
    return map;
  }


  if (normalizedRole === 'VENDOR') {
    const map = pickAllowedModules(normalizedInput, VENDOR_ALLOWED_MODULES);
    return ensureModuleReadAccess(map, 'AMC');
  }

  if (normalizedRole === 'SECURITY') {
    const map = pickAllowedModules(normalizedInput, SECURITY_ALLOWED_MODULES);
    map.GATES = normalizeActions(Array.from(new Set([...(map.GATES ?? []), 'READ', 'CREATE', 'UPDATE', 'EXPORT'])));
    return map;
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
