// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { EmissionsFactorEntity, EnergyMeterReadingEntity, EsgReportEntity, GhgActivityDataEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { linearRegression, safeNumber } from '../../utils/advancedAnalytics';
import { toCsv } from '../../utils/csvExport';
import { createSimplePdf } from '../../utils/pdf';
import { buildPagination, parseListQuery } from '../../utils/pagination';

const dateRangeSchema = z.object({
  plantId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const energyReadingSchema = z.object({
  plantId: z.string().uuid(),
  meterId: z.string().trim().min(1).max(120),
  capturedAt: z.string().datetime({ offset: true }),
  kwh: z.coerce.number().min(0).max(1_000_000_000),
  demandKw: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const ghgActivitySchema = z.object({
  plantId: z.string().uuid(),
  sourceType: z.enum(['electricity', 'diesel', 'boiler_fuel', 'lpg', 'other']),
  scopeCategory: z.enum(['SCOPE_1', 'SCOPE_2', 'SCOPE_3']).default('SCOPE_2'),
  quantity: z.coerce.number().min(0).max(1_000_000_000),
  unit: z.string().trim().min(1).max(40),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  factorKey: z.string().trim().min(1).max(120).optional(),
  factorValue: z.coerce.number().min(0).max(100_000).optional(),
  productionOutput: z.coerce.number().min(0).max(1_000_000_000).optional(),
});

const reportGenerateSchema = z.object({
  plantId: z.string().uuid().optional(),
  reportType: z.enum(['GHG', 'ISO50001', 'Energy']),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  storagePath: z.string().max(500).nullable().optional(),
});

function resolveDateRange(input: z.infer<typeof dateRangeSchema>) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

const forecastQuerySchema = z.object({
  plantId: z.string().uuid().optional(),
  metric: z.enum(['co2e', 'kwh', 'energy_intensity', 'emissions_intensity']).default('co2e'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

function isSuperAdmin(authRoles: string[]) {
  return authRoles.includes('SUPERADMIN');
}

function ensureSummaryPlantScope(req: Parameters<typeof ensurePlantAccess>[0], requestedPlantId?: string) {
  const actor = req.auth!;
  if (requestedPlantId) {
    ensurePlantAccess(req, requestedPlantId);
    return requestedPlantId;
  }
  if (isSuperAdmin(actor.roles)) {
    return undefined;
  }
  const firstPlant = actor.plantIds[0] ?? null;
  ensurePlantAccess(req, firstPlant);
  return firstPlant ?? undefined;
}

async function resolveEmissionFactor(params: { factorKey?: string; sourceType: string; periodStart: Date; periodEnd: Date }) {
  const repo = AppDataSource.getRepository(EmissionsFactorEntity);
  const factorKey = params.factorKey ?? params.sourceType;
  const factor = await repo
    .createQueryBuilder('factor')
    .where('factor.is_active = :active', { active: true })
    .andWhere('LOWER(factor.factor_key) = :factorKey', { factorKey: factorKey.toLowerCase() })
    .andWhere('factor.valid_from <= :periodEnd', { periodEnd: params.periodEnd })
    .andWhere('(factor.valid_to IS NULL OR factor.valid_to >= :periodStart)', { periodStart: params.periodStart })
    .orderBy('factor.valid_from', 'DESC')
    .getOne();

  if (!factor) {
    return null;
  }

  const value = Number(factor.value);
  return Number.isFinite(value) ? { key: factor.factorKey, value } : null;
}

export const esgAdvancedRouter = Router();
esgAdvancedRouter.use(requireAuth);

esgAdvancedRouter.post('/esg/energy-readings', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = energyReadingSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId);

    const repo = AppDataSource.getRepository(EnergyMeterReadingEntity);
    const created = repo.create({
      plantId: body.plantId,
      meterId: body.meterId,
      capturedAt: new Date(body.capturedAt),
      kwh: body.kwh.toFixed(3),
      demandKw: body.demandKw === undefined || body.demandKw === null ? null : body.demandKw.toFixed(3),
      notes: body.notes ?? null,
      isActive: true,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Energy meter reading created'));
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/energy-readings', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const list = parseListQuery(req.query as Record<string, unknown>);
    const filters = dateRangeSchema
      .extend({
        meterId: z.string().trim().min(1).optional(),
      })
      .parse(req.query);
    const range = resolveDateRange(filters);
    const scopedPlantId = ensureSummaryPlantScope(req, filters.plantId);

    const repo = AppDataSource.getRepository(EnergyMeterReadingEntity);
    const qb = repo
      .createQueryBuilder('reading')
      .where('reading.is_active = :active', { active: true })
      .andWhere('reading.captured_at >= :from', { from: range.from })
      .andWhere('reading.captured_at <= :to', { to: range.to });

    if (scopedPlantId) {
      qb.andWhere('reading.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('reading.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }
    if (filters.meterId) {
      qb.andWhere('LOWER(reading.meter_id) = :meterId', { meterId: filters.meterId.toLowerCase() });
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb.skip((list.page - 1) * list.limit).take(list.limit).orderBy('reading.captured_at', 'DESC');
    const [data, totalRaw] = await Promise.all([qb.getMany(), totalQb.getRawOne<{ count: string | number }>()]);
    res.json(ok(data, 'Energy meter readings fetched', buildPagination(list.page, list.limit, Number(totalRaw?.count ?? 0))));
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.post('/esg/ghg-activity', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = ghgActivitySchema.parse(req.body);
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (periodEnd < periodStart) {
      res.status(400).json({ success: false, message: 'periodEnd must be after periodStart' });
      return;
    }
    ensurePlantAccess(req, body.plantId);

    const factor = body.factorValue !== undefined ? { key: body.factorKey ?? body.sourceType, value: body.factorValue } : await resolveEmissionFactor({ factorKey: body.factorKey, sourceType: body.sourceType, periodStart, periodEnd });
    const factorValue = factor?.value ?? 0;
    const computed = body.quantity * factorValue;

    const repo = AppDataSource.getRepository(GhgActivityDataEntity);
    const created = repo.create({
      plantId: body.plantId,
      sourceType: body.sourceType,
      scopeCategory: body.scopeCategory,
      quantity: body.quantity.toFixed(3),
      unit: body.unit,
      periodStart,
      periodEnd,
      computedCo2e: computed.toFixed(6),
      factorUsed: factor ? `${factor.key}:${factor.value}` : null,
      productionOutput: body.productionOutput !== undefined ? body.productionOutput.toFixed(3) : null,
      isActive: true,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'GHG activity created'));
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/intensity', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);

    const ghgRepo = AppDataSource.getRepository(GhgActivityDataEntity);
    const energyRepo = AppDataSource.getRepository(EnergyMeterReadingEntity);

    const ghgQb = ghgRepo
      .createQueryBuilder('ghg')
      .where('ghg.is_active = :active', { active: true })
      .andWhere('ghg.period_start <= :to', { to: range.to })
      .andWhere('ghg.period_end >= :from', { from: range.from });
    if (scopedPlantId) {
      ghgQb.andWhere('ghg.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        ghgQb.andWhere('1=0');
      } else {
        ghgQb.andWhere('ghg.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const energyQb = energyRepo
      .createQueryBuilder('reading')
      .where('reading.is_active = :active', { active: true })
      .andWhere('reading.captured_at >= :from', { from: range.from })
      .andWhere('reading.captured_at <= :to', { to: range.to });
    if (scopedPlantId) {
      energyQb.andWhere('reading.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        energyQb.andWhere('1=0');
      } else {
        energyQb.andWhere('reading.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const [ghgAgg, energyAgg] = await Promise.all([
      ghgQb
        .select([
          'SUM(CAST(ghg.computed_co2e AS decimal(18,6))) AS "totalCo2e"',
          'SUM(CAST(ghg.production_output AS decimal(18,6))) AS "totalOutput"',
        ])
        .getRawOne<{ totalCo2e: string | null; totalOutput: string | null }>(),
      energyQb
        .select(['SUM(CAST(reading.kwh AS decimal(18,6))) AS "totalKwh"'])
        .getRawOne<{ totalKwh: string | null }>(),
    ]);

    const totalCo2e = safeNumber(ghgAgg?.totalCo2e);
    const totalOutput = safeNumber(ghgAgg?.totalOutput);
    const totalKwh = safeNumber(energyAgg?.totalKwh);

    res.json(
      ok({
        from: range.from,
        to: range.to,
        plantId: scopedPlantId ?? null,
        totalCo2e: Number(totalCo2e.toFixed(6)),
        totalKwh: Number(totalKwh.toFixed(3)),
        totalProductionOutput: Number(totalOutput.toFixed(3)),
        emissionsIntensity: totalOutput > 0 ? Number((totalCo2e / totalOutput).toFixed(6)) : null,
        energyIntensity: totalOutput > 0 ? Number((totalKwh / totalOutput).toFixed(6)) : null,
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/forecast', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = forecastQuerySchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);

    const points: Array<{ x: number; y: number; label: string }> = [];
    if (query.metric === 'kwh') {
      const repo = AppDataSource.getRepository(EnergyMeterReadingEntity);
      const qb = repo
        .createQueryBuilder('reading')
        .where('reading.is_active = :active', { active: true })
        .andWhere('reading.captured_at >= :from', { from: range.from })
        .andWhere('reading.captured_at <= :to', { to: range.to });
      if (scopedPlantId) {
        qb.andWhere('reading.plant_id = :plantId', { plantId: scopedPlantId });
      } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
        if (!req.auth?.plantIds.length) {
          qb.andWhere('1=0');
        } else {
          qb.andWhere('reading.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
        }
      }
      const rows = await qb
        .select([`TO_CHAR(reading.captured_at, 'YYYY-MM-DD') AS day`, 'SUM(CAST(reading.kwh AS decimal(18,6))) AS "value"'])
        .groupBy(`TO_CHAR(reading.captured_at, 'YYYY-MM-DD')`)
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; value: string }>();
      rows.forEach((row, index) => points.push({ x: index + 1, y: safeNumber(row.value), label: row.day }));
    } else {
      const repo = AppDataSource.getRepository(GhgActivityDataEntity);
      const qb = repo
        .createQueryBuilder('ghg')
        .where('ghg.is_active = :active', { active: true })
        .andWhere('ghg.period_start <= :to', { to: range.to })
        .andWhere('ghg.period_end >= :from', { from: range.from });
      if (scopedPlantId) {
        qb.andWhere('ghg.plant_id = :plantId', { plantId: scopedPlantId });
      } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
        if (!req.auth?.plantIds.length) {
          qb.andWhere('1=0');
        } else {
          qb.andWhere('ghg.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
        }
      }
      const rows = await qb
        .select([
          `TO_CHAR(ghg.period_start, 'YYYY-MM-DD') AS day`,
          query.metric === 'co2e'
            ? 'SUM(CAST(ghg.computed_co2e AS decimal(18,6))) AS "value"'
            : query.metric === 'emissions_intensity'
              ? 'SUM(CAST(ghg.computed_co2e AS decimal(18,6))) / NULLIF(SUM(CAST(ghg.production_output AS decimal(18,6))), 0) AS "value"'
              : 'SUM(CAST(ghg.quantity AS decimal(18,6))) AS "value"',
        ])
        .groupBy(`TO_CHAR(ghg.period_start, 'YYYY-MM-DD')`)
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; value: string }>();
      rows.forEach((row, index) => points.push({ x: index + 1, y: safeNumber(row.value), label: row.day }));
    }

    const regression = linearRegression(points.map((point) => ({ x: point.x, y: point.y })));
    const forecastPoints = points.map((point) => ({
      day: point.label,
      actual: Number(point.y.toFixed(6)),
      forecast: Number((regression.intercept + regression.slope * point.x).toFixed(6)),
    }));

    const extensionStart = points.length + 1;
    for (let i = 0; i < 7; i += 1) {
      const x = extensionStart + i;
      forecastPoints.push({
        day: `T+${i + 1}`,
        actual: null,
        forecast: Number((regression.intercept + regression.slope * x).toFixed(6)),
      });
    }

    res.json(
      ok({
        metric: query.metric,
        from: range.from,
        to: range.to,
        trendSlope: Number(regression.slope.toFixed(8)),
        forecast: forecastPoints,
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/ghg-activity', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const list = parseListQuery(req.query as Record<string, unknown>);
    const filters = dateRangeSchema
      .extend({
        sourceType: z.string().trim().min(1).optional(),
      })
      .parse(req.query);
    const range = resolveDateRange(filters);
    const scopedPlantId = ensureSummaryPlantScope(req, filters.plantId);

    const repo = AppDataSource.getRepository(GhgActivityDataEntity);
    const qb = repo
      .createQueryBuilder('ghg')
      .where('ghg.is_active = :active', { active: true })
      .andWhere('ghg.period_start <= :to', { to: range.to })
      .andWhere('ghg.period_end >= :from', { from: range.from });

    if (scopedPlantId) {
      qb.andWhere('ghg.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('ghg.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }
    if (filters.sourceType) {
      qb.andWhere('LOWER(ghg.source_type) = :sourceType', { sourceType: filters.sourceType.toLowerCase() });
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb.skip((list.page - 1) * list.limit).take(list.limit).orderBy('ghg.period_start', 'DESC');
    const [data, totalRaw] = await Promise.all([qb.getMany(), totalQb.getRawOne<{ count: string | number }>()]);
    res.json(ok(data, 'GHG activity fetched', buildPagination(list.page, list.limit, Number(totalRaw?.count ?? 0))));
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/ghg/summary', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);
    const repo = AppDataSource.getRepository(GhgActivityDataEntity);

    const qb = repo
      .createQueryBuilder('ghg')
      .leftJoin('plants', 'plant', 'plant.id = ghg.plant_id')
      .where('ghg.is_active = :active', { active: true })
      .andWhere('ghg.period_start <= :to', { to: range.to })
      .andWhere('ghg.period_end >= :from', { from: range.from });
    if (scopedPlantId) {
      qb.andWhere('ghg.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('ghg.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const sourceBreakdown = await qb
      .clone()
      .select(['ghg.source_type AS "sourceType"', 'SUM(CAST(ghg.computed_co2e AS decimal(18,6))) AS "totalCo2e"'])
      .groupBy('ghg.source_type')
      .orderBy('totalCo2e', 'DESC')
      .getRawMany<{ sourceType: string; totalCo2e: string }>();

    const plantBreakdown = await qb
      .clone()
      .select(['ghg.plant_id AS "plantId"', 'plant.plant_name AS "plantName"', 'SUM(CAST(ghg.computed_co2e AS decimal(18,6))) AS "totalCo2e"'])
      .groupBy('ghg.plant_id')
      .addGroupBy('plant.plant_name')
      .orderBy('totalCo2e', 'DESC')
      .getRawMany<{ plantId: string; plantName: string; totalCo2e: string }>();

    const totalCo2e = sourceBreakdown.reduce((acc, row) => acc + Number(row.totalCo2e || 0), 0);
    res.json(
      ok({
        from: range.from,
        to: range.to,
        totalCo2e: Number(totalCo2e.toFixed(6)),
        sourceBreakdown: sourceBreakdown.map((item) => ({ sourceType: item.sourceType, totalCo2e: Number(Number(item.totalCo2e || 0).toFixed(6)) })),
        plantBreakdown: plantBreakdown.map((item) => ({ plantId: item.plantId, plantName: item.plantName, totalCo2e: Number(Number(item.totalCo2e || 0).toFixed(6)) })),
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/esg/energy/summary', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);
    const repo = AppDataSource.getRepository(EnergyMeterReadingEntity);

    const qb = repo
      .createQueryBuilder('reading')
      .leftJoin('plants', 'plant', 'plant.id = reading.plant_id')
      .where('reading.is_active = :active', { active: true })
      .andWhere('reading.captured_at >= :from', { from: range.from })
      .andWhere('reading.captured_at <= :to', { to: range.to });
    if (scopedPlantId) {
      qb.andWhere('reading.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('reading.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const meterBreakdown = await qb
      .clone()
      .select(['reading.meter_id AS "meterId"', 'SUM(CAST(reading.kwh AS decimal(18,3))) AS "totalKwh"', 'AVG(CAST(reading.demand_kw AS decimal(18,3))) AS "avgDemandKw"'])
      .groupBy('reading.meter_id')
      .orderBy('totalKwh', 'DESC')
      .getRawMany<{ meterId: string; totalKwh: string; avgDemandKw: string | null }>();

    const plantBreakdown = await qb
      .clone()
      .select(['reading.plant_id AS "plantId"', 'plant.plant_name AS "plantName"', 'SUM(CAST(reading.kwh AS decimal(18,3))) AS "totalKwh"'])
      .groupBy('reading.plant_id')
      .addGroupBy('plant.plant_name')
      .orderBy('totalKwh', 'DESC')
      .getRawMany<{ plantId: string; plantName: string; totalKwh: string }>();

    const totalKwh = meterBreakdown.reduce((acc, row) => acc + Number(row.totalKwh || 0), 0);
    res.json(
      ok({
        from: range.from,
        to: range.to,
        totalKwh: Number(totalKwh.toFixed(3)),
        meterBreakdown: meterBreakdown.map((item) => ({
          meterId: item.meterId,
          totalKwh: Number(Number(item.totalKwh || 0).toFixed(3)),
          avgDemandKw: item.avgDemandKw ? Number(Number(item.avgDemandKw).toFixed(3)) : null,
        })),
        plantBreakdown: plantBreakdown.map((item) => ({ plantId: item.plantId, plantName: item.plantName, totalKwh: Number(Number(item.totalKwh || 0).toFixed(3)) })),
      }),
    );
  } catch (error) {
    next(error);
  }
});

  esgAdvancedRouter.post('/esg/reports/generate', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = reportGenerateSchema.parse(req.body);
    const plantId = ensureSummaryPlantScope(req, body.plantId);
    if (!plantId) {
      res.status(400).json({ success: false, message: 'plantId is required for report generation' });
      return;
    }
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (periodEnd < periodStart) {
      res.status(400).json({ success: false, message: 'periodEnd must be after periodStart' });
      return;
    }

    let summary: Record<string, unknown> = {};
    if (body.reportType === 'GHG') {
      const ghgRepo = AppDataSource.getRepository(GhgActivityDataEntity);
      const qb = ghgRepo
        .createQueryBuilder('ghg')
        .where('ghg.is_active = :active', { active: true })
        .andWhere('ghg.period_start <= :to', { to: periodEnd })
        .andWhere('ghg.period_end >= :from', { from: periodStart });
      if (plantId) {
        qb.andWhere('ghg.plant_id = :plantId', { plantId });
      }
      const rows = await qb.getMany();
      const totalCo2e = rows.reduce((acc, row) => acc + Number(row.computedCo2e || 0), 0);
      summary = { totalCo2e: Number(totalCo2e.toFixed(6)), entries: rows.length };
    } else {
      const energyRepo = AppDataSource.getRepository(EnergyMeterReadingEntity);
      const qb = energyRepo
        .createQueryBuilder('reading')
        .where('reading.is_active = :active', { active: true })
        .andWhere('reading.captured_at >= :from', { from: periodStart })
        .andWhere('reading.captured_at <= :to', { to: periodEnd });
      if (plantId) {
        qb.andWhere('reading.plant_id = :plantId', { plantId });
      }
      const rows = await qb.getMany();
      const totalKwh = rows.reduce((acc, row) => acc + Number(row.kwh || 0), 0);
      summary = { totalKwh: Number(totalKwh.toFixed(3)), entries: rows.length };
    }

    const reportRepo = AppDataSource.getRepository(EsgReportEntity);
    const created = reportRepo.create({
      plantId,
      reportType: body.reportType,
      periodStart,
      periodEnd,
      generatedAt: new Date(),
      generatedBy: req.auth?.userId ?? null,
      storagePath: body.storagePath ?? null,
      summary,
    });
    await reportRepo.save(created);
    res.status(201).json(ok(created, 'ESG report generated'));
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/exports/esg/ghg', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'EXPORT'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);

    const repo = AppDataSource.getRepository(GhgActivityDataEntity);
    const qb = repo
      .createQueryBuilder('ghg')
      .leftJoin('plants', 'plant', 'plant.id = ghg.plant_id')
      .where('ghg.is_active = :active', { active: true })
      .andWhere('ghg.period_start <= :to', { to: range.to })
      .andWhere('ghg.period_end >= :from', { from: range.from });

    if (scopedPlantId) {
      qb.andWhere('ghg.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('ghg.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const rows = await qb
      .select([
        'plant.plant_name AS "plantName"',
        'ghg.source_type AS "sourceType"',
        'ghg.quantity AS quantity',
        'ghg.unit AS unit',
        'ghg.computed_co2e AS "computedCo2e"',
        'ghg.factor_used AS "factorUsed"',
        'ghg.period_start AS "periodStart"',
        'ghg.period_end AS "periodEnd"',
      ])
      .orderBy('ghg.period_start', 'DESC')
      .getRawMany<Record<string, unknown>>();

    const csv = toCsv(
      ['Plant', 'SourceType', 'Quantity', 'Unit', 'ComputedCO2e', 'FactorUsed', 'PeriodStart', 'PeriodEnd'],
      rows.map((row) => [row.plantName, row.sourceType, row.quantity, row.unit, row.computedCo2e, row.factorUsed, row.periodStart, row.periodEnd]),
    );
    const fileName = `esg-ghg-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/exports/esg/energy', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'EXPORT'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);

    const repo = AppDataSource.getRepository(EnergyMeterReadingEntity);
    const qb = repo
      .createQueryBuilder('reading')
      .leftJoin('plants', 'plant', 'plant.id = reading.plant_id')
      .where('reading.is_active = :active', { active: true })
      .andWhere('reading.captured_at >= :from', { from: range.from })
      .andWhere('reading.captured_at <= :to', { to: range.to });

    if (scopedPlantId) {
      qb.andWhere('reading.plant_id = :plantId', { plantId: scopedPlantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('reading.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }

    const rows = await qb
      .select([
        'plant.plant_name AS "plantName"',
        'reading.meter_id AS "meterId"',
        'reading.captured_at AS "capturedAt"',
        'reading.kwh AS kwh',
        'reading.demand_kw AS "demandKw"',
      ])
      .orderBy('reading.captured_at', 'DESC')
      .getRawMany<Record<string, unknown>>();

    const csv = toCsv(
      ['Plant', 'MeterId', 'CapturedAt', 'Kwh', 'DemandKw'],
      rows.map((row) => [row.plantName, row.meterId, row.capturedAt, row.kwh, row.demandKw]),
    );
    const fileName = `esg-energy-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

esgAdvancedRouter.get('/exports/esg/executive-report', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ESG', 'EXPORT'), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const range = resolveDateRange(query);
    const scopedPlantId = ensureSummaryPlantScope(req, query.plantId);

    const ghgRepo = AppDataSource.getRepository(GhgActivityDataEntity);
    const energyRepo = AppDataSource.getRepository(EnergyMeterReadingEntity);

    const [ghgTotal, energyTotal] = await Promise.all([
      ghgRepo
        .createQueryBuilder('ghg')
        .where('ghg.is_active = :active', { active: true })
        .andWhere('ghg.period_start <= :to', { to: range.to })
        .andWhere('ghg.period_end >= :from', { from: range.from })
        .andWhere(scopedPlantId ? 'ghg.plant_id = :plantId' : '1=1', { plantId: scopedPlantId })
        .select(['SUM(CAST(ghg.computed_co2e AS decimal(18,6))) AS "totalCo2e"', 'SUM(CAST(ghg.production_output AS decimal(18,6))) AS "totalOutput"'])
        .getRawOne<{ totalCo2e: string | null; totalOutput: string | null }>(),
      energyRepo
        .createQueryBuilder('reading')
        .where('reading.is_active = :active', { active: true })
        .andWhere('reading.captured_at >= :from', { from: range.from })
        .andWhere('reading.captured_at <= :to', { to: range.to })
        .andWhere(scopedPlantId ? 'reading.plant_id = :plantId' : '1=1', { plantId: scopedPlantId })
        .select(['SUM(CAST(reading.kwh AS decimal(18,6))) AS "totalKwh"'])
        .getRawOne<{ totalKwh: string | null }>(),
    ]);

    const totalCo2e = safeNumber(ghgTotal?.totalCo2e);
    const totalOutput = safeNumber(ghgTotal?.totalOutput);
    const totalKwh = safeNumber(energyTotal?.totalKwh);

    const lines = [
      'CMMS ESG Executive Report',
      `Generated: ${new Date().toISOString()}`,
      `Plant Scope: ${scopedPlantId ?? 'ALL'}`,
      `Period: ${range.from.toISOString()} to ${range.to.toISOString()}`,
      `Total CO2e: ${totalCo2e.toFixed(6)}`,
      `Total Energy (kWh): ${totalKwh.toFixed(3)}`,
      `Total Output: ${totalOutput.toFixed(3)}`,
      `Emissions Intensity: ${totalOutput > 0 ? (totalCo2e / totalOutput).toFixed(6) : 'NA'}`,
      `Energy Intensity: ${totalOutput > 0 ? (totalKwh / totalOutput).toFixed(6) : 'NA'}`,
    ];
    const pdf = createSimplePdf(lines);
    const filename = `esg-executive-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
});
