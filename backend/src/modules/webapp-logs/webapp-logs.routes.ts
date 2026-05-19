import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/authMiddleware';
import { webappLogsRateLimiter } from '../../middlewares/rateLimiter';
import { ok, fail } from '../../utils/apiResponse';
import { logger } from '../../config/logger';

const webappLogSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
  message: z.string().min(1),
  action: z.string().optional().default(''),
  path: z.string().optional().default(''),
  statusCode: z.number().int().optional().default(0),
  stack: z.string().optional().nullable().default(null),
  metadata: z.record(z.unknown()).optional().default({}),
  userAgent: z.string().optional().default(''),
});

export const webappLogsRouter = Router();

webappLogsRouter.post('/webapp-logs', webappLogsRateLimiter, requireAuth, async (req, res) => {
  const parsed = webappLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).json(ok({ logged: false }, 'Invalid log payload - skipped'));
    return;
  }

  const { level, message, action, path, statusCode, stack, metadata, userAgent } = parsed.data;

  const logMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  logger[logMethod](
    {
      source: 'webapp',
      action,
      path,
      statusCode,
      userId: req.auth?.userId ?? null,
      userAgent: userAgent || req.headers['user-agent'] || null,
      metadata,
      ...(stack ? { stack } : {}),
    },
    message,
  );

  res.json(ok({ logged: true }, 'Webapp log recorded'));
});

webappLogsRouter.get('/webapp-logs', requireAuth, async (req, res) => {
  res.json(ok({ logs: [] }, 'Webapp logs endpoint - server-side log storage not configured'));
});
