// ============================================================================
// REDIS CLIENT SERVICE
// ============================================================================
// Enterprise-grade Redis client with graceful degradation, auto-reconnection,
// and connection lifecycle management. Falls back to in-memory store if Redis
// is unavailable or not configured (e.g., in development or test environments).
// ============================================================================

import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

function buildRedisOptions(): RedisOptions {
  const opts: RedisOptions = {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      // Exponential backoff: 200ms, 400ms, 800ms, ... up to 5s
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // When a Redis node is promoted from replica to master,
        // reconnect immediately
        return true;
      }
      return false;
    },
    lazyConnect: true,
    showFriendlyErrorStack: env.NODE_ENV !== 'production',
    enableAutoPipelining: true,
  };

  if (env.REDIS_PASSWORD) {
    opts.password = env.REDIS_PASSWORD;
  }

  if (env.REDIS_TLS) {
    opts.tls = {};
  }

  if (env.REDIS_URL) {
    // URL takes precedence; individual host/port/password are ignored
    return opts;
  }

  opts.host = env.REDIS_HOST;
  opts.port = env.REDIS_PORT;
  return opts;
}

function createRedisClient(): Redis {
  const url = env.REDIS_URL;
  if (url) {
    return new Redis(url, buildRedisOptions());
  }
  return new Redis(buildRedisOptions());
}

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let client: Redis | null = null;
let connected = false;

/**
 * Get the Redis client instance. Returns null if not connected or configured.
 * The client is lazily initialized on first call.
 */
export function getRedis(): Redis | null {
  if (client) return client;
  if (connected) return null; // previously failed to connect

  client = createRedisClient();

  client.on('connect', () => {
    logger.info('Redis: connecting...');
  });

  client.on('ready', () => {
    connected = true;
    logger.info('Redis: connected and ready');
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis: connection error');
  });

  client.on('close', () => {
    connected = false;
    logger.warn('Redis: connection closed');
  });

  client.on('reconnecting', (delay: number) => {
    logger.info({ delayMs: delay }, 'Redis: reconnecting');
  });

  // Attempt connection (non-blocking — if it fails, fallback to in-memory)
  client.connect().catch((err: Error) => {
    logger.warn({ err }, 'Redis: failed to connect — falling back to in-memory stores. Set REDIS_* env vars to enable.');
    client = null;
    connected = false;
  });

  return client;
}

/**
 * Check if Redis is currently connected and ready.
 */
export function isRedisConnected(): boolean {
  return connected && client !== null && client.status === 'ready';
}

/**
 * Disconnect the Redis client gracefully. Call during shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    connected = false;
    try {
      await c.quit();
      logger.info('Redis: disconnected gracefully');
    } catch (err) {
      logger.error({ err }, 'Redis: error during disconnect');
      c.disconnect();
    }
  }
}

// ============================================================================
// SHARED REDIS KEY HELPERS
// ============================================================================

const PREFIX = env.REDIS_KEY_PREFIX ?? 'cmms:';

export function redisKey(...parts: string[]): string {
  return `${PREFIX}${parts.join(':')}`;
}

// ============================================================================
// IN-MEMORY FALLBACK STORE
// ============================================================================
// Used when Redis is unavailable. Provides the same interface as Redis
// for the subset of operations needed by the rate limiter and idle timeout.
// ============================================================================

class InMemoryFallback {
  private store = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    // Periodic cleanup every 60s
    setInterval(() => this.cleanup(), 60_000).unref();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec?: number): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : Infinity,
    });
    return 'OK' as const;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.set(key, { value: '1', expiresAt: Infinity });
      return 1;
    }
    const next = String(Number(entry.value) + 1);
    this.store.set(key, { ...entry, value: next });
    return Number(next);
  }

  async expire(key: string, _ttlSec: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + _ttlSec * 1000;
    return 1;
  }

  async multi(): Promise<{
    incr(key: string): void;
    expire(key: string, ttl: number): void;
    set(key: string, value: string, ...args: string[]): void;
    del(...keys: string[]): void;
    exec(): Promise<[Error | null, unknown][]>;
  }> {
    const ops: Array<{ type: string; args: unknown[] }> = [];
    const self = this;

    return {
      incr(key: string) {
        ops.push({ type: 'incr', args: [key] });
      },
      expire(key: string, ttl: number) {
        ops.push({ type: 'expire', args: [key, ttl] });
      },
      set(key: string, value: string, ..._args: string[]) {
        ops.push({ type: 'set', args: [key, value, ..._args] });
      },
      del(...keys: string[]) {
        ops.push({ type: 'del', args: keys });
      },
      async exec(): Promise<[Error | null, unknown][]> {
        const results: [Error | null, unknown][] = [];
        for (const op of ops) {
          try {
            switch (op.type) {
              case 'incr':
                results.push([null, await self.incr(op.args[0] as string)]);
                break;
              case 'expire':
                results.push([null, await self.expire(op.args[0] as string, op.args[1] as number)]);
                break;
              case 'set':
                results.push([null, await self.set(op.args[0] as string, op.args[1] as string, op.args[2] as number | undefined)]);
                break;
              case 'del': {
                let count = 0;
                for (const k of op.args as string[]) {
                  count += await self.del(k);
                }
                results.push([null, count]);
                break;
              }
              default:
                results.push([null, undefined]);
            }
          } catch (err) {
            results.push([err as Error, null]);
          }
        }
        return results;
      },
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }
}

export const inMemoryFallback = new InMemoryFallback();
