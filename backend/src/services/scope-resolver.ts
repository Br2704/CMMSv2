// ============================================================================
// Scope Resolver Service
// ============================================================================
// Handles scope resolution for enterprise RBAC — determines which data a user
// can access based on their role's scope type and organizational context.
//
// Scope Hierarchy:
//   PLATFORM   → Root Admin (all plants, all organizations)
//   ORGANIZATION → Super Admin, ESG Admin, HR Admin (all plants in org)
//   PLANT      → Plant Admin, Managers, Users (single plant)
//   ASSIGNED   → Vendor (assigned AMC work orders only)
// ============================================================================

import type { AuthContext } from '../types/auth';
import { resolveCanonicalRoleKey, ENTERPRISE_ROLES } from '../config/enterprise-roles';
import { getRolePrecedence, getPrimaryRole } from './role-hierarchy';
import type { RoleScope } from '../config/enterprise-roles';

// ============================================================================
// SCOPE TYPE RESOLUTION
// ============================================================================

/** Resolve the scope type from a role key */
export function resolveScopeType(roleKey: string): RoleScope {
  const canonical = resolveCanonicalRoleKey(roleKey);
  const definition = ENTERPRISE_ROLES[canonical];
  return definition?.scope ?? 'PLANT';
}

/** Get the effective role key for scope resolution */
export function getEffectiveScopeRole(auth: Pick<AuthContext, 'roleKey' | 'roles'>): string {
  if (auth.roleKey && auth.roleKey.trim()) {
    const canonical = resolveCanonicalRoleKey(auth.roleKey);
    if (ENTERPRISE_ROLES[canonical]) return canonical;
  }
  return getPrimaryRole(auth.roles);
}

// ============================================================================
// PLANT ACCESS SCOPE
// ============================================================================

export interface PlantScopeResult {
  accessiblePlantIds: string[];
  isGlobalAccess: boolean;
  activePlantId: string | null;
}

/**
 * Resolve which plants a user can access based on their role scope.
 * 
 * - PLATFORM scope (ROOT_ADMIN): Access to any plant, use requestedPlantId if provided
 * - ORGANIZATION scope (SUPER_ADMIN, ESG_ADMIN, HR_ADMIN): All plants in their org
 * - PLANT scope (PLANT_ADMIN, Managers, Users): Single assigned plant
 * - ASSIGNED scope (VENDOR): No direct plant access (uses AMC assignments)
 */
export function resolvePlantScope(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'plantIds' | 'scopeType' | 'organizationId'>,
  requestedPlantId?: string | null,
): PlantScopeResult {
  const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveScopeRole(auth));

  switch (scopeType) {
    case 'PLATFORM': {
      // Root Admin — can access any plant
      if (requestedPlantId) {
        return {
          accessiblePlantIds: [requestedPlantId],
          isGlobalAccess: true,
          activePlantId: requestedPlantId,
        };
      }
      // If they have plantIds, use those; otherwise return empty (they need to specify)
      if (auth.plantIds.length > 0) {
        return {
          accessiblePlantIds: auth.plantIds,
          isGlobalAccess: true,
          activePlantId: auth.plantIds[0],
        };
      }
      return {
        accessiblePlantIds: [],
        isGlobalAccess: true,
        activePlantId: null,
      };
    }

    case 'ORGANIZATION': {
      // Super Admin / ESG Admin / HR Admin — access all plants in their org
      if (requestedPlantId) {
        if (auth.plantIds.includes(requestedPlantId)) {
          return {
            accessiblePlantIds: [requestedPlantId],
            isGlobalAccess: true,
            activePlantId: requestedPlantId,
          };
        }
        return {
          accessiblePlantIds: [],
          isGlobalAccess: true,
          activePlantId: null,
        };
      }
      return {
        accessiblePlantIds: auth.plantIds,
        isGlobalAccess: true,
        activePlantId: auth.plantIds[0] ?? null,
      };
    }

    case 'PLANT': {
      // Plant-scoped — single plant access
      const actorPlantId = auth.plantIds[0] ?? null;
      if (!actorPlantId) {
        return {
          accessiblePlantIds: [],
          isGlobalAccess: false,
          activePlantId: null,
        };
      }
      if (requestedPlantId && requestedPlantId !== actorPlantId) {
        // Requested plant doesn't match the user's assigned plant
        return {
          accessiblePlantIds: [],
          isGlobalAccess: false,
          activePlantId: null,
        };
      }
      return {
        accessiblePlantIds: [actorPlantId],
        isGlobalAccess: false,
        activePlantId: actorPlantId,
      };
    }

    case 'ASSIGNED': {
      // Vendor / Special scoped — no direct plant access
      return {
        accessiblePlantIds: auth.plantIds,
        isGlobalAccess: false,
        activePlantId: auth.plantIds[0] ?? null,
      };
    }

    default:
      return {
        accessiblePlantIds: auth.plantIds,
        isGlobalAccess: false,
        activePlantId: auth.plantIds[0] ?? null,
      };
  }
}

/**
 * Check if a user has access to a specific plant.
 */
export function hasPlantAccess(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'plantIds' | 'scopeType'>,
  plantId: string | null | undefined,
): boolean {
  if (!plantId) {
    // No plant restriction — accessible if not plant-scoped
    const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveScopeRole(auth));
    return scopeType === 'PLATFORM' || scopeType === 'ORGANIZATION';
  }

  const { accessiblePlantIds } = resolvePlantScope(auth, plantId);
  return accessiblePlantIds.length > 0;
}

/**
 * Enforce plant scope access — throws if the user doesn't have access.
 */
export function enforcePlantScope(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'plantIds' | 'scopeType'>,
  plantId: string | null | undefined,
): void {
  if (!hasPlantAccess(auth, plantId)) {
    throw Object.assign(new Error('Plant scope violation'), { statusCode: 403, code: 'PLANT_SCOPE_DENIED' });
  }
}

// ============================================================================
// ORGANIZATION SCOPE
// ============================================================================

/**
 * Check if a user belongs to a specific organization.
 */
export function hasOrganizationAccess(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'organizationId' | 'scopeType'>,
  organizationId: string | null | undefined,
): boolean {
  if (!organizationId) return true; // No org filter needed
  const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveScopeRole(auth));
  // Platform-scoped users (ROOT_ADMIN) can access any org
  if (scopeType === 'PLATFORM') return true;
  // Organization-scoped users must match their org
  return auth.organizationId === organizationId;
}

// ============================================================================
// VENDOR / ASSIGNED SCOPE
// ============================================================================

/**
 * Check if a user is a vendor role.
 */
export function isVendorRole(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => canonical === 'VENDOR');
}

/**
 * Check if a user is a security role.
 */
export function isSecurityRole(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => canonical === 'SECURITY');
}

/**
 * Check if a user is a visitor role.
 */
export function isVisitorRole(roles: string[]): boolean {
  return roles
    .map((r) => resolveCanonicalRoleKey(r))
    .some((canonical) => canonical === 'VISITOR');
}

/**
 * Check if a user is a special isolated role (VENDOR, SECURITY, VISITOR).
 */
export function isSpecialRole(roles: string[]): boolean {
  return isVendorRole(roles) || isSecurityRole(roles) || isVisitorRole(roles);
}
