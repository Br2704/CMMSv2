import type { HelmetOptions } from 'helmet';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';

const corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
const allowedConnectSrc = isProduction
  ? ["'self'", env.FRONTEND_URL, ...corsOrigins]
  : ["'self'", "'unsafe-inline'", 'http://localhost:*', 'http://127.0.0.1:*', env.FRONTEND_URL, ...corsOrigins];

export const helmetOptions: HelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: isProduction ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      connectSrc: allowedConnectSrc,
      mediaSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: isProduction,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }
    : false,
  noSniff: true,
  hidePoweredBy: true,
  xssFilter: true,
};
