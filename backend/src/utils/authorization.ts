import type { AuthContext } from '../types/auth';
import { normalizeAction, normalizeModuleKey, normalizeRoleName, toPermissionKey } from './rbac';

export type AuthorizationDecision =
  | { allowed: true; moduleKey: string; action: string; permissionKey: string }
  | { allowed: false; moduleKey: string; action: string; permissionKey: string; reason: string };

const ROOT_ADMIN_MODULE_ALLOWLIST = new Set([
  'DASHBOARD',
  'ORGANIZATIONS',
  'PLANTS',
  'USERS',
  'ROLE_ACCESS',
  'MODULES',
  'MASTERS',
  'NOTIFICATIONS',
  'SECURITY',
  'REPORTS',
  'WORK_ORDERS',
  'GATES',
]);

const MODULE_ALIASES: Record<string, string[]> = {
  PM_SCHEDULES: ['PM'],
  PMPD: ['PM'],
  SECURITY_CENTER: ['SECURITY'],
  AUDIT_LOGS: ['SECURITY'],
};

function candidateModuleKeys(moduleId: string): string[] {
  const normalized = normalizeModuleKey(
    moduleId
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  );
  return Array.from(new Set([normalized, ...(MODULE_ALIASES[normalized] ?? [])]));
}

function normalizedRoles(auth: AuthContext): string[] {
  return Array.from(new Set([auth.roleKey, ...auth.roles].filter(Boolean).map((role) => normalizeRoleName(role))));
}

const INCHARGE_CATEGORY_MAP: Record<string, string> = {
  MAINTENANCE_MANAGER: 'MECHANICAL',
  PRODUCTION_MANAGER: 'PRODUCTION',
  SCM_MANAGER: 'SUPPLY_CHAIN',
  HR_MANAGER: 'PEOPLE',
  CALIBRATION_MANAGER: 'CALIBRATION',
};

function getInchargeCategories(auth: AuthContext): string[] {
  const roles = normalizedRoles(auth);
  const categories = Array.from(new Set(roles.map((role) => INCHARGE_CATEGORY_MAP[role]).filter((value): value is string => Boolean(value))));
  if (roles.includes('MAINTENANCE_MANAGER')) {
    categories.push('MECHANICAL', 'ELECTRICAL', 'CIVIL', 'UTILITY', 'INSTRUMENTATION', 'OTHERS');
  }
  return categories;
}

function permissionActions(auth: AuthContext, moduleKey: string): string[] {
  return [...(auth.permissions[moduleKey] ?? []), ...(auth.permissions['*'] ?? [])].map((item) => normalizeAction(item));
}

function allowedMastersForRole(role: string): string[] {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'ROOT_ADMIN' || normalized === 'SUPER_ADMIN' || normalized === 'PLANT_ADMIN') {
    return ['*'];
  }
  if (normalized === 'MAINTENANCE_MANAGER') {
    return [
      'PLANTS',
      'DEPARTMENTS',
      'MODULES',
      'ASSETS',
      'PM',
      'CALIBRATION',
      'AMC',
      'ESG',
      'SAFETY',
      'LOGS',
      'SHIFTS',
      'WORK_ORDER_MASTERS',
      'WORK_ORDER_TEAM_MAPPINGS',
      'MAINTENANCE_TEAMS',
    ];
  }
  if (normalized === 'HR_USER') {
    return ['USERS', 'GATES'];
  }
  if (normalized === 'CALIBRATION_USER') {
    return ['CALIBRATION'];
  }
  if (normalized === 'SCM_USER' || normalized === 'SCM_MANAGER') {
    return ['DEPARTMENTS', 'VENDORS', 'AMC'];
  }
  if (normalized === 'SAFETY_USER' || normalized === 'SAFETY_MANAGER') {
    return ['SAFETY'];
  }
  return [];
}

function masterMutationDenied(auth: AuthContext, moduleKey: string, action: string): boolean {
  if (action === 'READ') return false;

  const masterModuleKeys = new Set([
    'PLANTS',
    'DEPARTMENTS',
    'USERS',
    'GATES',
    'SHIFTS',
    'VENDORS',
    'ROLE_ACCESS',
    'MODULES',
    'CALIBRATION',
    'AMC',
    'ESG',
    'SAFETY',
    'WORK_ORDER_MASTERS',
    'WORK_ORDER_TEAM_MAPPINGS',
    'MAINTENANCE_TEAMS',
  ]);

  if (!masterModuleKeys.has(moduleKey)) {
    return false;
  }

  const roles = normalizedRoles(auth);
  if (roles.includes('ROOT_ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('PLANT_ADMIN')) {
    if (roles.includes('SUPER_ADMIN') && moduleKey === 'PLANTS') {
      return true;
    }
    if (roles.includes('PLANT_ADMIN') && moduleKey === 'PLANTS') {
      return true;
    }
    return false;
  }

  const allowed = roles.flatMap(allowedMastersForRole);
  if (allowed.includes('*')) return false;

  return !allowed.includes(moduleKey);
}

function governanceMutationDenied(auth: AuthContext, moduleKey: string, action: string): boolean {
  const roles = normalizedRoles(auth);
  const isRootAdmin = roles.includes('ROOT_ADMIN');
  if (isRootAdmin) return false;

  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  const isAdmin = roles.includes('PLANT_ADMIN');

  if (moduleKey === 'ORGANIZATIONS' && action !== 'READ') return true;
  if (moduleKey === 'ROLE_ACCESS' && !(isSuperAdmin || isAdmin)) return true;
  if (moduleKey === 'PLANTS' && action !== 'READ' && !(action === 'UPDATE' && (isSuperAdmin || isAdmin))) return true;
  return false;
}

export function authorizePermission(auth: AuthContext, moduleId: string, action: string): AuthorizationDecision {
  const requestedAction = normalizeAction(action);
  const moduleKeys = candidateModuleKeys(moduleId);
  const roles = normalizedRoles(auth);
  const isRootAdmin = roles.includes('ROOT_ADMIN');

  for (const moduleKey of moduleKeys) {
    const permissionKey = toPermissionKey(moduleKey, requestedAction);

    // Permit all authenticated users to view, update, and delete their own notifications
    if (moduleKey === 'NOTIFICATIONS' && ['READ', 'UPDATE', 'DELETE'].includes(requestedAction)) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    // Permit all authenticated users to read basic operational directories (e.g. dropdown lookups)
    // Data-level isolation is still strictly enforced per-user via plantScope middleware.
    if (
      requestedAction === 'READ' &&
      [
        'PLANTS',
        'DEPARTMENTS',
        'MASTERS',
        'WORK_ORDER_MASTERS',
        'WORK_ORDER_TEAM_MAPPINGS',
        'MAINTENANCE_TEAMS',
        'USERS',
        'REPORTS',
        'VENDORS',
        'ASSETS',
        'MODULES',
        'CALIBRATION',
        'CALIBRATION_TEMPLATES',
        'CALIBRATION_SCHEDULES',
        'CALIBRATION_INSTRUMENTS',
        'SHIFTS',
        'ROLE_ACCESS',
        'LOGS',
      ].includes(moduleKey)
    ) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    if (isRootAdmin && ROOT_ADMIN_MODULE_ALLOWLIST.has(moduleKey)) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    if (masterMutationDenied(auth, moduleKey, requestedAction)) {
      return { allowed: false, moduleKey, action: requestedAction, permissionKey, reason: 'MASTER_MUTATION_DENIED' };
    }

    if (governanceMutationDenied(auth, moduleKey, requestedAction)) {
      return { allowed: false, moduleKey, action: requestedAction, permissionKey, reason: 'GOVERNANCE_MUTATION_DENIED' };
    }

    const actions = permissionActions(auth, moduleKey);
    if (actions.includes(requestedAction) || actions.includes('*')) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }
  }

  const moduleKey = moduleKeys[0] ?? normalizeModuleKey(moduleId);
  return {
    allowed: false,
    moduleKey,
    action: requestedAction,
    permissionKey: toPermissionKey(moduleKey, requestedAction),
    reason: 'PERMISSION_MISSING',
  };
}

export function canAccessWorkOrder(
  auth: AuthContext,
  workOrder: {
    raised_by?: unknown;
    assigned_to?: unknown;
    follow_up_team_id?: unknown;
    category?: unknown;
  },
): boolean {
  const roles = normalizedRoles(auth);
  if (roles.some((role) => ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN'].includes(role))) {
    return true;
  }

  const raisedBy = typeof workOrder.raised_by === 'string' ? workOrder.raised_by : null;
  const assignedTo = typeof workOrder.assigned_to === 'string' ? workOrder.assigned_to : null;
  const followUpTeamId = typeof workOrder.follow_up_team_id === 'string' ? workOrder.follow_up_team_id : null;
  const category = typeof workOrder.category === 'string' ? workOrder.category.toUpperCase() : null;
  const inchargeCategories = getInchargeCategories(auth);

  return (
    auth.userId === raisedBy ||
    auth.userId === assignedTo ||
    Boolean(followUpTeamId && (auth.teamIds ?? []).includes(followUpTeamId)) ||
    Boolean(category && inchargeCategories.includes(category))
  );
}
