import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetDowntimeEventEntity, AssetEntity, AssetReliabilityKpiEntity, WorkOrderEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { toCsv } from '../../utils/csvExport';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';

type WindowKey = '7d' | '30d' | '90d' | 'custom';

const windowBaseSchema = z.object({
    window: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  });

const windowSchema = windowBaseSchema.superRefine((value, ctx) => {
    if (value.window === 'custom' && (!value.from || !value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to are required when window=custom',
        path: ['from'],
      });
    }
  });

const createDowntimeSchema = z.object({
  plantId: z.string().uuid(),
  assetId: z.string().uuid(),
  workOrderId: z.string().uuid().nullable().optional(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable().optional(),
  isFailureEvent: z.coerce.boolean().default(true),
  reason: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const patchDowntimeSchema = createDowntimeSchema.partial();

const leaderboardQuerySchema = windowBaseSchema.extend({
  plantId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  assetType: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.window === 'custom' && (!value.from || !value.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from and to are required when window=custom',
      path: ['from'],
    });
  }
});

const exportQuerySchema = windowBaseSchema.extend({
  scope: z.enum(['plant', 'all']).default('plant'),
  plantId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  assetType: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.window === 'custom' && (!value.from || !value.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from and to are required when window=custom',
      path: ['from'],
    });
  }
});

const recomputeSchema = windowBaseSchema.extend({
  plantId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.window === 'custom' && (!value.from || !value.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from and to are required when window=custom',
      path: ['from'],
    });
  }
});

function resolveWindow(window: WindowKey, from?: string, to?: string) {
  if (window === 'custom' && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }

  const end = new Date();
  const start = new Date(end);
  const days = window === '7d' ? 7 : window === '90d' ? 90 : 30;
  start.setDate(end.getDate() - days);
  return { from: start, to: end };
}

function overlapMinutes(start: Date, end: Date, windowStart: Date, windowEnd: Date) {
  const effectiveStart = Math.max(start.getTime(), windowStart.getTime());
  const effectiveEnd = Math.min(end.getTime(), windowEnd.getTime());
  if (effectiveEnd <= effectiveStart) return 0;
  return (effectiveEnd - effectiveStart) / 60000;
}

async function computeAssetReliability(assetId: string, range: { from: Date; to: Date }) {
  const eventRepo = AppDataSource.getRepository(AssetDowntimeEventEntity);
  const events = await eventRepo
    .createQueryBuilder('event')
    .where('event.asset_id = :assetId', { assetId })
    .andWhere('event.is_active = :active', { active: true })
    .andWhere('event.started_at <= :windowEnd', { windowEnd: range.to })
    .andWhere('(event.ended_at IS NULL OR event.ended_at >= :windowStart)', { windowStart: range.from })
    .orderBy('event.started_at', 'ASC')
    .getMany();

  let failures = 0;
  let downtimeMinutes = 0;
  let eventCount = events.length;

  if (events.length > 0) {
    for (const event of events) {
      const startedAt = event.startedAt;
      const endedAt = event.endedAt ?? range.to;
      const duration = overlapMinutes(startedAt, endedAt, range.from, range.to);
      if (duration <= 0) {
        continue;
      }
      downtimeMinutes += duration;
      if (event.isFailureEvent) {
        failures += 1;
      }
    }
  } else {
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
    const workOrders = await workOrderRepo
      .createQueryBuilder('wo')
      .where('wo.asset_id = :assetId', { assetId })
      .andWhere('wo.is_failure_event = :failure', { failure: true })
      .andWhere('(wo.downtime_start_at IS NOT NULL OR wo.started_at IS NOT NULL OR wo.opened_at IS NOT NULL)')
      .andWhere('(wo.downtime_end_at IS NOT NULL OR wo.resolved_at IS NOT NULL OR wo.closed_at IS NOT NULL)')
      .andWhere('COALESCE(wo.downtime_start_at, wo.started_at, wo.opened_at) <= :windowEnd', { windowEnd: range.to })
      .andWhere('COALESCE(wo.downtime_end_at, wo.resolved_at, wo.closed_at) >= :windowStart', { windowStart: range.from })
      .getMany();

    for (const wo of workOrders) {
      const startedAt = wo.downtimeStartAt ?? wo.startedAt ?? wo.openedAt;
      const endedAt = wo.downtimeEndAt ?? wo.resolvedAt ?? wo.closedAt ?? range.to;
      if (!startedAt) continue;
      const duration = overlapMinutes(startedAt, endedAt, range.from, range.to);
      if (duration <= 0) continue;
      failures += 1;
      downtimeMinutes += duration;
    }
    eventCount = workOrders.length;
  }

  const windowMinutes = Math.max((range.to.getTime() - range.from.getTime()) / 60000, 0);
  const uptimeMinutes = Math.max(windowMinutes - downtimeMinutes, 0);
  const mttrMinutes = failures > 0 ? downtimeMinutes / failures : 0;
  const mtbfMinutes = failures > 0 ? uptimeMinutes / failures : windowMinutes;
  const mttfMinutes = failures > 0 ? uptimeMinutes / failures : windowMinutes;

  return {
    failures,
    downtimeMinutes,
    uptimeMinutes,
    mttrMinutes,
    mtbfMinutes,
    mttfMinutes,
    windowMinutes,
    eventCount,
  };
}

function asFixed(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function formatMetricValue(key: string, value: number) {
  if (key === 'failures' || key === 'eventCount') {
    return Math.round(value);
  }
  return asFixed(value);
}

export const reliabilityRouter = Router();
reliabilityRouter.use(requireAuth);

reliabilityRouter.get('/assets/:id/reliability', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = windowSchema.parse(req.query);
    const range = resolveWindow(query.window, query.from, query.to);

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id: params.id, isActive: true });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    ensurePlantAccess(req, asset.plantId);

    const metrics = await computeAssetReliability(asset.id, range);
    res.json(
      ok(
        {
          assetId: asset.id,
          plantId: asset.plantId,
          departmentId: asset.departmentId,
          moduleId: asset.moduleId,
          assetType: asset.assetType,
          from: range.from,
          to: range.to,
          ...Object.fromEntries(
            Object.entries(metrics).map(([key, value]) => (typeof value === 'number' ? [key, formatMetricValue(key, value)] : [key, value])),
          ),
        },
        'Asset reliability fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get(
  '/assets/reliability/leaderboard',
  requireRole(['SUPERADMIN', 'ADMIN']),
  requirePermission('ASSETS', 'READ'),
  async (req, res, next) => {
    try {
      const list = parseListQuery(req.query as Record<string, unknown>);
      const query = leaderboardQuerySchema.parse(req.query);
      const range = resolveWindow(query.window, query.from, query.to);

      if (query.plantId) {
        ensurePlantAccess(req, query.plantId);
      }

      const assetRepo = AppDataSource.getRepository(AssetEntity);
      const qb = assetRepo
        .createQueryBuilder('asset')
        .leftJoin('plants', 'plant', 'plant.id = asset.plant_id')
        .leftJoin('departments', 'department', 'department.id = asset.department_id')
        .leftJoin('machine_modules', 'module', 'module.id = asset.module_id')
        .where('asset.is_active = :active', { active: true });

      if (query.plantId) {
        qb.andWhere('asset.plant_id = :plantId', { plantId: query.plantId });
      } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
        if (!req.auth?.plantIds.length) {
          qb.andWhere('1=0');
        } else {
          qb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
        }
      }

      if (query.departmentId) {
        qb.andWhere('asset.department_id = :departmentId', { departmentId: query.departmentId });
      }
      if (query.moduleId) {
        qb.andWhere('asset.module_id = :moduleId', { moduleId: query.moduleId });
      }
      if (query.assetType) {
        qb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });
      }

      const totalQb = qb.clone().select('COUNT(1)', 'count');
      qb.skip((list.page - 1) * list.limit).take(list.limit).orderBy('asset.created_at', 'DESC');
      const total = await totalQb.getRawOne<{ count: string | number }>();
      const rows = await qb
        .select([
          'asset.id AS id',
          'asset.code AS code',
          'asset.name AS name',
          'asset.asset_type AS "assetType"',
          'asset.plant_id AS "plantId"',
          'asset.department_id AS "departmentId"',
          'asset.module_id AS "moduleId"',
          'plant.plant_name AS "plantName"',
          'department.name AS "departmentName"',
          'module.name AS "moduleName"',
        ])
        .getRawMany<Record<string, unknown>>();
      const withMetrics = await Promise.all(
        rows.map(async (item) => {
          const metrics = await computeAssetReliability(String(item.id), range);
          return {
            ...item,
            ...Object.fromEntries(
              Object.entries(metrics).map(([key, value]) => (typeof value === 'number' ? [key, formatMetricValue(key, value)] : [key, value])),
            ),
          };
        }),
      );

      withMetrics.sort((a, b) => Number(b.mtbfMinutes) - Number(a.mtbfMinutes));
      res.json(ok(withMetrics, 'Reliability leaderboard fetched', buildPagination(list.page, list.limit, Number(total?.count ?? 0))));
    } catch (error) {
      next(error);
    }
  },
);

reliabilityRouter.post('/downtime-events', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('WORK_ORDERS', 'UPDATE'), async (req, res, next) => {
  try {
    const body = createDowntimeSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId);

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id: body.assetId, isActive: true });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    if (asset.plantId !== body.plantId) {
      res.status(400).json(fail('Asset does not belong to selected plant'));
      return;
    }

    const repo = AppDataSource.getRepository(AssetDowntimeEventEntity);
    const startedAt = new Date(body.startedAt);
    const endedAt = body.endedAt ? new Date(body.endedAt) : null;
    if (endedAt && endedAt < startedAt) {
      res.status(400).json(fail('endedAt must be after startedAt'));
      return;
    }
    const durationMinutes = endedAt ? Math.max((endedAt.getTime() - startedAt.getTime()) / 60000, 0) : null;

    const created = repo.create({
      plantId: body.plantId,
      assetId: body.assetId,
      workOrderId: body.workOrderId ?? null,
      startedAt,
      endedAt,
      isFailureEvent: body.isFailureEvent,
      durationMinutes: durationMinutes !== null ? Math.round(durationMinutes) : null,
      reason: body.reason ?? null,
      notes: body.notes ?? null,
      isActive: true,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Downtime event created'));
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.patch(
  '/downtime-events/:id',
  requireRole(['SUPERADMIN', 'ADMIN']),
  requirePermission('WORK_ORDERS', 'UPDATE'),
  async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = patchDowntimeSchema.parse(req.body);

      const repo = AppDataSource.getRepository(AssetDowntimeEventEntity);
      const assetRepo = AppDataSource.getRepository(AssetEntity);
      const entity = await repo.findOneBy({ id: params.id, isActive: true });
      if (!entity) {
        res.status(404).json(fail('Downtime event not found'));
        return;
      }

      const nextPlantId = body.plantId ?? entity.plantId;
      ensurePlantAccess(req, nextPlantId);
      const nextAssetId = body.assetId ?? entity.assetId;

      const asset = await assetRepo.findOneBy({ id: nextAssetId, isActive: true });
      if (!asset) {
        res.status(404).json(fail('Asset not found'));
        return;
      }
      if (asset.plantId !== nextPlantId) {
        res.status(400).json(fail('Asset does not belong to selected plant'));
        return;
      }

      const startedAt = body.startedAt ? new Date(body.startedAt) : entity.startedAt;
      const endedAt = body.endedAt === undefined ? entity.endedAt : body.endedAt ? new Date(body.endedAt) : null;
      if (endedAt && endedAt < startedAt) {
        res.status(400).json(fail('endedAt must be after startedAt'));
        return;
      }

      const durationMinutes = endedAt ? Math.max((endedAt.getTime() - startedAt.getTime()) / 60000, 0) : null;
      Object.assign(entity, {
        plantId: nextPlantId,
        assetId: nextAssetId,
        workOrderId: body.workOrderId === undefined ? entity.workOrderId : body.workOrderId ?? null,
        startedAt,
        endedAt,
        isFailureEvent: body.isFailureEvent === undefined ? entity.isFailureEvent : body.isFailureEvent,
        durationMinutes: durationMinutes !== null ? Math.round(durationMinutes) : null,
        reason: body.reason === undefined ? entity.reason : body.reason ?? null,
        notes: body.notes === undefined ? entity.notes : body.notes ?? null,
      });

      await repo.save(entity);
      res.json(ok(entity, 'Downtime event updated'));
    } catch (error) {
      next(error);
    }
  },
);

reliabilityRouter.post(
  '/reliability/recompute',
  requireRole(['SUPERADMIN']),
  requirePermission('REPORTS', 'CREATE'),
  async (req, res, next) => {
    try {
      const body = recomputeSchema.parse(req.body ?? {});
      const range = resolveWindow(body.window, body.from, body.to);

      if (body.plantId) {
        ensurePlantAccess(req, body.plantId);
      }

      const assetRepo = AppDataSource.getRepository(AssetEntity);
      const qb = assetRepo.createQueryBuilder('asset').where('asset.is_active = :active', { active: true });
      if (body.plantId) {
        qb.andWhere('asset.plant_id = :plantId', { plantId: body.plantId });
      }
      const assets = await qb.getMany();

      const snapshotRepo = AppDataSource.getRepository(AssetReliabilityKpiEntity);
      const snapshots: AssetReliabilityKpiEntity[] = [];
      for (const asset of assets) {
        if (!asset.plantId) {
          continue;
        }
        const metrics = await computeAssetReliability(asset.id, range);
        snapshots.push(
          snapshotRepo.create({
            plantId: asset.plantId,
            assetId: asset.id,
            windowStart: range.from,
            windowEnd: range.to,
            failures: metrics.failures,
            downtimeMinutes: metrics.downtimeMinutes.toFixed(3),
            uptimeMinutes: metrics.uptimeMinutes.toFixed(3),
            mttrMinutes: metrics.mttrMinutes.toFixed(3),
            mtbfMinutes: metrics.mtbfMinutes.toFixed(3),
            mttfMinutes: metrics.mttfMinutes.toFixed(3),
            snapshotMeta: { eventCount: metrics.eventCount, windowMinutes: metrics.windowMinutes },
          }),
        );
      }

      if (snapshots.length > 0) {
        await snapshotRepo.save(snapshots);
      }

      res.json(ok({ saved: snapshots.length, from: range.from, to: range.to }, 'Reliability recompute complete'));
    } catch (error) {
      next(error);
    }
  },
);

reliabilityRouter.get(
  '/exports/reliability',
  requireRole(['SUPERADMIN', 'ADMIN']),
  requirePermission('REPORTS', 'EXPORT'),
  async (req, res, next) => {
    try {
      const query = exportQuerySchema.parse(req.query);
      const range = resolveWindow(query.window, query.from, query.to);
      const actorRoles = req.auth?.roles ?? [];
      const isGlobalExporter = actorRoles.includes('ROOT_ADMIN') || actorRoles.includes('SUPERADMIN');

      if (query.scope === 'all' && !isGlobalExporter) {
        res.status(403).json(fail('No permission'));
        return;
      }

      const assetRepo = AppDataSource.getRepository(AssetEntity);
      const qb = assetRepo
        .createQueryBuilder('asset')
        .leftJoin('plants', 'plant', 'plant.id = asset.plant_id')
        .leftJoin('departments', 'department', 'department.id = asset.department_id')
        .leftJoin('machine_modules', 'module', 'module.id = asset.module_id')
        .where('asset.is_active = :active', { active: true });

      if (query.scope === 'plant') {
        const scopedPlantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
        ensurePlantAccess(req, scopedPlantId);
        if (scopedPlantId) {
          qb.andWhere('asset.plant_id = :plantId', { plantId: scopedPlantId });
        }
      } else if (query.plantId) {
        ensurePlantAccess(req, query.plantId);
        qb.andWhere('asset.plant_id = :plantId', { plantId: query.plantId });
      } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
        if (!req.auth?.plantIds.length) {
          qb.andWhere('1=0');
        } else {
          qb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
        }
      }

      if (query.departmentId) qb.andWhere('asset.department_id = :departmentId', { departmentId: query.departmentId });
      if (query.moduleId) qb.andWhere('asset.module_id = :moduleId', { moduleId: query.moduleId });
      if (query.assetType) qb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });

      const assets = await qb
        .select([
          'asset.id AS id',
          'asset.code AS code',
          'asset.name AS name',
          'asset.asset_type AS "assetType"',
          'plant.plant_name AS "plantName"',
          'department.name AS "departmentName"',
          'module.name AS "moduleName"',
        ])
        .orderBy('plant.plant_name', 'ASC')
        .addOrderBy('department.name', 'ASC')
        .addOrderBy('module.name', 'ASC')
        .addOrderBy('asset.name', 'ASC')
        .getRawMany<Record<string, string>>();

      const rows = await Promise.all(
        assets.map(async (asset) => {
          const metrics = await computeAssetReliability(String(asset.id), range);
          return [
            asset.plantName ?? '',
            asset.departmentName ?? '',
            asset.moduleName ?? '',
            asset.name ?? '',
            asset.assetType ?? '',
            asFixed(metrics.mttrMinutes),
            asFixed(metrics.mtbfMinutes),
            asFixed(metrics.mttfMinutes),
            metrics.failures,
            asFixed(metrics.downtimeMinutes),
            range.from.toISOString(),
            range.to.toISOString(),
          ];
        }),
      );

      const csv = toCsv(
        ['Plant', 'Department', 'Module', 'Machine', 'AssetType', 'MTTR', 'MTBF', 'MTTF', 'Failures', 'Downtime', 'WindowStart', 'WindowEnd'],
        rows,
      );
      const fileName = `reliability-${query.scope}-${new Date().toISOString().slice(0, 10)}.csv`;
      await audit('exports.reliability', {
        module: 'REPORTS',
        actorUserId: req.auth?.userId ?? null,
        entityName: 'assets',
        statusCode: 200,
        metadata: {
          scope: query.scope,
          plantId: query.plantId ?? null,
          departmentId: query.departmentId ?? null,
          moduleId: query.moduleId ?? null,
          assetType: query.assetType ?? null,
          window: query.window,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          rowCount: rows.length,
        },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },
);
