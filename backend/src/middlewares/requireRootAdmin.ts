import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';
import { normalizeRoleName } from '../utils/rbac';

export function requireRootAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json(fail('Unauthorized'));
    return;
  }

  const normalizedRoles = (req.auth.roles ?? []).map((role) => normalizeRoleName(role));
  const normalizedRoleKey = normalizeRoleName(req.auth.roleKey ?? '');
  const isRootAdmin = normalizedRoleKey === 'ROOT_ADMIN' || normalizedRoles.includes('ROOT_ADMIN');

  if (!isRootAdmin) {
    if (env.NODE_ENV !== 'production') {
      logger.warn(
        {
          route: req.originalUrl,
          method: req.method,
          roleKey: normalizedRoleKey || null,
          roles: normalizedRoles,
          reason: 'ROOT_ADMIN_REQUIRED',
        },
        'Authorization denied for governance route',
      );
    }
    res.status(403).json(fail('Forbidden'));
    return;
  }

  next();
}

