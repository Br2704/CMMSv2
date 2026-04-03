import type { CorsOptions } from 'cors';
import { env } from './env';

const allowed = new Set(
  `${env.CORS_ORIGINS},${env.FRONTEND_URL},http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080`
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

function isLocalDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return isLocalHost && Boolean(parsed.port);
  } catch {
    return false;
  }
}

export const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (env.NODE_ENV !== 'production') {
      cb(null, true);
      return;
    }
    if (!origin || allowed.has(origin) || (env.NODE_ENV !== 'production' && isLocalDevOrigin(origin))) {
      cb(null, true);
      return;
    }
    const err = new Error('CORS origin not allowed') as Error & { status?: number };
    err.status = 403;
    cb(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
};
