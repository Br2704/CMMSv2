import type { Request, Response } from 'express';
import { logger } from '../config/logger';
import { normalizeRoleName } from '../utils/rbac';
import { fail } from '../utils/apiResponse';

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;

const ROLE_RATE_LIMITS: Record<string, number> = {
  ROOT_ADMIN: 10000,
  SUPERADMIN: 10000,
  ADMIN: 5000,
  DEFAULT: 2500,
};

const buckets = new Map<string, Bucket>();

function getRoleLimit(roleKey: string) {
  return ROLE_RATE_LIMITS[roleKey] ?? ROLE_RATE_LIMITS.DEFAULT;
}

function getBucketKey(req: Request, roleKey: string) {
  const actorId = req.auth?.userId ?? req.ip;
  const windowSegment = Math.floor(Date.now() / WINDOW_MS);
  return `${roleKey}:${actorId}:${windowSegment}`;
}

function roleForRequest(req: Request) {
  const authRole = req.auth?.roleKey ?? req.auth?.roles?.[0] ?? 'DEFAULT';
  return normalizeRoleName(authRole);
}

export function enforceRoleRateLimit(req: Request, res: Response): boolean {
  const roleKey = roleForRequest(req);

  const now = Date.now();
  const key = getBucketKey(req, roleKey);
  const limit = getRoleLimit(roleKey);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    logger.warn(
      {
        route: req.originalUrl,
        method: req.method,
        userId: req.auth?.userId ?? null,
        roleKey,
        limit,
      },
      'Role-based rate limit exceeded',
    );
    res.status(429).json(fail('Rate limit exceeded for your role'));
    return false;
  }

  current.count += 1;
  buckets.set(key, current);
  return true;
}
