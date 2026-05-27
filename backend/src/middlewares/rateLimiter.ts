import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

function resolveRateLimitKey(req: Request) {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function resolveAuthLoginKey(req: Request) {
  const email =
    req.body && typeof req.body === 'object' && typeof (req.body as { email?: unknown }).email === 'string'
      ? (req.body as { email: string }).email.trim().toLowerCase()
      : 'unknown';
  return `${resolveRateLimitKey(req)}:${email}`;
}

const skipInNonProd = (req: Request) =>
  env.DISABLE_RATE_LIMIT === true || req.headers['x-test-suite'] === 'CMMS-E2E';

export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 2000,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many API requests' },
});

export const mutatingApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInNonProd(req) || ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()),
  message: { success: false, message: 'Too many write requests' },
});

export const authLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: resolveAuthLoginKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many login attempts. Please retry later.' },
});

export const authRefreshRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 150, // 150 refresh requests per minute
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many token refresh requests' },
});

export const authLogoutRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many logout requests' },
});

export const reportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many report requests' },
});

export const exportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many export requests' },
});

export const webappLogsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many log requests' },
});

export const heavyApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many data-intensive requests' },
});

export const mailConfigRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10, // 10 config changes per minute
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many mail config requests. Slow down.' },
});

export const mailTestRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5, // 5 test sends per minute
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many test emails. Please wait.' },
});

export const authPasswordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3, // 3 password reset requests per 15 min per IP
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInNonProd,
  message: { success: false, message: 'Too many password reset requests. Please retry later.' },
});

// Backward compatibility
export const authRateLimiter = authLoginRateLimiter;
