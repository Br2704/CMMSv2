
import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AlertLogEntity } from '../../database/entities';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { toCsv } from '../../utils/csvExport';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { createCrudRouter } from '../_core/crud.routes';
import { alertsService } from './alerts.service';
import { createAlertConfigSchema, updateAlertConfigSchema } from './alerts.validators';

const alertMutationSchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});

const alertLogFiltersSchema = z.object({
  plantId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

const alertIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const alertsRouter = createCrudRouter(
  {
    moduleName: 'alerts',
    moduleId: 'ALERTS',
    basePath: '/api/alerts/config',
    tableName: 'alerts_config',
  },
  alertsService,
  {
    createSchema: createAlertConfigSchema,
    updateSchema: updateAlertConfigSchema,
  },
);

alertsRouter.get('/alerts/log', requirePermission('ALERTS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = alertLogFiltersSchema.parse(req.query);
    if (filters.plantId) {
      ensurePlantAccess(req, filters.plantId);
    }

    const repo = AppDataSource.getRepository(AlertLogEntity);
    const qb = repo.createQueryBuilder('alert');

    if (filters.plantId) {
      qb.andWhere('alert.plant_id = :plantId', { plantId: filters.plantId });
    } else if (!req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('alert.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    if (filters.status) {
      qb.andWhere('alert.status = :status', { status: filters.status });
    }
    if (filters.severity) {
      qb.andWhere('alert.severity = :severity', { severity: filters.severity });
    }
    if (query.search) {
      qb.andWhere('(alert.metric_key ILIKE :search OR alert.message ILIKE :search)', { search: `%${query.search}%` });
    }

    qb.orderBy('alert.triggeredAt', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Alert logs fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

alertsRouter.patch('/alerts/log/:id/acknowledge', requirePermission('ALERTS', 'UPDATE'), async (req, res, next) => {
  try {
    const { id } = alertIdParamsSchema.parse(req.params);
    const body = alertMutationSchema.parse(req.body ?? {});
    const repo = AppDataSource.getRepository(AlertLogEntity);
    const entity = await repo.findOneBy({ id });
    if (!entity) {
      res.status(404).json(fail('Alert log not found'));
      return;
    }

    ensurePlantAccess(req, entity.plantId);
    if (body.version && entity.version !== body.version) {
      res.status(409).json(fail('Alert log has changed. Refresh and retry.', { code: 'VERSION_CONFLICT', currentVersion: entity.version }));
      return;
    }

    entity.status = 'ACKNOWLEDGED';
    entity.acknowledgedBy = req.auth?.userId ?? null;
    entity.acknowledgedAt = new Date();
    const saved = await repo.save(entity);
    res.json(ok(saved, 'Alert acknowledged'));
  } catch (error) {
    next(error);
  }
});

alertsRouter.patch('/alerts/log/:id/resolve', requirePermission('ALERTS', 'UPDATE'), async (req, res, next) => {
  try {
    const { id } = alertIdParamsSchema.parse(req.params);
    const body = alertMutationSchema.parse(req.body ?? {});
    const repo = AppDataSource.getRepository(AlertLogEntity);
    const entity = await repo.findOneBy({ id });
    if (!entity) {
      res.status(404).json(fail('Alert log not found'));
      return;
    }

    ensurePlantAccess(req, entity.plantId);
    if (body.version && entity.version !== body.version) {
      res.status(409).json(fail('Alert log has changed. Refresh and retry.', { code: 'VERSION_CONFLICT', currentVersion: entity.version }));
      return;
    }

    entity.status = 'RESOLVED';
    entity.resolvedBy = req.auth?.userId ?? null;
    entity.resolvedAt = new Date();
    if (!entity.acknowledgedAt) {
      entity.acknowledgedBy = req.auth?.userId ?? null;
      entity.acknowledgedAt = new Date();
    }
    const saved = await repo.save(entity);
    res.json(ok(saved, 'Alert resolved'));
  } catch (error) {
    next(error);
  }
});

alertsRouter.get('/alerts/export', requirePermission('ALERTS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery({
      ...req.query,
      page: 1,
      limit: 5000,
    } as Record<string, unknown>);
    const filters = alertLogFiltersSchema.parse(req.query);
    if (filters.plantId) {
      ensurePlantAccess(req, filters.plantId);
    }

    const repo = AppDataSource.getRepository(AlertLogEntity);
    const qb = repo.createQueryBuilder('alert');

    if (filters.plantId) {
      qb.andWhere('alert.plant_id = :plantId', { plantId: filters.plantId });
    } else if (!req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('alert.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    if (filters.status) {
      qb.andWhere('alert.status = :status', { status: filters.status });
    }
    if (filters.severity) {
      qb.andWhere('alert.severity = :severity', { severity: filters.severity });
    }
    if (query.search) {
      qb.andWhere('(alert.metric_key ILIKE :search OR alert.message ILIKE :search)', { search: `%${query.search}%` });
    }

    const rows = await qb.orderBy('alert.triggeredAt', 'DESC').take(query.limit).getMany();
    const csv = toCsv(
      [
        'Triggered At',
        'Plant ID',
        'Asset ID',
        'Metric Key',
        'Actual Value',
        'Comparison',
        'Threshold Value',
        'Severity',
        'Status',
        'Message',
        'Acknowledged By',
        'Acknowledged At',
        'Resolved By',
        'Resolved At',
      ],
      rows.map((row) => [
        row.triggeredAt.toISOString(),
        row.plantId,
        row.assetId,
        row.metricKey,
        row.actualValue,
        row.comparisonType,
        row.thresholdValue,
        row.severity,
        row.status,
        row.message,
        row.acknowledgedBy,
        row.acknowledgedAt?.toISOString() ?? null,
        row.resolvedBy,
        row.resolvedAt?.toISOString() ?? null,
      ]),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"alerts-${new Date().toISOString().slice(0, 10)}.csv\"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

export { alertsRouter };
