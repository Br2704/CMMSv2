// ============================================================================
// IDLE TIMEOUT MIDDLEWARE
// ============================================================================
// Enforces idle session timeout for authenticated users. If a user's session
// has been idle longer than the configured threshold, they are forced to
// re-authenticate. This prevents session hijacking via prolonged inactivity.
//
// Uses a Redis-backed store for distributed production use.
// Falls back to in-memory store if Redis is unavailable.
//
// Configuration via env:
//   AUTH_SESSION_MAX_HOURS   — max session duration (default: 12)
//   AUTH_IDLE_TIMEOUT_MINUTES — idle timeout (default: 30, 0 = disabled)
// ============================================================================

import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';
import { recordSecurityEvent } from '../utils/securityEvents';
import { getRedis, isRedisConnected, redisKey } from '../services/redis';

// ============================================================================
// CONFIGURATION
// ============================================================================

const IDLE_TIMEOUT_MS = (env as any).AUTH_IDLE_TIMEOUT_MINUTES
  ? Number((env as any).AUTH_IDLE_TIMEOUT_MINUTES) * 60 * 1000
  : 30 * 60 * 1000; // default 30 minutes

const IDLE_TIMEOUT_TTL_SEC = Math.ceil(IDLE_TIMEOUT_MS / 1000) + 60; // window + 60s buffer

// ============================================================================
// IN-MEMORY FALLBACK STORE
// ============================================================================
// Used when Redis is unavailable. Mirrors the Redis key structure
// but stored locally. Reset on server restart.
// ============================================================================

const lastActivityInMemory = new Map<string, number>();

// Periodic cleanup of stale entries from in-memory store
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  const now = Date.now();
  const cutoff = now - Math.max(IDLE_TIMEOUT_MS, 60 * 60 * 1000);
  for (const [userId, timestamp] of lastActivityInMemory.entries()) {
    if (timestamp < cutoff) {
      lastActivityInMemory.delete(userId);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

/**
 * Update last activity timestamp for the authenticated user.
 * Attempts Redis first; falls back to in-memory.
 */
export function touchActivity(req: Request): void {
  if (!req.auth?.userId) return;

  const userId = req.auth.userId;

  if (isRedisConnected()) {
    const redis = getRedis();
    if (redis) {
      // Fire-and-forget — non-blocking
      void redis.set(redisKey('activity', userId), String(Date.now()), 'EX', IDLE_TIMEOUT_TTL_SEC).catch((err) => {
        logger.error({ err, userId }, 'Redis touchActivity error — falling back to in-memory');
        lastActivityInMemory.set(userId, Date.now());
      });
      return;
    }
  }

  lastActivityInMemory.set(userId, Date.now());
}

/**
 * Get the last activity timestamp for a user.
 * Prefers Redis; falls back to in-memory.
 */
async function getLastActivity(userId: string): Promise<number | null> {
  if (isRedisConnected()) {
    const redis = getRedis();
    if (redis) {
      try {
        const val = await redis.get(redisKey('activity', userId));
        if (val !== null) {
          return Number(val);
        }
        return null;
      } catch (err) {
        logger.error({ err, userId }, 'Redis getLastActivity error — falling back to in-memory');
      }
    }
  }

  return lastActivityInMemory.get(userId) ?? null;
}

/**
 * Clear idle tracking for a specific user (e.g., on logout).
 */
export function clearIdleTracking(userId?: string | null): void {
  if (!userId) return;

  lastActivityInMemory.delete(userId);

  if (isRedisConnected()) {
    const redis = getRedis();
    if (redis) {
      void redis.del(redisKey('activity', userId)).catch((err) => {
        logger.error({ err, userId }, 'Redis clearIdleTracking error');
      });
    }
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware that enforces idle timeout.
 * Should be applied after requireAuth on routes that need idle timeout enforcement.
 *
 * The /auth/refresh endpoint is exempt to allow token refresh without
 * forcing re-authentication.
 */
export function enforceIdleTimeout(req: Request, res: Response, next: NextFunction) {
  // Skip idle check for auth refresh and public endpoints
  const skipPaths = ['/auth/refresh', '/auth/logout', '/health', '/ready'];
  if (skipPaths.some((p) => req.path.includes(p))) {
    next();
    return;
  }

  if (!req.auth?.userId) {
    next();
    return;
  }

  // Skip if idle timeout is disabled
  if (IDLE_TIMEOUT_MS <= 0) {
    touchActivity(req);
    next();
    return;
  }

  const userId = req.auth.userId;

  // Execute async check, but respond synchronously
  void (async () => {
    try {
      const now = Date.now();
      const lastActive = (await getLastActivity(userId)) ?? now;

      if (now - lastActive > IDLE_TIMEOUT_MS) {
        logger.warn(
          {
            userId,
            idleMs: now - lastActive,
            timeoutMs: IDLE_TIMEOUT_MS,
            route: req.originalUrl,
          },
          'Session idle timeout exceeded',
        );

        void recordSecurityEvent({
          userId,
          organizationId: req.auth?.organizationId ?? null,
          eventType: 'AUTH_IDLE_TIMEOUT',
          severity: 'MEDIUM',
          module: 'AUTH',
          action: req.method,
          path: req.originalUrl,
          message: 'Session terminated due to idle timeout',
          ipAddress: req.ip,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        });

        res.status(401).json(
          fail('Session expired due to inactivity. Please sign in again.', {
            code: 'SESSION_IDLE_TIMEOUT',
            reason: 'idle_timeout',
          }),
        );
        return;
      }

      // Update last activity timestamp on every request
      touchActivity(req);
      next();
    } catch (err) {
      logger.error({ err, userId }, 'Idle timeout check error — allowing request');
      touchActivity(req);
      next();
    }
  })();
}
