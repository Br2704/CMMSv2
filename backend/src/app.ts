import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import pinoHttp from 'pino-http';
import { corsOptions } from './config/cors';
import { env } from './config/env';
import { logger } from './config/logger';
import { helmetOptions } from './config/security';
import { AppDataSource } from './database/data-source';
import { auditLogger } from './middlewares/auditLogger';
import { errorHandler } from './middlewares/errorHandler';
import { apiNotFoundHandler } from './middlewares/notFoundHandler';
import { exportsRateLimiter, generalApiRateLimiter, mutatingApiRateLimiter } from './middlewares/rateLimiter';
import { sanitizeInput } from './middlewares/sanitizeInput';
import { router } from './routes';
import { fail, ok } from './utils/apiResponse';
import { notFound } from './utils/httpError';
import { findQrResolutionRow, toResolvedPayload } from './modules/qr/qr.shared';

const qrTokenParamSchema = z.object({
  token: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(pinoHttp({ logger }));
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use(generalApiRateLimiter);
app.use(mutatingApiRateLimiter);
app.use(sanitizeInput);
app.use(auditLogger);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith(`${env.API_PREFIX}/auth`)) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'CMMS Backend API',
    data: {
      health: '/health',
      ready: '/ready',
      apiBase: env.API_PREFIX,
    },
  });
});

app.get('/ready', (_req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json(fail('Database not ready'));
    return;
  }
  res.status(200).json({ success: true, message: 'READY', data: { status: 'ok' } });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', data: { status: 'ok' } });
});

app.get('/qr/:token', (req, res) => {
  const parsed = qrTokenParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(fail('Invalid QR token'));
    return;
  }
  const token = parsed.data.token;
  const frontendBaseUrl = env.FRONTEND_URL.replace(/\/+$/, '');
  res.redirect(302, `${frontendBaseUrl}/qr/${encodeURIComponent(token)}`);
});

app.get(`${env.API_PREFIX}/qr/public/:token`, (req, res, next) => {
  const parsed = qrTokenParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(fail('Invalid QR token'));
    return;
  }

  void (async () => {
    try {
      const token = parsed.data.token;
      const row = await findQrResolutionRow(token);
      if (!row) {
        notFound('QR token not found');
      }

      res.json(ok(toResolvedPayload(req, token, row)));
    } catch (error) {
      next(error);
    }
  })();
});

app.use(`${env.API_PREFIX}/exports`, exportsRateLimiter);
app.use(env.API_PREFIX, router);
app.use(env.API_PREFIX, apiNotFoundHandler);
app.use(errorHandler);
