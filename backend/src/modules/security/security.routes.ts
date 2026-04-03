import { type Request, Router } from 'express';
import { z } from 'zod';
import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { AuditLogEntity, PlantEntity, SecurityEventEntity, UserEntity } from '../../database/entities';
import { env } from '../../config/env';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { buildPagination, parseListQuery } from '../../utils/pagination';

const securityEventFilterSchema = z.object({
  plantId: z.string().uuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  eventType: z.string().trim().min(1).optional(),
});

export const securityRouter = Router();
securityRouter.use('/security', requireAuth, requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']));

function applyNonRootEventScope(qb: SelectQueryBuilder<SecurityEventEntity>, req: Request) {
  const scopeType = req.auth?.scopeType ?? null;
  const organizationId = req.auth?.organizationId ?? null;
  const plantIds = req.auth?.plantIds ?? [];

  if (scopeType !== 'ROOT_ADMIN' && organizationId) {
    qb.leftJoin(PlantEntity, 'eventPlant', 'eventPlant.id = event.plant_id');
    qb.leftJoin(UserEntity, 'eventUser', 'eventUser.id = event.user_id');
    qb.andWhere(
      '(event.organization_id = :organizationId OR eventPlant.organization_id = :organizationId OR eventUser.organization_id = :organizationId)',
      { organizationId },
    );
  }

  if (scopeType !== 'ROOT_ADMIN' && !req.auth?.accessAllPlants) {
    if (!plantIds.length) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere('(event.plant_id IN (:...plantIds) OR event.plant_id IS NULL)', { plantIds });
  }
}

function applyNonRootAuditScope(qb: SelectQueryBuilder<AuditLogEntity>, req: Request) {
  const scopeType = req.auth?.scopeType ?? null;
  const organizationId = req.auth?.organizationId ?? null;
  const plantIds = req.auth?.plantIds ?? [];

  if (scopeType !== 'ROOT_ADMIN' && organizationId) {
    qb.leftJoin(PlantEntity, 'auditPlant', 'auditPlant.id = audit.plant_id');
    qb.leftJoin(UserEntity, 'auditUser', 'auditUser.id = audit.user_id');
    qb.andWhere('(auditPlant.organization_id = :organizationId OR auditUser.organization_id = :organizationId)', {
      organizationId,
    });
  }

  if (scopeType !== 'ROOT_ADMIN' && !req.auth?.accessAllPlants) {
    if (!plantIds.length) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere('(audit.plant_id IN (:...plantIds) OR audit.plant_id IS NULL)', { plantIds });
  }
}

securityRouter.get('/security/events', async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = securityEventFilterSchema.parse(req.query);
    if (filters.plantId) {
      ensurePlantAccess(req, filters.plantId);
    }

    const repo = AppDataSource.getRepository(SecurityEventEntity);
    const qb = repo.createQueryBuilder('event');
    applyNonRootEventScope(qb, req);
    if (filters.plantId) {
      qb.andWhere('event.plant_id = :plantId', { plantId: filters.plantId });
    }
    if (filters.severity) qb.andWhere('event.severity = :severity', { severity: filters.severity });
    if (filters.status) qb.andWhere('event.status = :status', { status: filters.status });
    if (filters.eventType) qb.andWhere('event.event_type = :eventType', { eventType: filters.eventType });
    if (query.search) {
      qb.andWhere('(event.message ILIKE :search OR event.path ILIKE :search OR event.ip_address ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('event.detectedAt', 'DESC');
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Security events fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

securityRouter.patch('/security/events/:id/acknowledge', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(SecurityEventEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Security event not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.status = 'ACKNOWLEDGED';
    entity.acknowledgedBy = req.auth?.userId ?? null;
    entity.acknowledgedAt = new Date();
    await repo.save(entity);
    await audit('security.event.acknowledge', {
      module: 'SECURITY',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'security_events',
      entityId: entity.id,
      plantId: entity.plantId,
      statusCode: 200,
    });
    res.json(ok(entity, 'Security event acknowledged'));
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/security/audit-logs', async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const plantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    if (plantId) {
      ensurePlantAccess(req, plantId);
    }

    const repo = AppDataSource.getRepository(AuditLogEntity);
    const qb = repo.createQueryBuilder('audit');
    applyNonRootAuditScope(qb, req);
    if (plantId) {
      qb.andWhere('audit.plant_id = :plantId', { plantId });
    }
    if (query.search) {
      qb.andWhere('(audit.action ILIKE :search OR audit.path ILIKE :search OR audit.module ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('audit.createdAt', 'DESC');
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Audit logs fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/security/dashboard', async (req, res, next) => {
  try {
    const eventRepo = AppDataSource.getRepository(SecurityEventEntity);
    const auditRepo = AppDataSource.getRepository(AuditLogEntity);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const eventQb = eventRepo.createQueryBuilder('event');
    const auditQb = auditRepo.createQueryBuilder('audit');
    applyNonRootEventScope(eventQb, req);
    applyNonRootAuditScope(auditQb, req);

    let openEvents = 0;
    let criticalEvents = 0;
    let failedLoginEvents = 0;
    let suspiciousIps: Array<{ ipAddress: string; attempts: string }> = [];
    let auditChanges = 0;

    try {
      [openEvents, criticalEvents, failedLoginEvents, suspiciousIps, auditChanges] = await Promise.all([
        eventQb.clone().andWhere('event.status = :status', { status: 'OPEN' }).getCount(),
        eventQb.clone().andWhere('event.severity = :severity', { severity: 'CRITICAL' }).getCount(),
        eventQb.clone().andWhere('event.event_type IN (:...types)', { types: ['AUTH_LOGIN_FAILED', 'AUTH_ACCOUNT_LOCKED', 'AUTH_MFA_FAILED'] }).getCount(),
        eventQb
          .clone()
          .select('event.ip_address', 'ipAddress')
          .addSelect('COUNT(*)', 'attempts')
          .andWhere('event.ip_address IS NOT NULL')
          .groupBy('event.ip_address')
          .orderBy('COUNT(*)', 'DESC')
          .limit(5)
          .getRawMany<{ ipAddress: string; attempts: string }>(),
        auditQb
          .clone()
          .andWhere('audit.createdAt >= :since', { since })
          .getCount(),
      ]);
    } catch (dashboardError) {
      // Prevent dashboard UI failures when security analytics query is partially incompatible.
      console.error('security.dashboard.query_failed', {
        error: dashboardError,
        user: req.auth?.userId,
        organizationId: req.auth?.organizationId ?? null,
        plantIds: req.auth?.plantIds ?? [],
      });
    }

    res.json(
      ok({
        openEvents,
        criticalEvents,
        failedLoginEvents,
        auditChangesLast24Hours: auditChanges,
        suspiciousIps: suspiciousIps.map((row) => ({
          ipAddress: row.ipAddress,
          attempts: Number(row.attempts),
        })),
        diagnostics: {
          analyticsAvailable: suspiciousIps.length > 0 || openEvents > 0 || criticalEvents > 0 || failedLoginEvents > 0 || auditChanges > 0,
        },
      }, 'Security dashboard fetched'),
    );
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/security/compliance', requireRole(['ROOT_ADMIN']), async (_req, res, next) => {
  try {
    res.json(
      ok(
        {
          controls: [
            { key: 'access_control', status: 'implemented', description: 'JWT auth, RBAC, plant-scoped authorization, MFA-ready login flow.' },
            { key: 'logging_monitoring', status: 'implemented', description: 'Audit logging and security event tracking are enabled.' },
            { key: 'secure_configuration', status: 'implemented', description: 'Helmet, CORS policy, rate limiting, secure cookies, and env-based secrets are configured.' },
            { key: 'incident_management', status: 'implemented', description: 'High-severity security events trigger in-app notifications and email alerts.' },
            { key: 'backup_recovery', status: 'partial', description: 'Operational scripts and documented backup controls must be run in deployment.' },
            { key: 'file_security', status: 'partial', description: 'Secure upload validation is being enforced module by module.' },
          ],
          configuration: {
            jwtIssuer: env.JWT_ISSUER,
            sessionMaxHours: env.AUTH_SESSION_MAX_HOURS,
            captchaThreshold: env.LOGIN_CAPTCHA_THRESHOLD,
            lockoutThreshold: env.LOGIN_LOCKOUT_THRESHOLD,
            requestSignatureEnabled: env.SECURITY_ENABLE_REQUEST_SIGNATURE,
            smtpConfigured: Boolean(env.SMTP_HOST && env.SMTP_FROM),
            securityAlertEmailsConfigured: Boolean(env.SECURITY_ALERT_EMAILS.trim()),
          },
        },
        'Security compliance status fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});
