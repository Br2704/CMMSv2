import rateLimit from 'express-rate-limit';

export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many API requests' },
});

export const mutatingApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()),
  message: { success: false, message: 'Too many write requests' },
});

export const authLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please retry later.' },
});

export const authRefreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many token refresh requests' },
});

export const authLogoutRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many logout requests' },
});

export const reportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many report requests' },
});

export const exportsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many export requests' },
});

// Backward compatibility
export const authRateLimiter = authLoginRateLimiter;
