import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { HttpError, unauthorized } from '../utils/httpError';
import { enforcePlantScope } from '../utils/plantScope';
import { normalizeModuleKey, normalizeRoleName, roleMatchesRequirement, toPermissionKey } from '../utils/rbac';
import { recordSecurityEvent } from '../utils/securityEvents';
import type { AuthContext } from '../types/auth';

type ForbiddenCode = 'ROLE_DENIED' | 'PERMISSION_DENIED' | 'PLANT_SCOPE_DENIED';
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
]);

function sendForbidden(res: Response, code: ForbiddenCode, message: string, details: Record<string, unknown>) {
  res.status(403).json({
    success: false,
    code,
    message,
    details,
    errors: details,
  });
}

function authHasPermission(auth: AuthContext, moduleId: string, action: string) {
  const normalizedRoles = auth.roles.map((role) => normalizeRoleName(role));
  const isRootAdmin = normalizedRoles.some((role) => role === 'ROOT_ADMIN');
  const requestedAction = action.toUpperCase();
  const requestedModule = normalizeModuleKey(moduleId);

  if (isRootAdmin && ROOT_ADMIN_MODULE_ALLOWLIST.has(requestedModule)) {
    return true;
  }

  const actions = auth.permissions[requestedModule] ?? auth.permissions[normalizeModuleKey(moduleId)] ?? [];
  const normalizedActions = actions.map((item) => item.toUpperCase());
  return normalizedActions.includes(requestedAction) || normalizedActions.includes('*');
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
      return;
    }

    const normalizedRoles = req.auth.roles.map((role) => normalizeRoleName(role));
    const normalizedRoleKey = normalizeRoleName(req.auth.roleKey ?? '');
    const allowed = roles.map((role) => normalizeRoleName(role));
    const hasRoleMatch =
      normalizedRoles.some((role) => allowed.some((allowedRole) => roleMatchesRequirement(role, allowedRole))) ||
      (normalizedRoleKey && allowed.some((allowedRole) => roleMatchesRequirement(normalizedRoleKey, allowedRole)));
    if (!hasRoleMatch) {
      logger.warn(
        {
          route: req.originalUrl,
          method: req.method,
          userId: req.auth.userId,
          roleKey: normalizedRoleKey || null,
          roles: normalizedRoles,
          requiredRoles: allowed,
        },
        'Role guard denied request',
      );
      void recordSecurityEvent({
        userId: req.auth.userId,
        organizationId: req.auth.organizationId ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        eventType: 'AUTHZ_ROLE_DENIED',
        severity: 'HIGH',
        module: 'AUTHORIZATION',
        action: req.method,
        path: req.originalUrl,
        message: `Role guard denied ${req.method} ${req.originalUrl}`,
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { requiredRoles: allowed, roles: normalizedRoles },
      });
      sendForbidden(res, 'ROLE_DENIED', 'Required role is missing', {
        userId: req.auth.userId,
        role: normalizedRoleKey || normalizedRoles[0] || null,
        scopeType: req.auth.scopeType ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        requiredRoles: allowed,
      });
      return;
    }

    next();
  };
}

export function requirePermission(moduleId: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
      return;
    }

    const normalizedRoles = req.auth.roles.map((role) => normalizeRoleName(role));
    const isSuperAdmin = normalizedRoles.some((role) => role === 'SUPERADMIN');
    const isAdmin = normalizedRoles.some((role) => role === 'ADMIN');
    const isRootAdmin = normalizedRoles.some((role) => role === 'ROOT_ADMIN');

    const requestedAction = action.toUpperCase();
    const requestedModule = normalizeModuleKey(moduleId);
    const requiredPermission = toPermissionKey(moduleId, action);

    if (!isRootAdmin) {
      const organizationMutationDenied = requestedModule === 'ORGANIZATIONS' && requestedAction !== 'READ';
      const roleAccessDenied = requestedModule === 'ROLE_ACCESS' && !(isSuperAdmin || isAdmin);
      const plantMutationDenied =
        requestedModule === 'PLANTS' &&
        requestedAction !== 'READ' &&
        !(requestedAction === 'UPDATE' && (isSuperAdmin || isAdmin));

      if (organizationMutationDenied || roleAccessDenied || plantMutationDenied) {
        logger.warn(
          {
            route: req.originalUrl,
            method: req.method,
            userId: req.auth.userId,
            roleKey: req.auth.roleKey,
            plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
            requiredPermission,
          },
          'Permission guard denied governance mutation',
        );
        sendForbidden(res, 'PERMISSION_DENIED', `Missing permission ${requiredPermission}`, {
          userId: req.auth.userId,
          role: req.auth.roleKey ?? normalizedRoles[0] ?? null,
          scopeType: req.auth.scopeType ?? null,
          plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
          requiredPermission,
        });
        return;
      }
    }

    if (!authHasPermission(req.auth, moduleId, action)) {
      logger.warn(
        {
          route: req.originalUrl,
          method: req.method,
          userId: req.auth.userId,
          roleKey: req.auth.roleKey,
          plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
          requiredPermission,
        },
        'Permission guard denied request',
      );
      void recordSecurityEvent({
        userId: req.auth.userId,
        organizationId: req.auth.organizationId ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        eventType: 'AUTHZ_PERMISSION_DENIED',
        severity: 'HIGH',
        module: requestedModule,
        action: requestedAction,
        path: req.originalUrl,
        message: `Permission guard denied ${requiredPermission}`,
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { requiredPermission },
      });
      sendForbidden(res, 'PERMISSION_DENIED', `Missing permission ${requiredPermission}`, {
        userId: req.auth.userId,
        role: req.auth.roleKey ?? normalizedRoles[0] ?? null,
        scopeType: req.auth.scopeType ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        requiredPermission,
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(requirements: Array<{ moduleId: string; action: string }>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
      return;
    }

    const allowed = requirements.some((requirement) => authHasPermission(req.auth!, requirement.moduleId, requirement.action));
    if (allowed) {
      next();
      return;
    }

    const normalizedRoles = req.auth.roles.map((role) => normalizeRoleName(role));
    const requiredPermissions = requirements.map((requirement) => toPermissionKey(requirement.moduleId, requirement.action));
    logger.warn(
      {
        route: req.originalUrl,
        method: req.method,
        userId: req.auth.userId,
        roleKey: req.auth.roleKey,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        requiredPermissions,
      },
      'Permission guard denied request',
    );
    sendForbidden(res, 'PERMISSION_DENIED', `Missing one of required permissions: ${requiredPermissions.join(', ')}`, {
      userId: req.auth.userId,
      role: req.auth.roleKey ?? normalizedRoles[0] ?? null,
      scopeType: req.auth.scopeType ?? null,
      plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
      requiredPermissions,
    });
  };
}

export function ensurePlantAccess(req: Request, plantId: string | null | undefined) {
  if (!req.auth) {
    unauthorized();
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
