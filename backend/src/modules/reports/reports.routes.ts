import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  AssetEntity,
  CalibrationRecordEntity,
  EmailReportLogEntity,
  EmailReportScheduleEntity,
  OrganizationEntity,
  PmScheduleEntity,
  SafetyIncidentEntity,
  SpareItemEntity,
  WorkOrderEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { reportsRateLimiter } from '../../middlewares/rateLimiter';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { toCsv } from '../../utils/csvExport';
import { createSimpleExcelWorkbook } from '../../utils/excel';
import { sendMail } from '../../utils/mailer';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { createSimplePdf } from '../../utils/pdf';
import { getReportBranding } from '../../utils/reportBranding';
import { resolvePlantFilter } from '../../utils/plantScope';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { APP_NAME } from '../../config/branding';

const reportScheduleSchema = z.object({
  reportName: z.string().min(1),
  description: z.string().nullable().optional(),
  frequency: z.string().default('DAILY'),
  sendTime: z.string().default('08:00'),
  recipients: z.array(z.string().email()).min(1),
  isEnabled: z.boolean().default(true),
  reportSections: z.array(z.string()).nullable().optional(),
  filters: z.unknown().optional(),
  includeCharts: z.boolean().default(true),
  includeTables: z.boolean().default(true),
  includeDetailedLogs: z.boolean().default(false),
  plantId: z.string().uuid().nullable().optional(),
});

const sendNowSchema = z.object({
  scheduleId: z.string().uuid(),
});

const testEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().default('CMMS Test Email'),
  message: z.string().default('This is a test email from CMMS backend.'),
});

const sendReportEmailSchema = z
  .object({
    scheduleId: z.string().uuid().optional(),
    to: z.array(z.string().email()).optional(),
    subject: z.string().default(APP_NAME),
    message: z.string().default(`${APP_NAME} report generated successfully.`),
  })
  .superRefine((value, ctx) => {
    if (!value.scheduleId && (!value.to || value.to.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either scheduleId or at least one recipient is required',
        path: ['scheduleId'],
      });
    }
  });

const advancedReportQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  plantId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  workOrderStatus: z.string().optional(),
  maintenanceType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  reportType: z.enum(['MACHINE_RELIABILITY', 'WORK_ORDER', 'MAINTENANCE', 'SAFETY', 'INVENTORY', 'DOWNTIME', 'AVAILABILITY']).default('MACHINE_RELIABILITY'),
});

type ReliabilityRow = {
  woId: string;
  woNumber: string;
  status: string;
  woType: string;
  createdAt: Date;
  openedAt: Date | null;
  closedAt: Date | null;
  downtimeMinutes: number;
  assetId: string;
  assetCode: string;
  assetName: string;
  plantId: string | null;
  plantName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  moduleId: string | null;
  moduleName: string | null;
  vendorId: string | null;
  vendorName: string | null;
};

function toDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function safeHours(start: Date | null, end: Date | null) {
  if (!start || !end) return 0;
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return diff / (1000 * 60 * 60);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fetchReliabilityRows(input: z.infer<typeof advancedReportQuerySchema>, auth: Express.AuthContext) {
  const scopedPlantIds = resolvePlantFilter(auth, input.plantId);
  if (Array.isArray(scopedPlantIds) && scopedPlantIds.length === 0) {
    return { rows: [] as ReliabilityRow[], total: 0, scopedPlantIds };
  }

  const qb = AppDataSource.getRepository(WorkOrderEntity)
    .createQueryBuilder('wo')
    .innerJoin(AssetEntity, 'asset', 'asset.id = wo.asset_id')
    .leftJoin('plants', 'plant', 'plant.id = wo.plant_id')
    .leftJoin('departments', 'department', 'department.id = asset.department_id')
    .leftJoin('machine_modules', 'module', 'module.id = asset.module_id')
    .leftJoin('vendors', 'vendor', 'vendor.id = wo.vendor_id')
    .select([
      'wo.id AS "woId"',
      'wo.wo_number AS "woNumber"',
      'wo.status AS "status"',
      'wo.wo_type AS "woType"',
      'wo.created_at AS "createdAt"',
      'wo.opened_at AS "openedAt"',
      'wo.closed_at AS "closedAt"',
      'wo.downtime_minutes AS "downtimeMinutes"',
      'asset.id AS "assetId"',
      'asset.code AS "assetCode"',
      'asset.name AS "assetName"',
      'plant.id AS "plantId"',
      'plant.plant_name AS "plantName"',
      'department.id AS "departmentId"',
      'department.name AS "departmentName"',
      'module.id AS "moduleId"',
      'module.name AS "moduleName"',
      'vendor.id AS "vendorId"',
      'vendor.name AS "vendorName"',
    ]);

  if (auth.scopeType !== 'ROOT_ADMIN') {
    if (auth.organizationId) {
      qb.andWhere('plant.organization_id = :organizationId', { organizationId: auth.organizationId });
    }
  } else if (input.organizationId) {
    qb.andWhere('plant.organization_id = :organizationId', { organizationId: input.organizationId });
  }

  if (Array.isArray(scopedPlantIds) && scopedPlantIds.length > 0) {
    qb.andWhere('wo.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
  }
  if (input.departmentId) qb.andWhere('asset.department_id = :departmentId', { departmentId: input.departmentId });
  if (input.machineId) qb.andWhere('asset.id = :machineId', { machineId: input.machineId });
  if (input.moduleId) qb.andWhere('asset.module_id = :moduleId', { moduleId: input.moduleId });
  if (input.vendorId) qb.andWhere('wo.vendor_id = :vendorId', { vendorId: input.vendorId });
  if (input.workOrderStatus) qb.andWhere('wo.status = :workOrderStatus', { workOrderStatus: input.workOrderStatus });
  if (input.maintenanceType) qb.andWhere('wo.wo_type = :maintenanceType', { maintenanceType: input.maintenanceType });

  const startDate = toDate(input.startDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const endDate = toDate(input.endDate, new Date());
  qb.andWhere('wo.created_at BETWEEN :startDate AND :endDate', { startDate, endDate });
  qb.orderBy('wo.created_at', 'DESC');

  const total = await qb.getCount();
  qb.skip((input.page - 1) * input.limit).take(input.limit);
  const rows = (await qb.getRawMany()) as ReliabilityRow[];
  return { rows, total, scopedPlantIds };
}

function buildReliabilityPayload(rows: ReliabilityRow[], startDate: string | undefined, endDate: string | undefined) {
  const mttrHours = rows
    .filter((row) => row.status === 'CLOSED')
    .map((row) => safeHours(row.openedAt ? new Date(row.openedAt) : null, row.closedAt ? new Date(row.closedAt) : null))
    .filter((value) => value > 0);

  const groupedByAsset = new Map<string, ReliabilityRow[]>();
  rows.forEach((row) => {
    const existing = groupedByAsset.get(row.assetId) ?? [];
    existing.push(row);
    groupedByAsset.set(row.assetId, existing);
  });

  const mtbfSamples: number[] = [];
  const maintenanceFrequency: Array<{ assetId: string; assetCode: string; assetName: string; count: number }> = [];
  const ranking: Array<{ assetId: string; assetCode: string; assetName: string; mttrHours: number; downtimeMinutes: number; failures: number }> = [];

  groupedByAsset.forEach((assetRows, assetId) => {
    const sorted = [...assetRows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = new Date(sorted[index - 1].createdAt).getTime();
      const curr = new Date(sorted[index].createdAt).getTime();
      if (curr > prev) {
        mtbfSamples.push((curr - prev) / (1000 * 60 * 60));
      }
    }

    const assetMttr = average(
      sorted
        .filter((row) => row.status === 'CLOSED')
        .map((row) => safeHours(row.openedAt ? new Date(row.openedAt) : null, row.closedAt ? new Date(row.closedAt) : null))
        .filter((value) => value > 0),
    );
    const downtimeMinutes = sorted.reduce((sum, row) => sum + Number(row.downtimeMinutes || 0), 0);
    const failures = sorted.length;

    maintenanceFrequency.push({
      assetId,
      assetCode: sorted[0]?.assetCode ?? '-',
      assetName: sorted[0]?.assetName ?? '-',
      count: failures,
    });

    ranking.push({
      assetId,
      assetCode: sorted[0]?.assetCode ?? '-',
      assetName: sorted[0]?.assetName ?? '-',
      mttrHours: Number(assetMttr.toFixed(2)),
      downtimeMinutes,
      failures,
    });
  });

  const totalDowntimeMinutes = rows.reduce((sum, row) => sum + Number(row.downtimeMinutes || 0), 0);
  const periodHours = Math.max(
    1,
    (toDate(endDate, new Date()).getTime() - toDate(startDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).getTime()) /
      (1000 * 60 * 60),
  );
  const availability = Math.max(0, 100 - (totalDowntimeMinutes / (periodHours * 60)) * 100);

  return {
    summary: {
      mttrHours: Number(average(mttrHours).toFixed(2)),
      mtbfHours: Number(average(mtbfSamples).toFixed(2)),
      mttfHours: Number(average(mtbfSamples).toFixed(2)),
      downtimeMinutes: totalDowntimeMinutes,
      availabilityPercent: Number(availability.toFixed(2)),
      maintenanceFrequencyPerMachine: Number(average(maintenanceFrequency.map((item) => item.count)).toFixed(2)),
      workOrderCount: rows.length,
    },
    ranking: ranking.sort((a, b) => b.failures - a.failures || b.downtimeMinutes - a.downtimeMinutes).slice(0, 20),
    maintenanceFrequency: maintenanceFrequency.sort((a, b) => b.count - a.count).slice(0, 50),
    rows,
  };
}

async function triggerScheduleNow(schedule: EmailReportScheduleEntity, requestedBy: string) {
  const logRepo = AppDataSource.getRepository(EmailReportLogEntity);
  const reportPayload = {
    scheduleId: schedule.id,
    reportName: schedule.reportName,
    generatedAt: new Date().toISOString(),
    filters: schedule.filters,
    sections: schedule.reportSections ?? [],
    includeCharts: schedule.includeCharts,
    includeTables: schedule.includeTables,
    includeDetailedLogs: schedule.includeDetailedLogs,
  };

  const subject = `[CMMS] ${schedule.reportName} - ${new Date().toISOString().slice(0, 10)}`;
  const body = `Automated report payload:\n${JSON.stringify(reportPayload, null, 2)}`;
  const mail = await sendMail(schedule.recipients, subject, body);

  const log = logRepo.create({
    scheduleId: schedule.id,
    status: mail.sent ? 'SUCCESS' : 'FAILED',
    recipients: schedule.recipients,
    errorMessage: mail.error,
    recordsIncluded: 0,
    reportData: {
      reportName: schedule.reportName,
      subject,
      generatedBy: requestedBy,
      payload: reportPayload,
    },
  });
  await logRepo.save(log);

  schedule.lastSentAt = new Date();
  await AppDataSource.getRepository(EmailReportScheduleEntity).save(schedule);

  return { reportPayload, mail, log };
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/reports', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const qb = repo.createQueryBuilder('schedule');
    applySearch(qb, 'schedule', query.search, ['report_name', 'frequency']);
    applyPlantScope(qb, 'schedule', 'plantId', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('schedule.createdAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Report schedules fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/schedules', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const qb = repo.createQueryBuilder('schedule');
    applySearch(qb, 'schedule', query.search, ['report_name', 'frequency']);
    applyPlantScope(qb, 'schedule', 'plantId', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('schedule.createdAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Report schedules fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/:id', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Report schedule fetched'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/schedules/:id', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Report schedule fetched'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/reports', requirePermission('REPORTS', 'CREATE'), async (req, res, next) => {
  try {
    const body = reportScheduleSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const created = repo.create({
      ...body,
      plantId: resolvedPlantId,
      createdBy: req.auth!.userId,
      description: body.description ?? null,
      reportSections: body.reportSections ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Report schedule created'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/reports/schedules', requirePermission('REPORTS', 'CREATE'), async (req, res, next) => {
  try {
    const body = reportScheduleSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const created = repo.create({
      ...body,
      plantId: resolvedPlantId,
      createdBy: req.auth!.userId,
      description: body.description ?? null,
      reportSections: body.reportSections ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Report schedule created'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.patch('/reports/:id', requirePermission('REPORTS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = reportScheduleSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, body);
    await repo.save(entity);
    res.json(ok(entity, 'Report schedule updated'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.patch('/reports/schedules/:id', requirePermission('REPORTS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = reportScheduleSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, body);
    await repo.save(entity);
    res.json(ok(entity, 'Report schedule updated'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.delete('/reports/:id', requirePermission('REPORTS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    await repo.delete({ id: entity.id });
    res.json(ok({ id: entity.id, deleted: true }, 'Report schedule deleted'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.delete('/reports/schedules/:id', requirePermission('REPORTS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    await repo.delete({ id: entity.id });
    res.json(ok({ id: entity.id, deleted: true }, 'Report schedule deleted'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/history', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const scheduleId = typeof req.query.schedule_id === 'string' ? req.query.schedule_id : undefined;
    const repo = AppDataSource.getRepository(EmailReportLogEntity);
    const qb = repo
      .createQueryBuilder('log')
      .innerJoin(EmailReportScheduleEntity, 'schedule', 'schedule.id = log.schedule_id');
    applySearch(qb, 'log', query.search, ['status', 'error_message']);
    if (scheduleId) {
      qb.andWhere('log.scheduleId = :scheduleId', { scheduleId });
    }
    applyPlantScope(qb, 'schedule', 'plantId', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('log.sentAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Report history fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/reports/send-now', reportsRateLimiter, requirePermission('REPORTS', 'CREATE'), async (req, res, next) => {
  try {
    const body = sendNowSchema.parse(req.body);
    const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
    const schedule = await repo.findOneBy({ id: body.scheduleId });
    if (!schedule) {
      res.status(404).json({ success: false, message: 'Report schedule not found' });
      return;
    }
    ensurePlantAccess(req, schedule.plantId);

    const result = await triggerScheduleNow(schedule, req.auth!.userId);
    await audit('reports.send_now', {
      module: 'REPORTS',
      actorUserId: req.auth!.userId,
      entityName: 'email_report_schedules',
      entityId: schedule.id,
      plantId: schedule.plantId,
      statusCode: 200,
    });
    res.json(ok(result, 'Report send triggered'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/reports/test-email', reportsRateLimiter, requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('REPORTS', 'CREATE'), async (req, res, next) => {
  try {
    const body = testEmailSchema.parse(req.body);
    const result = await sendMail(body.to, body.subject, body.message);
    await audit('reports.test_email', {
      module: 'REPORTS',
      actorUserId: req.auth!.userId,
      statusCode: 200,
      metadata: { recipients: body.to.length },
    });
    res.json(ok(result, 'Test email processed'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/reports/send-report-email', reportsRateLimiter, requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('REPORTS', 'CREATE'), async (req, res, next) => {
  try {
    const body = sendReportEmailSchema.parse(req.body);

    if (body.scheduleId) {
      const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
      const schedule = await repo.findOneBy({ id: body.scheduleId });
      if (!schedule) {
        res.status(404).json({ success: false, message: 'Report schedule not found' });
        return;
      }
      ensurePlantAccess(req, schedule.plantId);

      const result = await triggerScheduleNow(schedule, req.auth!.userId);
      await audit('reports.send_report_email.schedule', {
        module: 'REPORTS',
        actorUserId: req.auth!.userId,
        entityName: 'email_report_schedules',
        entityId: schedule.id,
        plantId: schedule.plantId,
        statusCode: 200,
      });
      res.json(ok(result, 'Report email sent'));
      return;
    }

    const result = await sendMail(body.to ?? [], body.subject, body.message);
    await audit('reports.send_report_email.direct', {
      module: 'REPORTS',
      actorUserId: req.auth!.userId,
      statusCode: 200,
      metadata: { recipients: body.to?.length ?? 0 },
    });
    res.json(ok(result, result.sent ? 'Report email sent' : 'Report email could not be sent'));
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/advanced/reliability', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const query = advancedReportQuerySchema.parse(req.query);
    const { rows, total } = await fetchReliabilityRows(query, req.auth!);
    const payload = buildReliabilityPayload(rows, query.startDate, query.endDate);

    const [safetyCount, inventoryCount, pmCount, calibrationCount] = await Promise.all([
      AppDataSource.getRepository(SafetyIncidentEntity).createQueryBuilder('s').getCount(),
      AppDataSource.getRepository(SpareItemEntity).createQueryBuilder('sp').getCount(),
      AppDataSource.getRepository(PmScheduleEntity).createQueryBuilder('pm').getCount(),
      AppDataSource.getRepository(CalibrationRecordEntity).createQueryBuilder('cal').getCount(),
    ]);

    res.json(
      ok(
        {
          ...payload,
          reportCategories: {
            machineReliability: payload.summary.workOrderCount,
            workOrders: total,
            maintenance: pmCount,
            safety: safetyCount,
            inventory: inventoryCount,
            downtime: payload.summary.downtimeMinutes,
            availability: payload.summary.availabilityPercent,
            calibration: calibrationCount,
          },
        },
        'Advanced reliability report fetched',
        buildPagination(query.page, query.limit, total),
      ),
    );
  } catch (error) {
    console.error('reports.advanced.reliability.failed', {
      error,
      user: req.auth?.userId,
      query: req.query,
    });
    next(error);
  }
});

reportsRouter.get('/reports/advanced/export', requirePermission('REPORTS', 'EXPORT'), async (req, res, next) => {
  try {
    const query = advancedReportQuerySchema.parse(req.query);
    const exportQuery = { ...query, page: 1, limit: 500 };
    const { rows } = await fetchReliabilityRows(exportQuery, req.auth!);
    const payload = buildReliabilityPayload(rows, query.startDate, query.endDate);
    const now = new Date();

    const organization = req.auth?.organizationId
      ? await AppDataSource.getRepository(OrganizationEntity).findOneBy({ id: req.auth.organizationId })
      : null;
    const organizationName = organization?.name ?? 'CMMS Organization';
    const organizationLogoUrl = organization?.logoUrl ?? null;

    const reportTitle = 'Machine Reliability Report';
    const generatedAt = now.toISOString();
    const branding = await getReportBranding({
      organizationName,
      organizationLogoUrl,
      generatedAt,
      reportTitle,
    });
    const brandedHeader = branding.headerLine;
    const brandedFooter = branding.footerBranding;

    const detailRows = rows.map((row) => [
      row.woNumber,
      row.assetCode,
      row.assetName,
      row.plantName,
      row.departmentName,
      row.moduleName,
      row.status,
      row.woType,
      row.downtimeMinutes,
      row.createdAt,
      row.closedAt,
    ]);
    const summaryMttrMinutes = Number((payload.summary.mttrHours * 60).toFixed(2));
    const summaryMtbfMinutes = Number((payload.summary.mtbfHours * 60).toFixed(2));
    const summaryMttfMinutes = Number((payload.summary.mttfHours * 60).toFixed(2));

    if (query.format === 'csv') {
      const csv = toCsv(
        ['Header', ''],
        [
          [brandedHeader, ''],
          ['Organization', organizationName],
          ['Organization Logo', organizationLogoUrl ?? '-'],
          ['MTTR Minutes', summaryMttrMinutes],
          ['MTBF Minutes', summaryMtbfMinutes],
          ['MTTF Minutes', summaryMttfMinutes],
          ['Downtime Minutes', payload.summary.downtimeMinutes],
          ['Availability %', payload.summary.availabilityPercent],
          ['Footer Branding', brandedFooter],
          [brandedFooter, ''],
          [],
          ['WO Number', 'Machine Code', 'Machine Name', 'Plant', 'Department', 'Module', 'Status', 'Maintenance Type', 'Downtime Min', 'Created At', 'Closed At'],
          ...detailRows,
        ],
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="machine-reliability-${now.toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csv);
      return;
    }

    if (query.format === 'excel') {
      const workbook = createSimpleExcelWorkbook(reportTitle, [
        {
          name: 'Summary',
          headers: ['Field', 'Value'],
          rows: [
            ['Organization', organizationName],
            ['Organization Logo', organizationLogoUrl ?? '-'],
            ['Report Title', reportTitle],
            ['Generated At', generatedAt],
            ['MTTR Minutes', summaryMttrMinutes],
            ['MTBF Minutes', summaryMtbfMinutes],
            ['MTTF Minutes', summaryMttfMinutes],
            ['Downtime Minutes', payload.summary.downtimeMinutes],
            ['Availability %', payload.summary.availabilityPercent],
            ['Footer', brandedFooter],
          ],
        },
        {
          name: 'Machine Data',
          headers: ['WO Number', 'Machine Code', 'Machine Name', 'Plant', 'Department', 'Module', 'Status', 'Maintenance Type', 'Downtime Min', 'Created At', 'Closed At'],
          rows: detailRows,
        },
      ], {
        organizationName,
        organizationLogoUrl,
        generatedAt,
        footerBranding: brandedFooter,
        
        
        
        
        
        
        
        
        
        
        
        
      });
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="machine-reliability-${now.toISOString().slice(0, 10)}.xls"`);
      res.status(200).send(workbook);
      return;
    }

    const pdf = createSimplePdf([
      brandedHeader,
      `Organization Logo: ${organizationLogoUrl ?? '-'}`,
      `MTTR: ${summaryMttrMinutes} minutes`,
      `MTBF: ${summaryMtbfMinutes} minutes`,
      `MTTF: ${summaryMttfMinutes} minutes`,
      `Downtime: ${payload.summary.downtimeMinutes} minutes`,
      `Availability: ${payload.summary.availabilityPercent}%`,
      '',
      'Top Machine Reliability Ranking:',
      ...payload.ranking.slice(0, 15).map((row, index) => `${index + 1}. ${row.assetCode} ${row.assetName} | MTTR ${Number((row.mttrHours * 60).toFixed(2))} min | Failures ${row.failures}`),
      '',
    ], {
      title: reportTitle,
      subtitle: organizationName,
      organizationLogoUrl,
      generatedAt,
      footerBranding: brandedFooter,
      
      
      
      
      
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="machine-reliability-${now.toISOString().slice(0, 10)}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/reports/advanced/dashboard-kpis', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const query = z.object({
      plantId: z.string().uuid().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).parse(req.query);

    const kpis = await AdvancedAnalyticsService.getDashboardKPIs(query, req.auth!);
    res.json(ok(kpis, 'Dashboard KPIs fetched'));
  } catch (error) {
    next(error);
  }
});
