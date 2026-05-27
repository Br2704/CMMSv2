import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { databaseSelection } from './database.selection';
import { isStrongPassword } from '../utils/passwordPolicy';
import { APP_COMPANY, APP_NAME, APP_TAGLINE } from './branding';

config();
if (!process.env.JWT_SECRET) {
  const fallbackEnvPath = resolve(process.cwd(), 'backend/.env');
  if (existsSync(fallbackEnvPath)) {
    config({ path: fallbackEnvPath });
  }
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const optionalStringFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}, z.string().optional());

const optionalPortFromEnv = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const optionalUrlFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('/api'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  DATABASE_URL: optionalUrlFromEnv,
  DB_HOST: optionalStringFromEnv,
  DB_PORT: optionalPortFromEnv,
  DB_USER: optionalStringFromEnv,
  DB_PASSWORD: z.string().default(''),
  DB_FILE: optionalStringFromEnv,
  DB_SSL: booleanFromEnv.default(false),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default('cmms-backend'),
  JWT_AUDIENCE: z.string().default('cmms-web'),
  AUTH_SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(5),
  LOGIN_CAPTCHA_THRESHOLD: z.coerce.number().int().positive().default(3),
  LOGIN_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(8),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(10),
  MFA_ISSUER: z.string().default(APP_NAME),
  APP_NAME: z.string().default(APP_NAME),
  APP_COMPANY: z.string().default(APP_COMPANY),
  APP_TAGLINE: z.string().default(APP_TAGLINE),
  CAPTCHA_SECRET: z.string().min(16).optional(),
  DATA_ENCRYPTION_KEY: z.string().min(32),
  SECURITY_ALERT_EMAILS: z.string().default(''),
  SECURITY_TEAM_USER_IDS: z.string().default(''),
  SECURITY_ENABLE_REQUEST_SIGNATURE: booleanFromEnv.default(false),
  REQUEST_SIGNATURE_SECRET: z.string().default(''),
  UPLOAD_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  UPLOAD_MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(5_000_000),

  REDIS_URL: optionalUrlFromEnv,
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: optionalStringFromEnv,
  REDIS_TLS: booleanFromEnv.default(false),
  REDIS_KEY_PREFIX: z.string().default('cmms:'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  SMTP_FROM_NAME: z.string().optional().default(APP_TAGLINE),
  MAIL_QUEUE_ENABLED: booleanFromEnv.default(true),
  MAIL_RETRY_MAX: z.coerce.number().int().positive().default(3),
  MAIL_RETRY_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),

  SUPERADMIN_EMAIL: z.string().email().default('superadmin@cmms.local'),
  SUPERADMIN_PASSWORD: optionalStringFromEnv,
  SUPERADMIN_FULL_NAME: z.string().default(`${APP_COMPANY} Super Admin`),
  ROOT_ADMIN_EMAIL: z.string().email().default('admin@tamoptix.tech'),
  ROOT_ADMIN_PASSWORD: optionalStringFromEnv,
  ROOT_ADMIN_FULL_NAME: z.string().default('Root Admin'),

  FEATURE_BENCHMARKING: booleanFromEnv.default(true),
  FEATURE_ESG_ADVANCED: booleanFromEnv.default(true),
  FEATURE_RELIABILITY_ADVANCED: booleanFromEnv.default(true),

  // Set to true to bypass all rate limiting (useful for local/dev deployments)
  DISABLE_RATE_LIMIT: booleanFromEnv.default(false),
});

function assertDatabaseConfig(envConfig: z.infer<typeof envSchema>) {
  const errors: string[] = [];
  const usesDatabaseUrl = Boolean(envConfig.DATABASE_URL);
  const dbEngine = databaseSelection.engine;
  const relationalHostBased = new Set(['postgres', 'mysql', 'mariadb', 'mssql', 'cockroachdb']);
  const fileBased = new Set(['sqlite', 'better-sqlite3']);

  if (relationalHostBased.has(dbEngine) || dbEngine === 'mongodb') {
    if (!usesDatabaseUrl) {
      if (!envConfig.DB_HOST) errors.push('DB_HOST is required when DATABASE_URL is not set.');
      if (!envConfig.DB_PORT) errors.push('DB_PORT is required when DATABASE_URL is not set.');
      if (!envConfig.DB_USER) errors.push('DB_USER is required when DATABASE_URL is not set.');
    }
  }

  if (fileBased.has(dbEngine) && !usesDatabaseUrl && !envConfig.DB_FILE) {
    errors.push('DB_FILE is required for sqlite and better-sqlite3 when DATABASE_URL is not set.');
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Invalid database configuration', errors);
    throw new Error('Invalid database configuration');
  }
}

const COMMON_WEAK_SECRETS = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'tamoptix-dev-encryption-key-32-bytes',
  'changeme123!',
  'demo@12345',
  'balaji@1410?2004',
]);

function isWeakSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return COMMON_WEAK_SECRETS.has(normalized);
}

function assertProductionSecurityConfig(envConfig: z.infer<typeof envSchema>) {
  if (envConfig.NODE_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  if (!envConfig.JWT_SECRET || envConfig.JWT_SECRET.trim().length < 32 || isWeakSecret(envConfig.JWT_SECRET)) {
    errors.push('JWT_SECRET must be explicitly set with at least 32 characters and must not use weak defaults.');
  }
  if (!envConfig.JWT_REFRESH_SECRET || envConfig.JWT_REFRESH_SECRET.trim().length < 32 || isWeakSecret(envConfig.JWT_REFRESH_SECRET)) {
    errors.push('JWT_REFRESH_SECRET must be explicitly set with at least 32 characters and must not use weak defaults.');
  }
  if (envConfig.JWT_SECRET === envConfig.JWT_REFRESH_SECRET) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
  if (!envConfig.DATA_ENCRYPTION_KEY || envConfig.DATA_ENCRYPTION_KEY.trim().length < 32 || isWeakSecret(envConfig.DATA_ENCRYPTION_KEY)) {
    errors.push('DATA_ENCRYPTION_KEY must be explicitly set with at least 32 characters and must not use weak defaults.');
  }

  const dbEngine = databaseSelection.engine;
  const requiresDbPassword = ['postgres', 'mysql', 'mariadb', 'mssql', 'cockroachdb'].includes(dbEngine);
  if (requiresDbPassword && !envConfig.DATABASE_URL && (!envConfig.DB_PASSWORD || envConfig.DB_PASSWORD.trim().length === 0)) {
    errors.push('DB_PASSWORD must be explicitly set in production for relational databases.');
  }

  if (envConfig.ROOT_ADMIN_PASSWORD && !isStrongPassword(envConfig.ROOT_ADMIN_PASSWORD)) {
    errors.push('ROOT_ADMIN_PASSWORD must meet the password policy requirements.');
  }
  if (envConfig.SUPERADMIN_PASSWORD && !isStrongPassword(envConfig.SUPERADMIN_PASSWORD)) {
    errors.push('SUPERADMIN_PASSWORD must meet the password policy requirements.');
  }

  if (!envConfig.CORS_ORIGINS || envConfig.CORS_ORIGINS.trim().length === 0) {
    errors.push('CORS_ORIGINS must be explicitly set in production.');
  }
  if (!envConfig.FRONTEND_URL || envConfig.FRONTEND_URL.trim().length === 0) {
    errors.push('FRONTEND_URL must be explicitly set in production.');
  }
  if (envConfig.TRUST_PROXY_HOPS < 1) {
    errors.push('TRUST_PROXY_HOPS must be at least 1 in production for proper rate limiting.');
  }

  if (errors.length > 0) {
    console.error('Insecure production configuration detected', errors);
    throw new Error('Insecure production configuration');
  }
}

function deriveEnv(input: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...input };

  if (!out.JWT_REFRESH_SECRET && out.REFRESH_TOKEN_SECRET) {
    out.JWT_REFRESH_SECRET = out.REFRESH_TOKEN_SECRET;
  }
  if (!out.FRONTEND_URL && out.API_BASE_URL) {
    out.FRONTEND_URL = out.API_BASE_URL;
  }

  if (out.DATABASE_URL) {
    try {
      const parsed = new URL(out.DATABASE_URL);
      const protocol = parsed.protocol.replace(':', '').toLowerCase();
      if (protocol === 'sqlite') {
        const sqlitePath = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
        if (!out.DB_FILE && sqlitePath) out.DB_FILE = sqlitePath;
      } else {
        if (!out.DB_HOST) out.DB_HOST = parsed.hostname;
        if (!out.DB_PORT) out.DB_PORT = parsed.port || undefined;
        if (!out.DB_USER) out.DB_USER = decodeURIComponent(parsed.username || '');
        if (!out.DB_PASSWORD) out.DB_PASSWORD = decodeURIComponent(parsed.password || '');
      }
      if (!out.DB_SSL && parsed.searchParams.get('sslmode')) {
        out.DB_SSL = 'true';
      }
    } catch {
      // Keep schema validation responsible for reporting invalid config.
    }
  }

  return out;
}

const parsed = envSchema.safeParse(deriveEnv(process.env));
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

assertDatabaseConfig(parsed.data);
assertProductionSecurityConfig(parsed.data);

export const env = parsed.data;
