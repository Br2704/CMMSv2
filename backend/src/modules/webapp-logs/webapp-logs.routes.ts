import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { webappLogsRateLimiter } from '../../middlewares/rateLimiter';
import { ok, fail } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { applySearch } from '../../utils/query';
import { applyPlantScope } from '../../utils/query';
import { AppDataSource } from '../../database/data-source';
import { AuditLogEntity } from '../../database/entities';
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

webappLogsRouter.get('/webapp-logs', requireAuth, requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(AuditLogEntity);
    
    const qb = repo.createQueryBuilder('audit_log');
    
    applySearch(qb, 'audit_log', query.search, ['action', 'module', 'path', 'method']);
    
    applyPlantScope(qb, 'audit_log', 'plantId', req.auth!, query.plantId);
    
    if (query.includeInactive === undefined) {
      // No soft-delete filter needed; audit logs are never soft-deleted
    }

    const totalQb = qb.clone();

    qb
      .orderBy('audit_log.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [items, total] = await Promise.all([
      qb.getMany(),
      totalQb.getCount(),
    ]);

    res.json(ok(items, 'Audit logs fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});
