import type { HelmetOptions } from 'helmet';
import { env } from './env';

export const helmetOptions: HelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: env.NODE_ENV === 'development' ? ["'self'", "'unsafe-inline'"] : ["'self'"],
      styleSrc: env.NODE_ENV === 'development' ? ["'self'", "'unsafe-inline'"] : ["'self'"],
      connectSrc: ["'self'", env.FRONTEND_URL, ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  hidePoweredBy: true,
};
