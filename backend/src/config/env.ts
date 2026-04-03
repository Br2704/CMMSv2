import { config } from 'dotenv';
import { z } from 'zod';

config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('/api'),

  DB_TYPE: z.enum(['postgres', 'mysql', 'mssql']).default('postgres'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1),
  DB_SSL: booleanFromEnv.default(false),

  JWT_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default('cmms-backend'),
  JWT_AUDIENCE: z.string().default('cmms-web'),
  AUTH_SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
  LOGIN_CAPTCHA_THRESHOLD: z.coerce.number().int().positive().default(3),
  LOGIN_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(8),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(10),
  MFA_ISSUER: z.string().default('TamOptiX CMMS'),
  DATA_ENCRYPTION_KEY: z.string().min(32).default('tamoptix-dev-encryption-key-32-bytes'),
  SECURITY_ALERT_EMAILS: z.string().default(''),
  SECURITY_TEAM_USER_IDS: z.string().default(''),
  SECURITY_ENABLE_REQUEST_SIGNATURE: booleanFromEnv.default(false),
  REQUEST_SIGNATURE_SECRET: z.string().default(''),
  UPLOAD_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  UPLOAD_MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(5_000_000),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),

  SUPERADMIN_EMAIL: z.string().email().default('superadmin@cmms.local'),
  SUPERADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  SUPERADMIN_FULL_NAME: z.string().default('CMMS Super Admin'),
  ROOT_ADMIN_EMAIL: z.string().email().default('admin@tamoptix.tech'),
  ROOT_ADMIN_PASSWORD: z.string().min(8).default('Balaji@1410?2004'),
  ROOT_ADMIN_FULL_NAME: z.string().default('CMMS Root Admin'),
  SEED_SUPERADMIN: booleanFromEnv.default(true),

  FEATURE_BENCHMARKING: booleanFromEnv.default(true),
  FEATURE_ESG_ADVANCED: booleanFromEnv.default(true),
  FEATURE_RELIABILITY_ADVANCED: booleanFromEnv.default(true),
});

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
      if (!out.DB_TYPE) {
        out.DB_TYPE = parsed.protocol.replace(':', '') as 'postgres' | 'mysql' | 'mssql';
      }
      if (!out.DB_HOST) out.DB_HOST = parsed.hostname;
      if (!out.DB_PORT) out.DB_PORT = parsed.port || undefined;
      if (!out.DB_USER) out.DB_USER = decodeURIComponent(parsed.username || '');
      if (!out.DB_PASSWORD) out.DB_PASSWORD = decodeURIComponent(parsed.password || '');
      if (!out.DB_NAME) out.DB_NAME = parsed.pathname.replace(/^\//, '');
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

export const env = parsed.data;
