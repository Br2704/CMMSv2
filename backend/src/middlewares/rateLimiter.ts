import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

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

export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many API requests' },
});

export const mutatingApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()),
  message: { success: false, message: 'Too many write requests' },
});

export const authLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: resolveAuthLoginKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please retry later.' },
});

export const authRefreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many token refresh requests' },
});

export const authLogoutRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many logout requests' },
});

export const reportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many report requests' },
});

export const exportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: resolveRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many export requests' },
});

// Backward compatibility
export const authRateLimiter = authLoginRateLimiter;
