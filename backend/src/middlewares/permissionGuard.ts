// ============================================================================
// Permission Guard Middleware
// ============================================================================
// Centralized middleware for all API authorization checks. Enterprise-grade
// implementation using the Permission Engine. Replaces the legacy permissions middleware.
//
// Usage:
//   router.get('/assets', requirePermission('ASSETS', 'READ'), handler)
//   router.post('/work-orders', requirePermission('WORK_ORDERS', 'CREATE'), handler)
//   router.patch('/orgs', requireRootAdmin(), handler)
// ============================================================================

import type { NextFunction, Request, Response } from 'express';
import { authorizePermission, canAny } from '../services/permission-engine';
import { resolveCanonicalRoleKey } from '../config/enterprise-roles';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';
import { recordSecurityEvent } from '../utils/securityEvents';
import { enforcePlantScope } from '../utils/plantScope';
import { HttpError } from '../utils/httpError';

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function sendUnauthorized(res: Response) {
  res.status(401).json(fail('Authentication required'));
}

function sendForbidden(
  res: Response,
  code: string,
  message: string,
  details: Record<string, unknown>,
) {
  res.status(403).json({
    success: false,
    code,
    message,
    errors: details,
  });
}

function logAndRecordSecurity(
  req: Request,
  eventType: string,
  severity: 'MEDIUM' | 'HIGH',
  metadata: Record<string, unknown>,
) {
  logger.warn(
    {
      route: req.originalUrl,
      method: req.method,
      userId: req.auth?.userId ?? null,
      eventType,
      ...metadata,
    },
    `Authorization guard: ${eventType}`,
  );

  void recordSecurityEvent({
    userId: req.auth?.userId ?? null,
    organizationId: req.auth?.organizationId ?? null,
    plantId: req.auth?.activePlantId ?? req.auth?.plantIds[0] ?? null,
    eventType,
    severity,
    module: 'AUTHORIZATION',
    action: req.method,
    path: req.originalUrl,
    message: `${eventType} for ${req.method} ${req.originalUrl}`,
    ipAddress: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    metadata,
  });
}

// ============================================================================
// PERMISSION GUARDS
// ============================================================================

/**
 * Require a specific permission on a module.
 * 
 * @example
 * ```typescript
 * router.get('/assets', requirePermission('ASSETS', 'READ'), handler)
 * ```
 */
export function requirePermission(moduleId: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const decision = authorizePermission(req.auth, moduleId, action);

    if (!decision.allowed) {
      logAndRecordSecurity(req, 'AUTHZ_PERMISSION_DENIED', 'HIGH', {
        requiredPermission: decision.permissionKey,
        reason: decision.reason,
        roleKey: req.auth.roleKey,
        roles: req.auth.roles.map((r) => resolveCanonicalRoleKey(r)),
      });

      sendForbidden(res, 'PERMISSION_DENIED', `Missing permission: ${decision.permissionKey}`, {
        userId: req.auth.userId,
        role: req.auth.roleKey,
        scopeType: req.auth.scopeType ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        requiredPermission: decision.permissionKey,
        reason: decision.reason,
      });
      return;
    }

    next();
  };
}

/**
 * Require ANY of the specified permissions (OR logic).
 * 
 * @example
 * ```typescript
 * router.patch('/work-orders/:id', requireAnyPermission([
 *   { moduleId: 'WORK_ORDERS', action: 'UPDATE' },
 *   { moduleId: 'WORK_ORDERS', action: 'APPROVE' },
 * ]), handler)
 * ```
 */
export function requireAnyPermission(
  requirements: Array<{ moduleId: string; action: string }>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const allowed = canAny(req.auth, requirements);

    if (!allowed) {
      const permissionKeys = requirements.map((r) => `${r.moduleId}.${r.action}`);

      logAndRecordSecurity(req, 'AUTHZ_PERMISSION_DENIED', 'HIGH', {
        requiredPermissions: permissionKeys,
        roleKey: req.auth.roleKey,
        roles: req.auth.roles.map((r) => resolveCanonicalRoleKey(r)),
      });

      sendForbidden(res, 'PERMISSION_DENIED',
        `Missing one of required permissions: ${permissionKeys.join(', ')}`,
        {
          userId: req.auth.userId,
          role: req.auth.roleKey,
          requiredPermissions: permissionKeys,
        },
      );
      return;
    }

    next();
  };
}

// ============================================================================
// ROLE-BASED GUARDS
// ============================================================================

/**
 * Require a specific role (by canonical key).
 * 
 * @example
 * ```typescript
 * router.delete('/orgs/:id', requireRole('ROOT_ADMIN'), handler)
 * ```
 */
export function requireRole(roleKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const normalizedRequired = roleKeys.map((r) => resolveCanonicalRoleKey(r));
    const userRoles = [req.auth.roleKey, ...req.auth.roles]
      .filter(Boolean)
      .map((r) => resolveCanonicalRoleKey(r));
    const hasRole = userRoles.some((ur) => normalizedRequired.includes(ur));

    if (!hasRole) {
      console.log('REQUIRE_ROLE_FAILED', {
        userRoles,
        normalizedRequired,
        roleKey: req.auth.roleKey,
        roles: req.auth.roles,
        url: req.originalUrl
      });
      logAndRecordSecurity(req, 'AUTHZ_ROLE_DENIED', 'HIGH', {
        requiredRoles: normalizedRequired,
        userRoles,
      });

      sendForbidden(res, 'ROLE_DENIED', 'Required role is missing', {
        userId: req.auth.userId,
        role: req.auth.roleKey,
        requiredRoles: normalizedRequired,
        userRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Require root admin role specifically.
 */
export function requireRootAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const roleKey = resolveCanonicalRoleKey(req.auth.roleKey ?? '');
    const roles = req.auth.roles.map((r) => resolveCanonicalRoleKey(r));
    const isRoot = roleKey === 'ROOT_ADMIN' || roles.includes('ROOT_ADMIN');

    if (!isRoot) {
      logAndRecordSecurity(req, 'AUTHZ_ROOT_ADMIN_REQUIRED', 'HIGH', {
        reason: 'ROOT_ADMIN_REQUIRED',
      });

      sendForbidden(res, 'ROLE_DENIED', 'Root Admin access required', {
        userId: req.auth.userId,
        role: req.auth.roleKey,
      });
      return;
    }

    next();
  };
}

/**
 * Require admin-level access (ROOT_ADMIN, SUPER_ADMIN, PLANT_ADMIN, ESG_ADMIN, HR_ADMIN).
 */
export function requireAdminLevel() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const adminRoles = new Set([
      'ROOT_ADMIN',
      'SUPER_ADMIN',
      'PLANT_ADMIN',
      'ESG_ADMIN',
      'HR_ADMIN',
    ]);

    const roleKey = resolveCanonicalRoleKey(req.auth.roleKey ?? '');
    const roles = req.auth.roles.map((r) => resolveCanonicalRoleKey(r));
    const isAdmin = adminRoles.has(roleKey) || roles.some((r) => adminRoles.has(r));

    if (!isAdmin) {
      logAndRecordSecurity(req, 'AUTHZ_ADMIN_LEVEL_REQUIRED', 'HIGH', {
        reason: 'ADMIN_LEVEL_REQUIRED',
      });

      sendForbidden(res, 'ROLE_DENIED', 'Admin-level access required', {
        userId: req.auth.userId,
        role: req.auth.roleKey,
      });
      return;
    }

    next();
  };
}

// ============================================================================
// PLANT SCOPE HELPER
// ============================================================================

/**
 * Ensure the authenticated user has access to the given plant.
 * Used inside request handlers, not as middleware.
 */
export function ensurePlantAccess(req: Request, plantId: string | null | undefined): void {
  if (!req.auth) {
    throw new HttpError(401, 'Unauthorized', { code: 'UNAUTHORIZED' });
  }
  try {
    enforcePlantScope(req.auth, plantId);
  } catch {
    throw new HttpError(403, 'Plant access denied', {
      code: 'PLANT_SCOPE_DENIED',
      userId: req.auth.userId,
      role: req.auth.roleKey,
      scopeType: req.auth.scopeType ?? null,
      plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
      requestedPlantId: plantId ?? null,
    });
  }
}

