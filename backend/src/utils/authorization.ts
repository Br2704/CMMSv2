import type { AuthContext } from '../types/auth';
import { normalizeAction, normalizeModuleKey, normalizeRoleName, toPermissionKey } from './rbac';

export type AuthorizationDecision =
  | { allowed: true; moduleKey: string; action: string; permissionKey: string }
  | { allowed: false; moduleKey: string; action: string; permissionKey: string; reason: string };

const ROOT_ADMIN_MODULE_ALLOWLIST = new Set([
  'DASHBOARD',
  'MASTERS',
  'ORGANIZATIONS',
  'PLANTS',
  'USERS',
  'ROLE_ACCESS',
  'MODULES',
  'NOTIFICATIONS',
  'LOGS',
  'SECURITY',
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

function permissionActions(auth: AuthContext, moduleKey: string): string[] {
  return [...(auth.permissions[moduleKey] ?? []), ...(auth.permissions['*'] ?? [])].map((item) => normalizeAction(item));
}

function governanceMutationDenied(auth: AuthContext, moduleKey: string, action: string): boolean {
  const roles = normalizedRoles(auth);
  const isRootAdmin = roles.includes('ROOT_ADMIN');
  if (isRootAdmin) return false;

  const isSuperAdmin = roles.includes('SUPERADMIN');
  const isAdmin = roles.includes('ADMIN');

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

    if (isRootAdmin && ROOT_ADMIN_MODULE_ALLOWLIST.has(moduleKey)) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
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
  },
): boolean {
  const roles = normalizedRoles(auth);
  if (roles.some((role) => ['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'MAINTENANCE_MANAGER'].includes(role))) {
    return true;
  }

  const raisedBy = typeof workOrder.raised_by === 'string' ? workOrder.raised_by : null;
  const assignedTo = typeof workOrder.assigned_to === 'string' ? workOrder.assigned_to : null;
  const followUpTeamId = typeof workOrder.follow_up_team_id === 'string' ? workOrder.follow_up_team_id : null;

  return (
    auth.userId === raisedBy ||
    auth.userId === assignedTo ||
    Boolean(followUpTeamId && (auth.teamIds ?? []).includes(followUpTeamId))
  );
}
