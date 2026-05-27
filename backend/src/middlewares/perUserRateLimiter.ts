// ============================================================================
// PER-USER RATE LIMITER MIDDLEWARE
// ============================================================================
// Enterprise-grade per-user rate limiting that layers on top of IP-based
// rate limiting. This prevents abuse from authenticated users who might
// bypass IP-based limits through shared IPs (NAT, VPN, etc.).
//
// Uses a Redis-backed sliding window for distributed production use.
// Falls back to in-memory store if Redis is unavailable.
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

interface UserRateLimitConfig {
  /** Window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  limit: number;
  /** Description for logging */
  description: string;
  /** Key suffix for Redis */
  keySuffix: string;
}

const USER_API_LIMIT: UserRateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 6000,
  description: 'General API requests per user per minute',
  keySuffix: 'api',
};

const USER_MUTATION_LIMIT: UserRateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 600,
  description: 'Mutation requests per user per minute',
  keySuffix: 'mutate',
};

const USER_AUTH_LIMIT: UserRateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 30,
  description: 'Auth-related requests per user per minute',
  keySuffix: 'auth',
};

// Block escalation: 10x limit within window → 1h persistent block
const BLOCK_THRESHOLD_MULTIPLIER = 10;
const BLOCK_DURATION_SEC = 3600; // 1 hour
const WINDOW_SAFETY_SEC = 120; // extra TTL for sorted set keys beyond the window

// ============================================================================
// LUA SCRIPT FOR ATOMIC SLIDING WINDOW
// ============================================================================

const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local blockKey = KEYS[2]
  local now = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local blockThreshold = tonumber(ARGV[4])
  local blockDuration = tonumber(ARGV[5])
  local limitWindowTtl = tonumber(ARGV[6])

  -- Check if blocked
  local blocked = redis.call('GET', blockKey)
  if blocked then
    return { 1, -1 }
  end

  -- Remove timestamps outside the window
  local cutoff = now - windowMs
  redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)

  -- Count requests in window
  local count = redis.call('ZCARD', key)

  -- Check limit
  if count >= limit then
    -- If over limit by 10x, escalate to persistent block
    if count >= blockThreshold then
      redis.call('SETEX', blockKey, blockDuration, '1')
      -- Clean up the sliding window key
      redis.call('DEL', key)
      return { 1, -1 }
    end
    return { 1, count }
  end

  -- Add current request timestamp (use counter appended to timestamp for uniqueness)
  local reqId = redis.call('INCR', key .. ':counter')
  redis.call('ZADD', key, now, now .. ':' .. reqId)
  redis.call('EXPIRE', key, limitWindowTtl)
  redis.call('EXPIRE', key .. ':counter', limitWindowTtl)

  return { 0, count }
`;

// ============================================================================
// REDIS-BACKED SLIDING WINDOW STORE
// ============================================================================

async function isRateLimitedRedis(key: string, config: UserRateLimitConfig): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    // Redis not available — fall back to in-memory
    return isRateLimitedInMemory(key, config);
  }

  try {
    const redisKey_ = redisKey('ratelimit', config.keySuffix, key);
    const blockKey = redisKey('ratelimit', 'blocked', key);
    const now = Date.now();
    const limitWindowTtlSec = Math.ceil((config.windowMs + WINDOW_SAFETY_SEC * 1000) / 1000);

    const result = (await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      2,
      redisKey_,
      blockKey,
      String(now),
      String(config.windowMs),
      String(config.limit),
      String(config.limit * BLOCK_THRESHOLD_MULTIPLIER),
      String(BLOCK_DURATION_SEC),
      String(limitWindowTtlSec),
    )) as [number, number];

    const [isLimited, _count] = result;
    return isLimited === 1;
  } catch (err) {
    logger.error({ err, key, limiter: config.keySuffix }, 'Redis rate limiter error — falling back to in-memory');
    return isRateLimitedInMemory(key, config);
  }
}

async function resetRateLimitRedis(userKey: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const apiKey = redisKey('ratelimit', 'api', userKey);
    const mutateKey = redisKey('ratelimit', 'mutate', userKey);
    const authKey = redisKey('ratelimit', 'auth', userKey);
    const blockKey = redisKey('ratelimit', 'blocked', userKey);

    const multi = redis.multi();
    multi.del(apiKey, mutateKey, authKey, blockKey);
    await multi.exec();
  } catch (err) {
    logger.error({ err, key: userKey }, 'Redis rate limit reset error');
  }
}

// ============================================================================
// IN-MEMORY FALLBACK STORE
// ============================================================================

interface SlidingWindowEntry {
  timestamps: number[];
  blockedUntil: number;
}

const inMemoryWindows = new Map<string, SlidingWindowEntry>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryWindows.entries()) {
    if (entry.timestamps.length === 0 && entry.blockedUntil < now) {
      inMemoryWindows.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref();

function isRateLimitedInMemory(key: string, config: UserRateLimitConfig): boolean {
  const now = Date.now();
  const fullKey = `${config.keySuffix}:${key}`;
  let entry = inMemoryWindows.get(fullKey);

  if (!entry) {
    entry = { timestamps: [], blockedUntil: 0 };
    inMemoryWindows.set(fullKey, entry);
  }

  // Check if currently blocked
  if (entry.blockedUntil > now) {
    return true;
  }

  // Remove timestamps outside the window
  const cutoff = now - config.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  // Check limit
  if (entry.timestamps.length >= config.limit) {
    if (entry.timestamps.length >= config.limit * BLOCK_THRESHOLD_MULTIPLIER) {
      entry.blockedUntil = now + BLOCK_DURATION_SEC * 1000;
      logger.warn({ key, timestampCount: entry.timestamps.length }, 'User rate limit exceeded 10x — persistent 1h block applied');
    }
    return true;
  }

  entry.timestamps.push(now);
  return false;
}

// ============================================================================
// KEY GENERATION
// ============================================================================

function getUserRateLimitKey(req: Request): string {
  return `user:${req.auth?.userId ?? 'anonymous'}:${req.ip ?? 'unknown'}`;
}

// ============================================================================
// MIDDLEWARE FACTORIES
// ============================================================================

function createUserRateLimiter(config: UserRateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip per-user rate limiting when DISABLE_RATE_LIMIT=true or during E2E tests
    if (env.DISABLE_RATE_LIMIT === true) {
      next();
      return;
    }

    const key = getUserRateLimitKey(req);

    const checkLimit = async (): Promise<boolean> => {
      if (isRedisConnected()) {
        return isRateLimitedRedis(key, config);
      }
      return isRateLimitedInMemory(key, config);
    };

    // Use void to run async, but catch errors gracefully
    void checkLimit().then((isLimited) => {
      if (isLimited) {
        logger.warn(
          {
            userId: req.auth?.userId ?? null,
            key,
            limit: config.limit,
            windowMs: config.windowMs,
            route: req.originalUrl,
            description: config.description,
          },
          'Per-user rate limit exceeded',
        );

        void recordSecurityEvent({
          userId: req.auth?.userId ?? null,
          organizationId: req.auth?.organizationId ?? null,
          plantId: req.auth?.activePlantId ?? null,
          eventType: 'RATE_LIMIT_USER_EXCEEDED',
          severity: 'MEDIUM',
          module: 'RATE_LIMIT',
          action: req.method,
          path: req.originalUrl,
          message: `Per-user rate limit exceeded: ${config.description}`,
          ipAddress: req.ip,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        });

        res.status(429).json({
          success: false,
          message: 'Too many requests. Please slow down.',
          code: 'USER_RATE_LIMIT',
          retryAfterMs: config.windowMs,
        });
        return;
      }

      next();
    }).catch((err) => {
      logger.error({ err, key }, 'Per-user rate limiter error — allowing request through');
      next();
    });
  };
}

// ============================================================================
// EXPORTED LIMITERS
// ============================================================================

/** Per-user rate limiter for general API requests */
export const userApiRateLimiter = createUserRateLimiter(USER_API_LIMIT);

/** Per-user rate limiter for mutation requests (POST/PUT/PATCH/DELETE) */
export const userMutationRateLimiter = createUserRateLimiter(USER_MUTATION_LIMIT);

/** Per-user rate limiter for auth-related requests */
export const userAuthRateLimiter = createUserRateLimiter(USER_AUTH_LIMIT);

/**
 * Reset rate limit state for a specific user (use on logout/token refresh).
 */
export function resetUserRateLimit(userId?: string | null): void {
  if (userId) {
    const userKey = `user:${userId}`;
    void resetRateLimitRedis(userKey);

    // Also clean in-memory entries
    for (const config of [USER_API_LIMIT, USER_MUTATION_LIMIT, USER_AUTH_LIMIT]) {
      inMemoryWindows.delete(`${config.keySuffix}:${userKey}`);
    }
  }
}
