// ============================================================================
// Role Hierarchy Service
// ============================================================================
// Handles role inheritance, precedence resolution, and ancestor/descendant
// traversal for the enterprise RBAC system.
// ============================================================================

import {
  ENTERPRISE_ROLES,
  INHERITANCE_CHAIN,
  ADMIN_LEVEL_ROLES,
  MANAGER_LEVEL_ROLES,
  SPECIAL_ROLES,
  ORGANIZATION_SCOPED_ROLES,
  PLATFORM_SCOPED_ROLES,
  resolveCanonicalRoleKey,
} from '../config/enterprise-roles';
import type { RoleScope, RoleLevel } from '../config/enterprise-roles';

export interface ResolvedRoleInfo {
  canonicalKey: string;
  originalKey: string;
  precedence: number;
  scope: RoleScope;
  level: RoleLevel;
  isSystem: boolean;
  isSpecial: boolean;
  isAdminLevel: boolean;
  isManagerLevel: boolean;
  isOrganizationScoped: boolean;
  isPlatformScoped: boolean;
}

// ============================================================================
// PRECEDENCE RESOLUTION
// ============================================================================

/** Get the numeric precedence for a role key (higher = more privileged) */
export function getRolePrecedence(roleKey: string): number {
  const canonical = resolveCanonicalRoleKey(roleKey);
  return ENTERPRISE_ROLES[canonical]?.precedence ?? 100;
}

/** Get the primary (highest precedence) role from a list of roles */
export function getPrimaryRole(roles: string[]): string {
  if (roles.length === 0) return 'MAINTENANCE_USER';
  return [...roles]
    .map((r) => resolveCanonicalRoleKey(r))
    .sort((a, b) => getRolePrecedence(b) - getRolePrecedence(a))[0];
}

/** Sort roles by precedence (highest first) */
export function sortRolesByPrecedence(roles: string[]): string[] {
  return [...roles]
    .map((r) => resolveCanonicalRoleKey(r))
    .sort((a, b) => getRolePrecedence(b) - getRolePrecedence(a));
}

// ============================================================================
// ROLE INFO RESOLUTION
// ============================================================================

/** Resolve complete role info for a role key */
export function resolveRoleInfo(roleKey: string): ResolvedRoleInfo {
  const canonicalKey = resolveCanonicalRoleKey(roleKey);
  const definition = ENTERPRISE_ROLES[canonicalKey];

  return {
    canonicalKey,
    originalKey: roleKey,
    precedence: definition?.precedence ?? 100,
    scope: definition?.scope ?? 'PLANT',
    level: definition?.level ?? 'USER',
    isSystem: definition?.isSystem ?? false,
    isSpecial: definition?.isSpecial ?? false,
    isAdminLevel: ADMIN_LEVEL_ROLES.has(canonicalKey),
    isManagerLevel: MANAGER_LEVEL_ROLES.has(canonicalKey),
    isOrganizationScoped: ORGANIZATION_SCOPED_ROLES.has(canonicalKey),
    isPlatformScoped: PLATFORM_SCOPED_ROLES.has(canonicalKey),
  };
}

/** Check if any role in the list meets admin-level or above */
export function isAdminLevelUser(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => ADMIN_LEVEL_ROLES.has(canonical));
}

/** Check if any role in the list meets manager-level or above */
export function isManagerLevelUser(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => MANAGER_LEVEL_ROLES.has(canonical));
}

/** Check if any role in the list is a special isolated role */
export function isSpecialRoleUser(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => SPECIAL_ROLES.has(canonical));
}

// ============================================================================
// INHERITANCE TRAVERSAL
// ============================================================================

/**
 * Walk the inheritance chain upward (from leaf → root).
 * Returns all ancestor role keys including the starting role.
 * E.g., MAINTENANCE_USER → [MAINTENANCE_USER, MAINTENANCE_MANAGER, PLANT_ADMIN]
 */
export function walkInheritanceUp(roleKey: string): string[] {
  const canonical = resolveCanonicalRoleKey(roleKey);
  const chain: string[] = [canonical];
  const parents = INHERITANCE_CHAIN[canonical];
  if (parents) {
    for (const parent of parents) {
      chain.push(...walkInheritanceUp(parent));
    }
  }
  return Array.from(new Set(chain));
}

/**
 * Walk the inheritance chain downward (from root → leaves).
 * Returns all descendant role keys including the starting role.
 */
export function walkInheritanceDown(roleKey: string): string[] {
  const canonical = resolveCanonicalRoleKey(roleKey);
  const chain: string[] = [canonical];
  for (const [child, parents] of Object.entries(INHERITANCE_CHAIN)) {
    if (parents.includes(canonical)) {
      chain.push(...walkInheritanceDown(child));
    }
  }
  return Array.from(new Set(chain));
}

/**
 * Get the effective precedence for a set of roles.
 * Returns the highest precedence role in the set.
 */
export function getEffectivePrecedence(roles: string[]): number {
  return Math.max(...roles.map((r) => getRolePrecedence(r)), 0);
}

/**
 * Build the complete inheritance chain for a set of roles.
 * Returns all unique roles including inherited ones.
 */
export function buildFullInheritanceChain(roles: string[]): string[] {
  const chains = roles.flatMap((role) => {
    const canonical = resolveCanonicalRoleKey(role);
    return walkInheritanceUp(canonical);
  });
  return Array.from(new Set(chains));
}
