// ============================================================================
// RBAC Utilities — Backward-Compatible Exports
// ============================================================================
// This file provides normalization utilities and re-exports from the new
// enterprise RBAC modules for backward compatibility.
//
// NEW CODE SHOULD IMPORT DIRECTLY FROM:
//   - ../config/enterprise-roles  (role definitions, hierarchy)
//   - ../config/permission-modules (module keys, actions, page mappings)
//   - ../services/role-hierarchy   (role inheritance & precedence)
//   - ../services/scope-resolver   (scope resolution)
//   - ../services/permission-engine (permission evaluation)
//   - ../middlewares/permissionGuard (middleware guards)
// ============================================================================

import { resolveCanonicalRoleKey } from '../config/enterprise-roles';
import { RBAC_ACTIONS as ENTERPRISE_ACTIONS, RBAC_MODULE_KEYS as ENTERPRISE_MODULE_KEYS, MODULE_ALIASES as ENTERPRISE_MODULE_ALIASES, normalizeModuleKey as normalizeEnterpriseModuleKey } from '../config/permission-modules';
import { resolveScopeType as resolveEnterpriseScopeType } from '../services/scope-resolver';

// ============================================================================
// Normalization Utilities (keep for backward compatibility)
// ============================================================================

export const RBAC_ACTIONS = [...ENTERPRISE_ACTIONS] as readonly string[];
export const RBAC_MODULE_KEYS = [...ENTERPRISE_MODULE_KEYS] as readonly string[];

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

/** @deprecated Use resolveCanonicalRoleKey from enterprise-roles instead */
export const ROLE_ALIASES: Record<string, string> = {};

/** @deprecated Use MODULE_ALIASES from permission-modules instead */
const MODULE_ALIASES: Record<string, string> = {};

const ADMIN_LIKE_ROLES = new Set(['SUPER_ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER']);

/** @deprecated Use resolveCanonicalRoleKey from enterprise-roles instead */
export function normalizeRoleName(name: string): string {
  return resolveCanonicalRoleKey(name);
}

/** Normalize module key to canonical form */
export function normalizeModuleKey(moduleKey: string): string {
  return normalizeEnterpriseModuleKey(moduleKey);
}

/** Normalize action to canonical form */
export function normalizeAction(action: string): string {
  const input = action.trim().toUpperCase();
  if (input === 'VIEW') return 'READ';
  if (input === 'ADD') return 'CREATE';
  if (input === 'EDIT') return 'UPDATE';
  if (input === 'REMOVE') return 'DELETE';
  return input;
}

/** Normalize an array of actions */
export function normalizeActions(actions: string[]): string[] {
  return Array.from(new Set(actions.map((action) => normalizeAction(action)).filter(Boolean)));
}

/** @deprecated Use role hierarchy service instead */
export function isSuperAdminRole(roleName: string): boolean {
  const normalized = resolveCanonicalRoleKey(roleName);
  return normalized === 'SUPER_ADMIN';
}

/** @deprecated Use role hierarchy service instead */
export function isRootAdminRole(roleName: string): boolean {
  const normalized = resolveCanonicalRoleKey(roleName);
  return normalized === 'ROOT_ADMIN';
}

/** @deprecated Use role hierarchy service instead */
export function isAdminRole(roleName: string): boolean {
  const normalized = resolveCanonicalRoleKey(roleName);
  return ADMIN_LIKE_ROLES.has(normalized);
}

/** @deprecated Use permission engine's authorizePermission instead */
export function roleMatchesRequirement(roleName: string, requiredRole: string): boolean {
  const normalizedRole = resolveCanonicalRoleKey(roleName);
  const normalizedRequiredRole = resolveCanonicalRoleKey(requiredRole);

  if (normalizedRole === normalizedRequiredRole) {
    return true;
  }

  if (normalizedRequiredRole === 'PLANT_ADMIN') {
    return isAdminRole(normalizedRole);
  }

  return false;
}

/** Build a permission key string from module key and action */
export function toPermissionKey(moduleKey: string, action: string): string {
  const normalizedModule = normalizeModuleKey(moduleKey).toLowerCase();
  const normalizedAction = normalizeAction(action).toLowerCase();
  return `${normalizedModule}.${normalizedAction}`;
}

/** Convert a permission map to a sorted array of permission key strings */
export function permissionKeysFromMap(permissionMap: Record<string, string[]>): string[] {
  const keys = new Set<string>();
  for (const [moduleKey, actions] of Object.entries(permissionMap)) {
    for (const action of actions) {
      keys.add(toPermissionKey(moduleKey, action));
    }
  }
  return Array.from(keys).sort();
}

/** @deprecated Use resolveScopeType from scope-resolver instead */
export function resolveScopeType(roleKey: string): ScopeType {
  const enterpriseScope = resolveEnterpriseScopeType(roleKey);
  if (enterpriseScope === 'PLATFORM') return 'ROOT_ADMIN';
  if (enterpriseScope === 'ORGANIZATION') return 'ORGANIZATION';
  return 'PLANT';
}
