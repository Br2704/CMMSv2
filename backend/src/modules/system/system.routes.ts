import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AuditLogEntity, RefreshTokenEntity, SecurityEventEntity, SystemConfigEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { ok, fail } from '../../utils/apiResponse';
import { getHierarchyConsistencyBreakdown } from '../../utils/hierarchy';
import { resetTransporter, verifyMailConnection } from '../../services/mail.service';

export const systemRouter = Router();

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().email(),
  fromName: z.string().optional(),
  appUrl: z.string().url().optional(),
});

systemRouter.get('/system/health', async (_req, res) => {
// ... existing health code ...
  const startedAt = Date.now();
  let database = {
    status: 'down' as 'up' | 'down',
    latencyMs: null as number | null,
    error: null as string | null,
  };

  try {
    await AppDataSource.query('SELECT 1 AS ok');
    database = {
      status: 'up',
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    database = {
      status: 'down',
      latencyMs: null,
      error: error instanceof Error ? error.message : 'Database unavailable',
    };
  }

  const memory = process.memoryUsage();
  const apiStatus = database.status === 'up' ? 'ok' : 'degraded';
  const statusCode = database.status === 'up' ? 200 : 503;

  res.status(statusCode).json(
    ok(
      {
        status: apiStatus,
        uptimeSeconds: Math.floor(process.uptime()),
        database,
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
        },
      },
      'System health fetched',
    ),
  );
});

systemRouter.get('/system/health/details', requireAuth, requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const startedAt = Date.now();
    await AppDataSource.query('SELECT 1 AS ok');
    const dbLatencyMs = Date.now() - startedAt;
    const hierarchy = await getHierarchyConsistencyBreakdown();
    const memory = process.memoryUsage();
    res.json(
      ok({
        status: hierarchy.total === 0 ? 'ok' : 'warning',
        uptimeSeconds: Math.floor(process.uptime()),
        dbLatencyMs,
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
        },
        hierarchyConsistencyIssues: hierarchy.total,
      }, 'System health fetched'),
    );
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/system/performance', requireAuth, requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const auditRepo = AppDataSource.getRepository(AuditLogEntity);
    const refreshRepo = AppDataSource.getRepository(RefreshTokenEntity);
    const securityRepo = AppDataSource.getRepository(SecurityEventEntity);

    const [requestCount, apiFailures, activeSessions, recentSecurityEvents] = await Promise.all([
      auditRepo.createQueryBuilder('audit').where('audit.created_at >= :since', { since }).getCount(),
      auditRepo.createQueryBuilder('audit').where('audit.created_at >= :since', { since }).andWhere('audit.status_code >= :statusCode', { statusCode: 500 }).getCount(),
      refreshRepo
        .createQueryBuilder('token')
        .where('token.revoked_at IS NULL')
        .andWhere('token.expires_at > :now', { now: new Date() })
        .andWhere('(token.session_expires_at IS NULL OR token.session_expires_at > :now)', { now: new Date() })
        .getCount(),
      securityRepo.createQueryBuilder('event').where('event.detected_at >= :since', { since }).getCount(),
    ]);

    res.json(
      ok({
        requestCountLast24Hours: requestCount,
        apiFailuresLast24Hours: apiFailures,
        activeUsers: activeSessions,
        recentSecurityEvents,
      }, 'System performance fetched'),
    );
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/system/errors', requireAuth, requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const auditRepo = AppDataSource.getRepository(AuditLogEntity);
    const securityRepo = AppDataSource.getRepository(SecurityEventEntity);
    const [auditErrors, securityAlerts] = await Promise.all([
      auditRepo.createQueryBuilder('audit').where('audit.status_code >= :statusCode', { statusCode: 500 }).orderBy('audit.created_at', 'DESC').limit(50).getMany(),
      securityRepo
        .createQueryBuilder('event')
        .where('event.severity IN (:...levels)', { levels: ['HIGH', 'CRITICAL'] })
        .orderBy('event.detected_at', 'DESC')
        .limit(50)
        .getMany(),
    ]);

    res.json(
      ok(
        {
          apiErrors: auditErrors,
          securityAlerts,
        },
        'System errors fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});
