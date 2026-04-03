import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { FeatureFlagEntity } from '../database/entities';

type FlagCacheEntry = {
  value: boolean;
  expiresAt: number;
};

const cache = new Map<string, FlagCacheEntry>();
const CACHE_TTL_MS = 30_000;

function envFallback(flagKey: string): boolean | null {
  const map: Record<string, boolean> = {
    FEATURE_BENCHMARKING: env.FEATURE_BENCHMARKING,
    FEATURE_ESG_ADVANCED: env.FEATURE_ESG_ADVANCED,
    FEATURE_RELIABILITY_ADVANCED: env.FEATURE_RELIABILITY_ADVANCED,
  };
  if (flagKey in map) {
    return map[flagKey];
  }
  return null;
}

export async function isFeatureEnabled(flagKey: string, environment = env.NODE_ENV): Promise<boolean> {
  const normalizedKey = flagKey.trim().toUpperCase();
  const cacheKey = `${normalizedKey}:${environment}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const fallback = envFallback(normalizedKey);
  if (!AppDataSource.isInitialized) {
    return fallback ?? false;
  }

  const repo = AppDataSource.getRepository(FeatureFlagEntity);
  const row = await repo.findOne({
    where: [{ key: normalizedKey, environment }, { key: normalizedKey, environment: 'all' }],
    order: { environment: 'DESC' },
  });

  const value = row ? row.enabled : fallback ?? false;
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateFeatureFlagCache(flagKey?: string): void {
  if (!flagKey) {
    cache.clear();
    return;
  }
  const normalizedKey = flagKey.trim().toUpperCase();
  for (const key of cache.keys()) {
    if (key.startsWith(`${normalizedKey}:`)) {
      cache.delete(key);
    }
  }
}
