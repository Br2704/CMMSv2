import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { authorizePermission } from '../utils/authorization';
import { HttpError, unauthorized } from '../utils/httpError';
import { enforcePlantScope } from '../utils/plantScope';
import { normalizeModuleKey, normalizeRoleName, roleMatchesRequirement, toPermissionKey } from '../utils/rbac';
import { recordSecurityEvent } from '../utils/securityEvents';

type ForbiddenCode = 'ROLE_DENIED' | 'PERMISSION_DENIED' | 'PLANT_SCOPE_DENIED';

function sendForbidden(res: Response, code: ForbiddenCode, message: string, details: Record<string, unknown>) {
  res.status(403).json({
    success: false,
    code,
    message,
    details,
    errors: details,
  });
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

    const decision = authorizePermission(req.auth, moduleId, action);
    if (!decision.allowed) {
      const normalizedRoles = req.auth.roles.map((role) => normalizeRoleName(role));
      logger.warn(
        {
          route: req.originalUrl,
          method: req.method,
          userId: req.auth.userId,
          roleKey: req.auth.roleKey,
          plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
          requiredPermission: decision.permissionKey,
          reason: decision.reason,
        },
        'Permission guard denied request',
      );
      void recordSecurityEvent({
        userId: req.auth.userId,
        organizationId: req.auth.organizationId ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        eventType: 'AUTHZ_PERMISSION_DENIED',
        severity: 'HIGH',
        module: decision.moduleKey,
        action: decision.action,
        path: req.originalUrl,
        message: `Permission guard denied ${decision.permissionKey}`,
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { requiredPermission: decision.permissionKey, reason: decision.reason },
      });
      sendForbidden(res, 'PERMISSION_DENIED', `Missing permission ${decision.permissionKey}`, {
        userId: req.auth.userId,
        role: req.auth.roleKey ?? normalizedRoles[0] ?? null,
        scopeType: req.auth.scopeType ?? null,
        plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
        requiredPermission: decision.permissionKey,
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

    const decisions = requirements.map((requirement) => authorizePermission(req.auth!, requirement.moduleId, requirement.action));
    const allowed = decisions.some((decision) => decision.allowed);
    if (allowed) {
      next();
      return;
    }

    const normalizedRoles = req.auth.roles.map((role) => normalizeRoleName(role));
    const requiredPermissions = decisions.map((decision) => decision.permissionKey);
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
    void recordSecurityEvent({
      userId: req.auth.userId,
      organizationId: req.auth.organizationId ?? null,
      plantId: req.auth.activePlantId ?? req.auth.plantIds[0] ?? null,
      eventType: 'AUTHZ_PERMISSION_DENIED',
      severity: 'HIGH',
      module: 'AUTHORIZATION',
      action: req.method,
      path: req.originalUrl,
      message: `Permission guard denied all alternatives: ${requiredPermissions.join(', ')}`,
      ipAddress: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      metadata: { requiredPermissions },
    });
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
