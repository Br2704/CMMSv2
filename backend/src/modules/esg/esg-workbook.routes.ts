import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  EsgAuthorizedUserEntity,
  EsgDailyEntryEntity,
  EsgMonthlySummaryEntity,
  EsgOrganizationTargetEntryEntity,
  EsgPlantTargetEntryEntity,
  PlantEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { HttpError } from '../../utils/httpError';
import { resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import {
  ESG_WORKBOOK_DERIVED_METRICS,
  ESG_WORKBOOK_INPUT_METRICS,
  ESG_WORKBOOK_METRICS,
  ESG_WORKBOOK_METRIC_MAP,
  type EsgWorkbookMetricCode,
} from './esg-workbook';

const WORKBOOK_CATEGORIES = ['PRODUCTION', 'ENERGY', 'EMISSIONS', 'WATER', 'WASTE', 'MATERIALS', 'RENEWABLES'] as const;
type WorkbookCategory = (typeof WORKBOOK_CATEGORIES)[number];
const WORKBOOK_INPUT_CODES = ESG_WORKBOOK_INPUT_METRICS.map((metric) => metric.code) as [EsgWorkbookMetricCode, ...EsgWorkbookMetricCode[]];
const WORKBOOK_ALL_CODES = ESG_WORKBOOK_METRICS.map((metric) => metric.code) as [EsgWorkbookMetricCode, ...EsgWorkbookMetricCode[]];

const optionalUuidQuery = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== 'string') return undefined;
  const trimmed = scalar.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') return undefined;
  return trimmed;
}, z.string().uuid().optional());

const workbookSummaryQuerySchema = z.object({
  plantId: optionalUuidQuery,
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

const workbookDailyQuerySchema = workbookSummaryQuerySchema.extend({
  category: z.enum(WORKBOOK_CATEGORIES).optional(),
});

const workbookEntryValueSchema = z.object({
  metricCode: z.enum(WORKBOOK_INPUT_CODES),
  value: z.coerce.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

const workbookDailySaveSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  entryDate: z.string().date(),
  entries: z.array(workbookEntryValueSchema).min(1),
});

const workbookPlantTargetSchema = z.object({
  plantId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2200),
  metricCode: z.enum(WORKBOOK_ALL_CODES),
  targetValue: z.coerce.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

const workbookOrganizationTargetSchema = z.object({
  organizationId: z.string().uuid().nullable().optional(),
  year: z.coerce.number().int().min(2000).max(2200),
  metricCode: z.enum(WORKBOOK_ALL_CODES),
  targetValue: z.coerce.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toDecimal(value: number, scale = 6) {
  return Number.isFinite(value) ? value.toFixed(scale) : '0.000000';
}

function toPermissionCategory(category: WorkbookCategory) {
  if (category === 'MATERIALS') return 'PRODUCTION';
  if (category === 'RENEWABLES') return 'ENERGY';
  return category;
}

function isHigherBetter(metricCode: string) {
  return ['PRODUCTION_TOTAL', 'PRODUCTION_IN_HOUSE', 'RE_ELECTRICITY', 'RE_PERCENT'].includes(metricCode);
}

async function ensureWorkbookCategoryAccess(req: Parameters<typeof ensurePlantAccess>[0], plantId: string, categories: WorkbookCategory[]) {
  const normalizedRoles = req.auth?.roles.map((role) => role.toUpperCase()) ?? [];
  if (normalizedRoles.includes('SUPER_ADMIN')) return;
  ensurePlantAccess(req, plantId);
  const authRepo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
  const authorizedRows = await authRepo.find({
    where: [
      { plantId, userId: req.auth!.userId, esgCategory: 'ALL' },
      ...categories.map((category) => ({ plantId, userId: req.auth!.userId, esgCategory: category })),
    ],
  });
  const allowed = new Set(authorizedRows.map((row) => row.esgCategory));
  const missing = categories.filter((category) => !(allowed.has(category) || allowed.has('ALL')));
  if (missing.length > 0) {
    throw new HttpError(403, 'ESG workbook data entry is not allowed for this category', {
      code: 'ESG_WORKBOOK_CATEGORY_ACCESS_DENIED',
      plantId,
      categories: missing,
    });
  }
}

function computeWorkbookDerivedMetrics(summary: Map<string, number>) {
  const productionTotal = summary.get('PRODUCTION_TOTAL') ?? 0;
  const electricityGross = summary.get('ELECTRICITY_GROSS') ?? 0;
  const totalElectricityConsumed = summary.get('TOTAL_ELECTRICITY_CONSUMED') ?? electricityGross;
  const reElectricity = summary.get('RE_ELECTRICITY') ?? 0;
  const electricityGj = summary.get('ELECTRICITY_GJ') ?? 0;
  const foGj = summary.get('FO_GJ') ?? 0;
  const otherFuelsGj = summary.get('OTHER_FUELS_GJ') ?? 0;
  const totalEmissions = summary.get('TOTAL_EMISSIONS') ?? 0;
  const rawWaterTotal = summary.get('TOTAL_RAW_WATER_SOURCED') ?? 0;
  const rawWaterDomestic = summary.get('RAW_WATER_DOMESTIC') ?? 0;
  const wasteGenerated = summary.get('TOTAL_WASTE_GENERATION') ?? 0;
  const processWaste = summary.get('PROCESS_WASTE') ?? 0;
  const rubberCompoundTotal = summary.get('RUBBER_COMPOUND_TOTAL') ?? 0;
  const rubberCompoundOtherPlants = summary.get('RUBBER_COMPOUND_OTHER_PLANTS') ?? 0;
  const foEquivalentFuel = summary.get('FO_EQUIVALENT_FUEL') ?? 0;
  const totalEnergyGj = electricityGj + foGj + otherFuelsGj;

  return new Map<string, number>([
    ['OTHER_PLANT_COMPOUND_PERCENT', rubberCompoundTotal > 0 ? (rubberCompoundOtherPlants / rubberCompoundTotal) * 100 : 0],
    ['RE_PERCENT', electricityGross > 0 ? (reElectricity / electricityGross) * 100 : 0],
    ['TOTAL_ENERGY_GJ', totalEnergyGj],
    ['SPECIFIC_ENERGY_POWER', productionTotal > 0 ? totalElectricityConsumed / productionTotal : 0],
    ['SPECIFIC_ENERGY_FO', productionTotal > 0 ? foEquivalentFuel / productionTotal : 0],
    ['SPECIFIC_ENERGY_TOTAL', productionTotal > 0 ? totalEnergyGj / productionTotal : 0],
    ['GHG_INTENSITY', productionTotal > 0 ? totalEmissions / productionTotal : 0],
    ['SPECIFIC_RAW_WATER', productionTotal > 0 ? rawWaterTotal / productionTotal : 0],
    ['DOMESTIC_WATER_PERCENT', rawWaterTotal > 0 ? (rawWaterDomestic / rawWaterTotal) * 100 : 0],
    ['OVERALL_WASTE_PERCENT', productionTotal > 0 ? (wasteGenerated / productionTotal) * 100 : 0],
    ['PROCESS_WASTE_PERCENT', productionTotal > 0 ? (processWaste / productionTotal) * 100 : 0],
  ]);
}

async function recalculateWorkbookMonthlySummary(plantId: string, year: number, month: number) {
  const dailyRepo = AppDataSource.getRepository(EsgDailyEntryEntity);
  const monthlyRepo = AppDataSource.getRepository(EsgMonthlySummaryEntity);
  const rows = await dailyRepo.find({
    where: { plantId, year, month },
    order: { entryDate: 'ASC', metricCode: 'ASC' },
  });

  const aggregated = new Map<string, number>();
  for (const metric of ESG_WORKBOOK_INPUT_METRICS) {
    const metricRows = rows.filter((row) => row.metricCode === metric.code);
    if (metric.aggregation === 'LAST') {
      const last = metricRows[metricRows.length - 1];
      aggregated.set(metric.code, toNumber(last?.value));
      continue;
    }
    aggregated.set(metric.code, metricRows.reduce((sum, row) => sum + toNumber(row.value), 0));
  }

  const derived = computeWorkbookDerivedMetrics(aggregated);
  const existing = await monthlyRepo.find({ where: { plantId, year, month } });
  const existingByCode = new Map(existing.map((row) => [row.metricCode, row]));
  const entities = [...ESG_WORKBOOK_INPUT_METRICS, ...ESG_WORKBOOK_DERIVED_METRICS].map((metric) => {
    const entity =
      existingByCode.get(metric.code) ??
      monthlyRepo.create({
        plantId,
        year,
        month,
        metricCode: metric.code,
      });
    entity.metricLabel = metric.label;
    entity.category = metric.category;
    entity.unit = metric.unit;
    entity.value = toDecimal(
      metric.aggregation === 'DERIVED' ? derived.get(metric.code) ?? 0 : aggregated.get(metric.code) ?? 0,
      6,
    );
    entity.valueSource = metric.aggregation === 'DERIVED' ? 'DERIVED' : 'DAILY';
    return entity;
  });

  await monthlyRepo.save(entities);
  return entities;
}

function hydrateSummaryRows(
  rows: EsgMonthlySummaryEntity[],
  plantTargets: Map<string, string>,
  organizationTargets: Map<string, string>,
) {
  return [...ESG_WORKBOOK_INPUT_METRICS, ...ESG_WORKBOOK_DERIVED_METRICS].map((metric) => {
    const row = rows.find((item) => item.metricCode === metric.code);
    const value = toNumber(row?.value);
    const plantTargetValue = plantTargets.get(metric.code) ?? null;
    const organizationTargetValue = organizationTargets.get(metric.code) ?? null;
    const effectiveTarget = plantTargetValue ?? organizationTargetValue;
    const targetNumber = effectiveTarget ? toNumber(effectiveTarget) : null;
    const higherBetter = isHigherBetter(metric.code);
    const status =
      targetNumber === null
        ? 'INFO'
        : higherBetter
          ? (value >= targetNumber ? 'ON_TRACK' : 'ALERT')
          : (value <= targetNumber ? 'ON_TRACK' : 'ALERT');

    return {
      metricCode: metric.code,
      metricLabel: metric.label,
      category: metric.category,
      unit: metric.unit,
      value: toDecimal(value, 6),
      plantTargetValue,
      organizationTargetValue,
      status,
    };
  });
}

async function getOrganizationTargetMap(organizationId: string | null, year: number) {
  if (!organizationId) return new Map<string, string>();
  const rows = await AppDataSource.getRepository(EsgOrganizationTargetEntryEntity).find({
    where: { organizationId, year },
  });
  return new Map(rows.map((row) => [row.metricCode, row.targetValue]));
}

export const esgWorkbookRouter = Router();
esgWorkbookRouter.use(requireAuth);

esgWorkbookRouter.get('/esg/workbook/catalog', requirePermission('ESG', 'READ'), async (_req, res) => {
  res.json(
    ok({
      inputMetrics: ESG_WORKBOOK_INPUT_METRICS,
      derivedMetrics: ESG_WORKBOOK_DERIVED_METRICS,
    }),
  );
});

esgWorkbookRouter.get('/esg/workbook/daily', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = workbookDailyQuerySchema.parse(req.query);
    const plantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, plantId);
    if (!plantId) {
      res.status(400).json({ success: false, message: 'plantId is required' });
      return;
    }
    const where = {
      plantId,
      year: query.year,
      month: query.month,
      ...(query.category ? { category: query.category } : {}),
    };
    const rows = await AppDataSource.getRepository(EsgDailyEntryEntity).find({
      where,
      order: { entryDate: 'ASC', metricCode: 'ASC' },
    });
    res.json(ok(rows, 'ESG workbook daily entries fetched'));
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.post('/esg/workbook/daily', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = workbookDailySaveSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    if (!plantId) {
      res.status(400).json({ success: false, message: 'plantId is required' });
      return;
    }
    const [year, month] = body.entryDate.split('-').slice(0, 2).map(Number);
    const metricDefs = body.entries.map((entry) => ESG_WORKBOOK_METRIC_MAP.get(entry.metricCode)).filter(Boolean);
    const categories = Array.from(new Set(metricDefs.map((metric) => toPermissionCategory(metric!.category as WorkbookCategory))));
    await ensureWorkbookCategoryAccess(req, plantId, categories);

    const repo = AppDataSource.getRepository(EsgDailyEntryEntity);
    const existing = await repo.find({
      where: {
        plantId,
        entryDate: body.entryDate,
        metricCode: In(body.entries.map((entry) => entry.metricCode)),
      },
    });
    const existingByCode = new Map(existing.map((row) => [row.metricCode, row]));
    const entities = body.entries.map((entry) => {
      const metric = ESG_WORKBOOK_METRIC_MAP.get(entry.metricCode)!;
      const entity =
        existingByCode.get(entry.metricCode) ??
        repo.create({
          plantId,
          entryDate: body.entryDate,
          year,
          month,
          metricCode: entry.metricCode,
          createdBy: req.auth!.userId,
        });
      entity.year = year;
      entity.month = month;
      entity.metricLabel = metric.label;
      entity.category = metric.category;
      entity.unit = metric.unit;
      entity.value = toDecimal(entry.value, 6);
      entity.notes = entry.notes ?? null;
      entity.updatedBy = req.auth!.userId;
      return entity;
    });
    await repo.save(entities);
    const summary = await recalculateWorkbookMonthlySummary(plantId, year, month);
    res.status(201).json(ok({ entries: entities, summary }, 'ESG workbook daily entries saved'));
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.get('/esg/workbook/summary', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = workbookSummaryQuerySchema.parse(req.query);
    const plantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, plantId);
    if (!plantId) {
      res.status(400).json({ success: false, message: 'plantId is required' });
      return;
    }
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const plant = await plantRepo.findOneBy({ id: plantId });
    const summaryRows = await recalculateWorkbookMonthlySummary(plantId, query.year, query.month);
    const plantTargetRows = await AppDataSource.getRepository(EsgPlantTargetEntryEntity).find({
      where: { plantId, year: query.year },
    });
    const organizationTargets = await getOrganizationTargetMap(plant?.organizationId ?? null, query.year);
    res.json(
      ok({
        plantId,
        organizationId: plant?.organizationId ?? null,
        year: query.year,
        month: query.month,
        rows: hydrateSummaryRows(
          summaryRows,
          new Map(plantTargetRows.map((row) => [row.metricCode, row.targetValue])),
          organizationTargets,
        ),
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.get('/esg/workbook/organization-summary', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = workbookSummaryQuerySchema.partial({ plantId: true }).parse(req.query);
    const year = query.year ?? new Date().getFullYear();
    const month = query.month ?? new Date().getMonth() + 1;
    const plantIds = resolvePlantFilter(req.auth!, undefined) ?? [];
    if (plantIds.length === 0) {
      res.json(ok({ year, month, rows: [] }));
      return;
    }

    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const plants = await plantRepo.findBy({ id: In(plantIds) });
    const plantMap = new Map(plants.map((plant) => [plant.id, plant]));
    await Promise.all(plantIds.map((plantId) => recalculateWorkbookMonthlySummary(plantId, year, month)));
    const summaryRows = await AppDataSource.getRepository(EsgMonthlySummaryEntity).find({
      where: { plantId: In(plantIds), year, month },
      order: { metricCode: 'ASC' },
    });

    const organizationId = req.auth?.organizationId ?? plants[0]?.organizationId ?? null;
    const organizationTargets = await getOrganizationTargetMap(organizationId, year);
    const grouped = new Map<string, Map<string, number>>();
    for (const plantId of plantIds) {
      grouped.set(plantId, new Map());
    }
    for (const row of summaryRows) {
      const metric = ESG_WORKBOOK_METRIC_MAP.get(row.metricCode as EsgWorkbookMetricCode);
      if (!metric || metric.aggregation === 'DERIVED') continue;
      const plantSummary = grouped.get(row.plantId) ?? new Map();
      plantSummary.set(row.metricCode, toNumber(row.value));
      grouped.set(row.plantId, plantSummary);
    }

    const organizationInputTotals = new Map<string, number>();
    for (const plantSummary of grouped.values()) {
      for (const metric of ESG_WORKBOOK_INPUT_METRICS) {
        organizationInputTotals.set(
          metric.code,
          (organizationInputTotals.get(metric.code) ?? 0) + (plantSummary.get(metric.code) ?? 0),
        );
      }
    }
    const organizationDerived = computeWorkbookDerivedMetrics(organizationInputTotals);
    const rows = [...ESG_WORKBOOK_INPUT_METRICS, ...ESG_WORKBOOK_DERIVED_METRICS].map((metric) => {
      const value =
        metric.aggregation === 'DERIVED'
          ? organizationDerived.get(metric.code) ?? 0
          : organizationInputTotals.get(metric.code) ?? 0;
      const targetValue = organizationTargets.get(metric.code) ?? null;
      const targetNumber = targetValue ? toNumber(targetValue) : null;
      const higherBetter = isHigherBetter(metric.code);
      const status =
        targetNumber === null
          ? 'INFO'
          : higherBetter
            ? (value >= targetNumber ? 'ON_TRACK' : 'ALERT')
            : (value <= targetNumber ? 'ON_TRACK' : 'ALERT');
      return {
        metricCode: metric.code,
        metricLabel: metric.label,
        category: metric.category,
        unit: metric.unit,
        value: toDecimal(value, 6),
        organizationTargetValue: targetValue,
        status,
      };
    });

    const plantBreakdown = plantIds.map((plantId) => ({
      plantId,
      plantName: plantMap.get(plantId)?.plantName ?? plantId,
      rows: hydrateSummaryRows(
        summaryRows.filter((row) => row.plantId === plantId),
        new Map(),
        organizationTargets,
      ),
    }));

    res.json(
      ok({
        organizationId,
        year,
        month,
        rows,
        plantBreakdown,
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.get('/esg/master/workbook-targets/plants', requireRole(['SUPER_ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = workbookSummaryQuerySchema.partial({ month: true }).parse(req.query);
    const where = {
      ...(query.plantId ? { plantId: query.plantId } : {}),
      ...(query.year ? { year: query.year } : {}),
    };
    const rows = await AppDataSource.getRepository(EsgPlantTargetEntryEntity).find({
      where,
      order: { year: 'DESC', plantId: 'ASC', metricCode: 'ASC' },
    });
    res.json(ok(rows, 'ESG workbook plant targets fetched'));
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.post('/esg/master/workbook-targets/plants', requireRole(['SUPER_ADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = workbookPlantTargetSchema.parse(req.body);
    const metric = ESG_WORKBOOK_METRIC_MAP.get(body.metricCode);
    if (!metric?.targetAllowed) {
      res.status(400).json({ success: false, message: 'Selected workbook metric does not support targets' });
      return;
    }
    const repo = AppDataSource.getRepository(EsgPlantTargetEntryEntity);
    const existing = await repo.findOneBy({ plantId: body.plantId, year: body.year, metricCode: body.metricCode });
    const entity =
      existing ??
      repo.create({
        plantId: body.plantId,
        year: body.year,
        metricCode: body.metricCode,
      });
    entity.metricLabel = metric.label;
    entity.category = metric.category;
    entity.unit = metric.unit;
    entity.targetValue = toDecimal(body.targetValue, 6);
    entity.notes = body.notes ?? null;
    await repo.save(entity);
    res.status(existing ? 200 : 201).json(ok(entity, existing ? 'ESG workbook plant target updated' : 'ESG workbook plant target created'));
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.get('/esg/master/workbook-targets/organization', requireRole(['SUPER_ADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = z.object({ organizationId: optionalUuidQuery, year: z.coerce.number().int().min(2000).max(2200).optional() }).parse(req.query);
    const organizationId = query.organizationId ?? req.auth?.organizationId ?? null;
    if (!organizationId) {
      res.json(ok([], 'ESG workbook organization targets fetched'));
      return;
    }
    const rows = await AppDataSource.getRepository(EsgOrganizationTargetEntryEntity).find({
      where: {
        organizationId,
        ...(query.year ? { year: query.year } : {}),
      },
      order: { year: 'DESC', metricCode: 'ASC' },
    });
    res.json(ok(rows, 'ESG workbook organization targets fetched'));
  } catch (error) {
    next(error);
  }
});

esgWorkbookRouter.post('/esg/master/workbook-targets/organization', requireRole(['SUPER_ADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = workbookOrganizationTargetSchema.parse(req.body);
    const organizationId = body.organizationId ?? req.auth?.organizationId ?? null;
    if (!organizationId) {
      res.status(400).json({ success: false, message: 'organizationId is required' });
      return;
    }
    const metric = ESG_WORKBOOK_METRIC_MAP.get(body.metricCode);
    if (!metric?.targetAllowed) {
      res.status(400).json({ success: false, message: 'Selected workbook metric does not support targets' });
      return;
    }
    const repo = AppDataSource.getRepository(EsgOrganizationTargetEntryEntity);
    const existing = await repo.findOneBy({ organizationId, year: body.year, metricCode: body.metricCode });
    const entity =
      existing ??
      repo.create({
        organizationId,
        year: body.year,
        metricCode: body.metricCode,
      });
    entity.metricLabel = metric.label;
    entity.category = metric.category;
    entity.unit = metric.unit;
    entity.targetValue = toDecimal(body.targetValue, 6);
    entity.notes = body.notes ?? null;
    await repo.save(entity);
    res.status(existing ? 200 : 201).json(ok(entity, existing ? 'ESG workbook organization target updated' : 'ESG workbook organization target created'));
  } catch (error) {
    next(error);
  }
});
