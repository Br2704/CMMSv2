import { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { AuditLogEntity, PlantEntity, SecurityEventEntity, UserEntity } from '../../database/entities';
import { env } from '../../config/env';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { normalizeRoleName } from '../../utils/rbac';

const securityEventFilterSchema = z.object({
  plantId: z.string().uuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  eventType: z.string().trim().min(1).optional(),
});

const securityAuditFilterSchema = z.object({
  plantId: z.string().uuid().optional(),
});

type SecurityCenterRole = 'ROOT_ADMIN' | 'SUPER_ADMIN' | 'PLANT_ADMIN';

const SECURITY_CENTER_ALLOWED_ROLES = new Set<SecurityCenterRole>(['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN']);
const CSV_EXPORT_ROW_LIMIT = 5000;

const CONTROL_OPERATION_EVENT_TYPES = {
  backupRecovery: 'CONTROL_BACKUP_RECOVERY_RESTORE_DRILL',
  fileSecurity: 'CONTROL_FILE_SECURITY_VALIDATION_REVIEW',
  supplierSecurity: 'CONTROL_SUPPLIER_SECURITY_ATTESTATION',
} as const;

const backupRecoveryRecordSchema = z.object({
  plantId: z.string().uuid(),
  performedAt: z.coerce.date().optional(),
  rtoMinutes: z.number().finite().nonnegative().max(1440),
  rpoMinutes: z.number().finite().nonnegative().max(1440),
  result: z.enum(['PASS', 'FAIL']),
  notes: z.string().trim().max(800).optional(),
});

const fileSecurityRecordSchema = z.object({
  plantId: z.string().uuid(),
  performedAt: z.coerce.date().optional(),
  moduleName: z.string().trim().min(2).max(160),
  result: z.enum(['PASS', 'FAIL']),
  checks: z.object({
    mimeValidation: z.boolean(),
    sizeLimit: z.boolean(),
    secureStorage: z.boolean(),
    malwareScanning: z.boolean(),
  }),
  notes: z.string().trim().max(800).optional(),
});

const supplierSecurityRecordSchema = z.object({
  plantId: z.string().uuid(),
  performedAt: z.coerce.date().optional(),
  vendorName: z.string().trim().min(2).max(180),
  attestationStatus: z.enum(['VALID', 'PENDING', 'EXPIRED', 'REJECTED']),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(800).optional(),
});

export const securityRouter = Router();
securityRouter.use('/security', requireAuth, requireRole(['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN']), ensureSecurityCenterRole);

function resolveSecurityCenterRole(req: Request): SecurityCenterRole | null {
  const normalizedRoleCandidates = [req.auth?.roleKey ?? '', ...(req.auth?.roles ?? [])]
    .map((role) => normalizeRoleName(role))
    .filter(Boolean);

  for (const role of normalizedRoleCandidates) {
    if (SECURITY_CENTER_ALLOWED_ROLES.has(role as SecurityCenterRole)) {
      return role as SecurityCenterRole;
    }
  }

  return null;
}

function ensureSecurityCenterRole(req: Request, res: Response, next: NextFunction) {
  const role = resolveSecurityCenterRole(req);
  if (!role) {
    res.status(403).json({
      success: false,
      code: 'ROLE_DENIED',
      message: 'Only ROOT_ADMIN, SUPER_ADMIN, and PLANT_ADMIN can access Security Center data.',
    });
    return;
  }

  next();
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const csvLines = [headers.map((header) => escapeCsvValue(header)).join(',')];
  for (const row of rows) {
    csvLines.push(headers.map((header) => escapeCsvValue(row[header])).join(','));
  }
  return csvLines.join('\n');
}

function setCsvResponseHeaders(res: Response, filePrefix: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${filePrefix}-${timestamp}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

function resolveControlEventSeverity(status: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (status === 'FAIL' || status === 'EXPIRED' || status === 'REJECTED') return 'HIGH';
  if (status === 'PENDING') return 'MEDIUM';
  return 'LOW';
}

function metadataObject(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function metadataDate(metadata: Record<string, unknown>, key: string): Date | null {
  const value = metadataString(metadata, key);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function createControlOperationEvent(input: {
  req: Request;
  eventType: string;
  action: string;
  plantId: string | null;
  detectedAt: Date;
  statusToken: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  const repo = AppDataSource.getRepository(SecurityEventEntity);
  const record = repo.create({
    userId: input.req.auth?.userId ?? null,
    organizationId: input.req.auth?.organizationId ?? null,
    plantId: input.plantId,
    eventType: input.eventType,
    severity: resolveControlEventSeverity(input.statusToken),
    status: 'RESOLVED',
    module: 'SECURITY',
    action: input.action,
    path: input.req.path,
    message: input.message,
    ipAddress: input.req.ip || null,
    userAgent: input.req.get('user-agent') || null,
    detectedAt: input.detectedAt,
    resolvedAt: new Date(),
    metadata: input.metadata,
  });
  return repo.save(record);
}

function applyNonRootEventScope(qb: SelectQueryBuilder<SecurityEventEntity>, req: Request) {
  const scopeType = req.auth?.scopeType ?? null;
  const organizationId = req.auth?.organizationId ?? null;
  const plantIds = req.auth?.plantIds ?? [];
  const securityRole = resolveSecurityCenterRole(req);

  if (scopeType !== 'ROOT_ADMIN' && organizationId) {
    qb.leftJoin(PlantEntity, 'eventPlant', 'eventPlant.id = event.plant_id');
    qb.leftJoin(UserEntity, 'eventUser', 'eventUser.id = event.user_id');
    qb.andWhere(
      '(event.organization_id = :organizationId OR eventPlant.organization_id = :organizationId OR eventUser.organization_id = :organizationId)',
      { organizationId },
    );
  }

  if (scopeType !== 'ROOT_ADMIN' && securityRole === 'PLANT_ADMIN') {
    if (!plantIds.length) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere('event.plant_id IN (:...plantIds)', { plantIds });
    return;
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
  const securityRole = resolveSecurityCenterRole(req);

  if (scopeType !== 'ROOT_ADMIN' && organizationId) {
    qb.leftJoin(PlantEntity, 'auditPlant', 'auditPlant.id = audit.plant_id');
    qb.leftJoin(UserEntity, 'auditUser', 'auditUser.id = audit.user_id');
    qb.andWhere('(auditPlant.organization_id = :organizationId OR auditUser.organization_id = :organizationId)', {
      organizationId,
    });
  }

  if (scopeType !== 'ROOT_ADMIN' && securityRole === 'PLANT_ADMIN') {
    if (!plantIds.length) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere('audit.plant_id IN (:...plantIds)', { plantIds });
    return;
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

securityRouter.get('/security/events/export', async (req, res, next) => {
  try {
    const filters = securityEventFilterSchema.parse(req.query);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
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
    if (search) {
      qb.andWhere('(event.message ILIKE :search OR event.path ILIKE :search OR event.ip_address ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('event.detectedAt', 'DESC').take(CSV_EXPORT_ROW_LIMIT);
    const rows = await qb.getMany();

    const headers = [
      'id',
      'eventType',
      'severity',
      'status',
      'message',
      'module',
      'action',
      'path',
      'ipAddress',
      'userId',
      'organizationId',
      'plantId',
      'detectedAt',
      'acknowledgedAt',
      'acknowledgedBy',
    ];

    const csvRows = rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      severity: row.severity,
      status: row.status,
      message: row.message,
      module: row.module,
      action: row.action,
      path: row.path,
      ipAddress: row.ipAddress,
      userId: row.userId,
      organizationId: row.organizationId,
      plantId: row.plantId,
      detectedAt: row.detectedAt?.toISOString() ?? null,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: row.acknowledgedBy,
    }));

    setCsvResponseHeaders(res, 'security-events');
    res.status(200).send(toCsv(headers, csvRows));
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

securityRouter.get('/security/audit-logs/export', async (req, res, next) => {
  try {
    const filters = securityAuditFilterSchema.parse(req.query);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (filters.plantId) {
      ensurePlantAccess(req, filters.plantId);
    }

    const repo = AppDataSource.getRepository(AuditLogEntity);
    const qb = repo.createQueryBuilder('audit');
    applyNonRootAuditScope(qb, req);
    if (filters.plantId) {
      qb.andWhere('audit.plant_id = :plantId', { plantId: filters.plantId });
    }
    if (search) {
      qb.andWhere('(audit.action ILIKE :search OR audit.path ILIKE :search OR audit.module ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('audit.createdAt', 'DESC').take(CSV_EXPORT_ROW_LIMIT);
    const rows = await qb.getMany();

    const headers = [
      'id',
      'action',
      'module',
      'method',
      'path',
      'statusCode',
      'ipAddress',
      'userId',
      'plantId',
      'entityName',
      'entityId',
      'createdAt',
    ];

    const csvRows = rows.map((row) => ({
      id: row.id,
      action: row.action,
      module: row.module,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      ipAddress: row.ipAddress,
      userId: row.userId,
      plantId: row.plantId,
      entityName: row.entityName,
      entityId: row.entityId,
      createdAt: row.createdAt?.toISOString() ?? null,
    }));

    setCsvResponseHeaders(res, 'audit-logs');
    res.status(200).send(toCsv(headers, csvRows));
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/security/control-operations', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(SecurityEventEntity);
    const qb = repo.createQueryBuilder('event');
    applyNonRootEventScope(qb, req);
    qb
      .andWhere('event.event_type IN (:...eventTypes)', { eventTypes: Object.values(CONTROL_OPERATION_EVENT_TYPES) })
      .orderBy('event.detectedAt', 'DESC')
      .take(500);

    const rows = await qb.getMany();

    const backupRows = rows.filter((row) => row.eventType === CONTROL_OPERATION_EVENT_TYPES.backupRecovery);
    const fileRows = rows.filter((row) => row.eventType === CONTROL_OPERATION_EVENT_TYPES.fileSecurity);
    const supplierRows = rows.filter((row) => row.eventType === CONTROL_OPERATION_EVENT_TYPES.supplierSecurity);

    const backupPassCount = backupRows.filter((row) => metadataString(metadataObject(row.metadata), 'result') === 'PASS').length;
    const backupFailCount = backupRows.filter((row) => metadataString(metadataObject(row.metadata), 'result') === 'FAIL').length;
    const latestBackup = backupRows[0] ?? null;
    const latestBackupMetadata = metadataObject(latestBackup?.metadata ?? null);

    const filePassCount = fileRows.filter((row) => metadataString(metadataObject(row.metadata), 'result') === 'PASS').length;
    const fileFailCount = fileRows.filter((row) => metadataString(metadataObject(row.metadata), 'result') === 'FAIL').length;
    const latestFile = fileRows[0] ?? null;
    const latestFileMetadata = metadataObject(latestFile?.metadata ?? null);

    const supplierValidCount = supplierRows.filter((row) => metadataString(metadataObject(row.metadata), 'attestationStatus') === 'VALID').length;
    const supplierAttentionCount = supplierRows.filter((row) => {
      const status = metadataString(metadataObject(row.metadata), 'attestationStatus');
      return status === 'PENDING' || status === 'EXPIRED' || status === 'REJECTED';
    }).length;
    const latestSupplier = supplierRows[0] ?? null;
    const latestSupplierMetadata = metadataObject(latestSupplier?.metadata ?? null);

    const now = Date.now();
    const expiryWindow = now + 30 * 24 * 60 * 60 * 1000;
    const upcomingExpiryCount = supplierRows.reduce((count, row) => {
      const metadata = metadataObject(row.metadata);
      const status = metadataString(metadata, 'attestationStatus');
      const validUntil = metadataDate(metadata, 'validUntil');
      if (status !== 'VALID' || !validUntil) return count;
      const expiryTimestamp = validUntil.getTime();
      if (expiryTimestamp >= now && expiryTimestamp <= expiryWindow) {
        return count + 1;
      }
      return count;
    }, 0);

    const recent = rows.slice(0, 12).map((row) => {
      let controlKey: 'backup_recovery' | 'file_security' | 'supplier_security' = 'backup_recovery';
      if (row.eventType === CONTROL_OPERATION_EVENT_TYPES.fileSecurity) controlKey = 'file_security';
      if (row.eventType === CONTROL_OPERATION_EVENT_TYPES.supplierSecurity) controlKey = 'supplier_security';

      const metadata = metadataObject(row.metadata);
      const status = metadataString(metadata, 'result')
        || metadataString(metadata, 'attestationStatus')
        || 'RECORDED';

      return {
        id: row.id,
        controlKey,
        status,
        summary: row.message,
        plantId: row.plantId,
        performedAt: row.detectedAt.toISOString(),
      };
    });

    res.json(ok({
      backupRecovery: {
        totalDrills: backupRows.length,
        passedDrills: backupPassCount,
        failedDrills: backupFailCount,
        latestResult: metadataString(latestBackupMetadata, 'result'),
        lastDrillAt: latestBackup?.detectedAt?.toISOString() ?? null,
        lastRtoMinutes: metadataNumber(latestBackupMetadata, 'rtoMinutes'),
        lastRpoMinutes: metadataNumber(latestBackupMetadata, 'rpoMinutes'),
      },
      fileSecurity: {
        totalReviews: fileRows.length,
        passedReviews: filePassCount,
        failedReviews: fileFailCount,
        latestResult: metadataString(latestFileMetadata, 'result'),
        lastReviewAt: latestFile?.detectedAt?.toISOString() ?? null,
        lastModuleName: metadataString(latestFileMetadata, 'moduleName'),
      },
      supplierSecurity: {
        totalAttestations: supplierRows.length,
        validAttestations: supplierValidCount,
        attentionRequired: supplierAttentionCount,
        latestStatus: metadataString(latestSupplierMetadata, 'attestationStatus'),
        lastReviewAt: latestSupplier?.detectedAt?.toISOString() ?? null,
        upcomingExpiryCount,
        lastVendorName: metadataString(latestSupplierMetadata, 'vendorName'),
      },
      recent,
    }, 'Security control operations fetched'));
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/security/control-operations/backup-recovery', async (req, res, next) => {
  try {
    const body = backupRecoveryRecordSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId);

    const result = body.result;
    const detectedAt = body.performedAt ?? new Date();
    const message = result === 'PASS'
      ? `Backup recovery drill passed (RTO ${body.rtoMinutes}m, RPO ${body.rpoMinutes}m)`
      : `Backup recovery drill failed (RTO ${body.rtoMinutes}m, RPO ${body.rpoMinutes}m)`;

    const record = await createControlOperationEvent({
      req,
      eventType: CONTROL_OPERATION_EVENT_TYPES.backupRecovery,
      action: 'control.backup_recovery.record',
      plantId: body.plantId,
      detectedAt,
      statusToken: result,
      message,
      metadata: {
        controlKey: 'backup_recovery',
        isoClause: 'A.8.13',
        result,
        rtoMinutes: body.rtoMinutes,
        rpoMinutes: body.rpoMinutes,
        notes: body.notes || null,
        source: 'security_center',
      },
    });

    await audit('security.control.backup_recovery.recorded', {
      module: 'SECURITY',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'security_events',
      entityId: record.id,
      plantId: record.plantId,
      statusCode: 201,
      metadata: record.metadata,
    });

    res.status(201).json(ok(record, 'Backup recovery drill recorded'));
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/security/control-operations/file-security', async (req, res, next) => {
  try {
    const body = fileSecurityRecordSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId);

    const allChecksPassed = body.checks.mimeValidation
      && body.checks.sizeLimit
      && body.checks.secureStorage
      && body.checks.malwareScanning;

    const result = body.result === 'FAIL' || !allChecksPassed ? 'FAIL' : 'PASS';
    const detectedAt = body.performedAt ?? new Date();
    const message = result === 'PASS'
      ? `File security review passed for module ${body.moduleName}`
      : `File security review flagged issues for module ${body.moduleName}`;

    const record = await createControlOperationEvent({
      req,
      eventType: CONTROL_OPERATION_EVENT_TYPES.fileSecurity,
      action: 'control.file_security.record',
      plantId: body.plantId,
      detectedAt,
      statusToken: result,
      message,
      metadata: {
        controlKey: 'file_security',
        isoClause: 'A.8.12',
        moduleName: body.moduleName,
        result,
        checks: body.checks,
        notes: body.notes || null,
        source: 'security_center',
      },
    });

    await audit('security.control.file_security.recorded', {
      module: 'SECURITY',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'security_events',
      entityId: record.id,
      plantId: record.plantId,
      statusCode: 201,
      metadata: record.metadata,
    });

    res.status(201).json(ok(record, 'File security review recorded'));
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/security/control-operations/supplier-security', async (req, res, next) => {
  try {
    const body = supplierSecurityRecordSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId);

    const detectedAt = body.performedAt ?? new Date();
    const message = `Supplier attestation recorded for ${body.vendorName} (${body.attestationStatus})`;

    const record = await createControlOperationEvent({
      req,
      eventType: CONTROL_OPERATION_EVENT_TYPES.supplierSecurity,
      action: 'control.supplier_security.record',
      plantId: body.plantId,
      detectedAt,
      statusToken: body.attestationStatus,
      message,
      metadata: {
        controlKey: 'supplier_security',
        isoClause: 'A.5.19, A.5.20',
        vendorName: body.vendorName,
        attestationStatus: body.attestationStatus,
        validUntil: body.validUntil ? body.validUntil.toISOString() : null,
        notes: body.notes || null,
        source: 'security_center',
      },
    });

    await audit('security.control.supplier_security.recorded', {
      module: 'SECURITY',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'security_events',
      entityId: record.id,
      plantId: record.plantId,
      statusCode: 201,
      metadata: record.metadata,
    });

    res.status(201).json(ok(record, 'Supplier security attestation recorded'));
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

securityRouter.get('/security/compliance', async (req, res, next) => {
  try {
    const eventRepo = AppDataSource.getRepository(SecurityEventEntity);
    const auditRepo = AppDataSource.getRepository(AuditLogEntity);
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const eventQb = eventRepo.createQueryBuilder('event');
    const auditQb = auditRepo.createQueryBuilder('audit');
    applyNonRootEventScope(eventQb, req);
    applyNonRootAuditScope(auditQb, req);

    const [openCriticalEvents, unresolvedHighRiskEvents, securityEventsLast7Days, auditChangesLast7Days] = await Promise.all([
      eventQb.clone().andWhere('event.status = :status', { status: 'OPEN' }).andWhere('event.severity = :severity', { severity: 'CRITICAL' }).getCount(),
      eventQb
        .clone()
        .andWhere('event.status = :status', { status: 'OPEN' })
        .andWhere('event.severity IN (:...severities)', { severities: ['HIGH', 'CRITICAL'] })
        .getCount(),
      eventQb.clone().andWhere('event.detectedAt >= :since', { since: sevenDaysAgo }).getCount(),
      auditQb.clone().andWhere('audit.createdAt >= :since', { since: sevenDaysAgo }).getCount(),
    ]);

    const controls: Array<{
      key: string;
      status: 'implemented' | 'partial' | 'planned';
      isoClause: string;
      description: string;
    }> = [
      {
        key: 'access_control',
        status: 'implemented',
        isoClause: 'A.5.15, A.8.2',
        description: 'JWT auth, RBAC, and plant-scoped authorization are enforced in request middleware.',
      },
      {
        key: 'logging_monitoring',
        status: 'implemented',
        isoClause: 'A.8.15, A.8.16',
        description: 'Audit logs and security event telemetry provide traceability and monitoring evidence.',
      },
      {
        key: 'secure_configuration',
        status: 'implemented',
        isoClause: 'A.8.9, A.8.23',
        description: 'Security headers, CORS policy, rate-limits, and session controls are active.',
      },
      {
        key: 'incident_management',
        status: 'implemented',
        isoClause: 'A.5.24, A.5.25, A.5.26',
        description: 'Security incident events support acknowledgement and response tracking.',
      },
      {
        key: 'backup_recovery',
        status: 'partial',
        isoClause: 'A.8.13',
        description: 'Operational backup and restore controls exist but rely on deployment operational discipline.',
      },
      {
        key: 'file_security',
        status: 'partial',
        isoClause: 'A.8.12',
        description: 'File validation and secure handling controls are applied progressively by module.',
      },
      {
        key: 'supplier_security',
        status: 'partial',
        isoClause: 'A.5.19, A.5.20',
        description: 'Formalized third-party security review workflow can be expanded with recurring attestations.',
      },
    ];

    const controlSummary = controls.reduce(
      (accumulator, control) => {
        accumulator.total += 1;
        if (control.status === 'implemented') accumulator.implemented += 1;
        if (control.status === 'partial') accumulator.partial += 1;
        if (control.status === 'planned') accumulator.planned += 1;
        return accumulator;
      },
      { total: 0, implemented: 0, partial: 0, planned: 0 },
    );

    const weightedScore =
      controls.reduce((sum, control) => {
        if (control.status === 'implemented') return sum + 100;
        if (control.status === 'partial') return sum + 60;
        return sum + 30;
      }, 0) /
      controls.length;

    const score = Math.round(weightedScore);
    const maturityLevel = score >= 90 ? 'Optimized' : score >= 75 ? 'Managed' : score >= 60 ? 'Defined' : 'Developing';

    res.json(
      ok(
        {
          controls,
          controlSummary,
          score,
          maturityLevel,
          scope: {
            role: resolveSecurityCenterRole(req),
            scopeType: req.auth?.scopeType ?? null,
            organizationId: req.auth?.organizationId ?? null,
            plantIds: req.auth?.plantIds ?? [],
          },
          metrics: {
            openCriticalEvents,
            unresolvedHighRiskEvents,
            securityEventsLast7Days,
            auditChangesLast7Days,
            evaluationWindowDays: { operational: 7, trend: 30 },
            trendBaselineFrom: thirtyDaysAgo.toISOString(),
          },
          configuration: {
            jwtIssuer: env.JWT_ISSUER,
            sessionMaxHours: env.AUTH_SESSION_MAX_HOURS,
            captchaThreshold: env.LOGIN_CAPTCHA_THRESHOLD,
            lockoutThreshold: env.LOGIN_LOCKOUT_THRESHOLD,
            requestSignatureEnabled: env.SECURITY_ENABLE_REQUEST_SIGNATURE,
            smtpConfigured: Boolean(env.SMTP_HOST && env.SMTP_FROM),
            securityAlertEmailsConfigured: Boolean(env.SECURITY_ALERT_EMAILS.trim()),
          },
          recommendations: [
            'Perform quarterly access recertification for privileged users (ISO 27001 A.5.18).',
            'Document incident playbooks with RACI and SLA targets for high-risk alerts.',
            'Automate restore validation drills for backup snapshots and retain evidence (ISO 27001 A.8.13).',
            'Standardize file upload validation controls across modules with secure handling evidence (ISO 27001 A.8.12).',
            'Operationalize recurring supplier security attestations with exception tracking (ISO 27001 A.5.19, A.5.20).',
          ],
        },
        'Security compliance status fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});
