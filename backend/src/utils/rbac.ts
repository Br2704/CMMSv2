export const RBAC_ACTIONS = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'ASSIGN', 'REJECT', 'CLOSE', 'IMPORT'] as const;

export const RBAC_MODULE_KEYS = [
  'ORGANIZATIONS',
  'PLANTS',
  'USERS',
  'ROLE_ACCESS',
  'BENCHMARKING',
  'ANALYTICS',
  'DEPARTMENTS',
  'SHIFTS',
  'VENDORS',
  'GATES',
  'ASSETS',
  'WORK_ORDERS',
  'PM',
  'CALIBRATION',
  'AMC',
  'LOGS',
  'DATA_LOGGING',
  'INVENTORY',
  'DASHBOARD',
  'ESG',
  'SAFETY',
  'REPORTS',
  'NOTIFICATIONS',
  'ALERTS',
  'SECURITY',
  'MODULES',
  'MASTERS',
] as const;

export const DASHBOARD_KPI_KEYS = [
  'TOTAL_ASSETS',
  'TOTAL_WORK_ORDERS',
  'OPEN_WORK_ORDERS',
  'CLOSED_WORK_ORDERS',
  'ACTIVE_WORK_ORDERS',
  'LAST24H_WORK_ORDERS',
  'MTTR',
  'MTBF',
  'MTTF',
  'OVERDUE_PM',
  'PENDING_APPROVAL',
  'OVERDUE_CALIBRATIONS',
  'VISITORS_TODAY',
] as const;

export type ScopeType = 'ROOT_ADMIN' | 'ORGANIZATION' | 'PLANT';

const ROLE_ALIASES: Record<string, string> = {
  SUPER_ADMIN: 'SUPERADMIN',
  SUPERADMIN: 'SUPERADMIN',
  ROOT_ADMIN: 'ROOT_ADMIN',
  ROOTADMIN: 'ROOT_ADMIN',
  PLANT_ADMIN: 'ADMIN',
  PLANTADMIN: 'ADMIN',
  ORG_ADMIN: 'ADMIN',
  ORGANIZATION_ADMIN: 'ADMIN',
  SECURITY_USER: 'SECURITY',
};

const MODULE_ALIASES: Record<string, string> = {
  PM_SCHEDULES: 'PM',
  PMPD: 'PM',
};

const ADMIN_LIKE_ROLES = new Set(['ADMIN', 'MAINTENANCE_MANAGER']);

export function normalizeRoleName(name: string): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return ROLE_ALIASES[normalized] ?? normalized;
}

export function normalizeModuleKey(moduleKey: string): string {
  const normalized = moduleKey.trim().toUpperCase();
  return MODULE_ALIASES[normalized] ?? normalized;
}

export function normalizeAction(action: string): string {
  const input = action.trim().toUpperCase();
  if (input === 'VIEW') return 'READ';
  if (input === 'ADD') return 'CREATE';
  if (input === 'EDIT') return 'UPDATE';
  if (input === 'REMOVE') return 'DELETE';
  return input;
}

export function normalizeActions(actions: string[]): string[] {
  return Array.from(new Set(actions.map((action) => normalizeAction(action)).filter(Boolean)));
}

export function isSuperAdminRole(roleName: string): boolean {
  const normalized = normalizeRoleName(roleName);
  return normalized === 'SUPERADMIN';
}

export function isRootAdminRole(roleName: string): boolean {
  const normalized = normalizeRoleName(roleName);
  return normalized === 'ROOT_ADMIN';
}

export function isAdminRole(roleName: string): boolean {
  const normalized = normalizeRoleName(roleName);
  return ADMIN_LIKE_ROLES.has(normalized);
}

export function roleMatchesRequirement(roleName: string, requiredRole: string): boolean {
  const normalizedRole = normalizeRoleName(roleName);
  const normalizedRequiredRole = normalizeRoleName(requiredRole);

  if (normalizedRole === normalizedRequiredRole) {
    return true;
  }

  if (normalizedRequiredRole === 'ADMIN') {
    return isAdminRole(normalizedRole);
  }

  return false;
}

export function toPermissionKey(moduleKey: string, action: string): string {
  const normalizedModule = normalizeModuleKey(moduleKey).toLowerCase();
  const normalizedAction = normalizeAction(action).toLowerCase();
  return `${normalizedModule}.${normalizedAction}`;
}

export function permissionKeysFromMap(permissionMap: Record<string, string[]>): string[] {
  const keys = new Set<string>();
  for (const [moduleKey, actions] of Object.entries(permissionMap)) {
    for (const action of actions) {
      keys.add(toPermissionKey(moduleKey, action));
    }
  }
  return Array.from(keys).sort();
}

export function resolveScopeType(roleKey: string): ScopeType {
  const normalized = normalizeRoleName(roleKey);
  if (normalized === 'ROOT_ADMIN') return 'ROOT_ADMIN';
  if (normalized === 'SUPERADMIN') return 'ORGANIZATION';
  return 'PLANT';
}
