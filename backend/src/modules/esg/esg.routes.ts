// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  EsgAuthorizedUserEntity,
  EsgEmissionDataEntity,
  EsgEmissionFactorEntity,
  EsgEnergyDataEntity,
  EsgKpiMasterEntity,
  EsgKpiResultEntity,
  EsgProductionDataEntity,
  EsgTargetEntity,
  EsgWasteDataEntity,
  EsgWaterDataEntity,
  NotificationEntity,
  PlantEntity,
  ProfileEntity,
  UserRoleEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { toCsv } from '../../utils/csvExport';
import { HttpError } from '../../utils/httpError';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { createSimplePdf } from '../../utils/pdf';
import { getReportBranding } from '../../utils/reportBranding';
import { resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import { normalizeRoleName } from '../../utils/rbac';

const ESG_CATEGORIES = ['ENERGY', 'WATER', 'EMISSIONS', 'WASTE', 'PRODUCTION', 'RENEWABLES'] as const;
const DATA_SECTIONS = ['energy', 'water', 'emissions', 'waste', 'production'] as const;
type EsgCategory = (typeof ESG_CATEGORIES)[number];
type DataSection = (typeof DATA_SECTIONS)[number];

const positiveNumber = z.coerce.number().min(0).default(0);
const optionalUuidQuery = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== 'string') return undefined;
  const trimmed = scalar.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') return undefined;
  return trimmed;
}, z.string().uuid().optional());

const listFiltersSchema = z.object({
  plantId: optionalUuidQuery,
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  search: z.string().optional(),
});

const kpiMasterSchema = z.object({
  kpiName: z.string().min(1),
  kpiCategory: z.string().min(1),
  formula: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const targetSchema = z.object({
  plantId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2200),
  targetEnergyReduction: z.coerce.number().min(0).nullable().optional(),
  targetWaterReduction: z.coerce.number().min(0).nullable().optional(),
  targetEmissionReduction: z.coerce.number().min(0).nullable().optional(),
  targetWasteReduction: z.coerce.number().min(0).nullable().optional(),
  renewableTarget: z.coerce.number().min(0).nullable().optional(),
});

const emissionFactorSchema = z.object({
  energyType: z.string().min(1),
  unit: z.string().min(1),
  co2Factor: z.coerce.number().min(0),
  source: z.string().nullable().optional(),
  effectiveDate: z.string().date(),
  isActive: z.boolean().default(true),
});

const authorizedUserSchema = z.object({
  plantId: z.string().uuid(),
  userId: z.string().uuid(),
  esgCategory: z.enum(ESG_CATEGORIES).or(z.literal('ALL')),
});

const monthlyPeriodSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

const energyDataSchema = monthlyPeriodSchema.extend({
  gridElectricityKwh: positiveNumber,
  dieselConsumptionLitre: positiveNumber,
  coalConsumption: positiveNumber,
  gasConsumption: positiveNumber,
  steamConsumption: positiveNumber,
  solarGeneration: positiveNumber,
  windGeneration: positiveNumber,
  greenEnergyPurchase: positiveNumber,
});

const waterDataSchema = monthlyPeriodSchema.extend({
  freshWaterIntake: positiveNumber,
  groundWater: positiveNumber,
  municipalWater: positiveNumber,
  recycledWater: positiveNumber,
  rainWater: positiveNumber,
  waterDischarge: positiveNumber,
});

const emissionDataSchema = monthlyPeriodSchema.extend({
  scope1Emissions: positiveNumber,
  scope2Emissions: positiveNumber,
  scope3Emissions: positiveNumber,
  boilerNox: positiveNumber,
  boilerSox: positiveNumber,
  boilerPm: positiveNumber,
  stackEmission: positiveNumber,
});

const wasteDataSchema = monthlyPeriodSchema.extend({
  hazardousWaste: positiveNumber,
  nonHazardousWaste: positiveNumber,
  recycledWaste: positiveNumber,
  landfillWaste: positiveNumber,
  incineratedWaste: positiveNumber,
});

const productionDataSchema = monthlyPeriodSchema.extend({
  productionQuantity: positiveNumber,
  operatingHours: positiveNumber,
  machineUtilization: z.coerce.number().min(0).max(100).default(0),
});

const lockSchema = monthlyPeriodSchema.extend({
  section: z.enum(DATA_SECTIONS),
  locked: z.boolean(),
});

const reportSchema = z.object({
  plantId: optionalUuidQuery,
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12).optional(),
  reportType: z.enum(['MONTHLY', 'ANNUAL', 'GHG', 'WATER', 'WASTE']).default('MONTHLY'),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

function toDecimal(value: number | string | null | undefined, scale = 6): string | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(scale);
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function hasNormalizedRole(roles: string[], expected: string[]) {
  const normalizedRoles = roles.map((role) => normalizeRoleName(role));
  return expected.some((role) => normalizedRoles.includes(normalizeRoleName(role)));
}

function isSuperAdminRequest(req: Parameters<typeof ensurePlantAccess>[0]) {
  return hasNormalizedRole(req.auth?.roles ?? [], ['SUPERADMIN']);
}

async function ensureAuthorizedForCategory(
  req: Parameters<typeof ensurePlantAccess>[0],
  plantId: string,
  category: EsgCategory,
) {
  if (isSuperAdminRequest(req)) return;
  ensurePlantAccess(req, plantId);
  const repo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
  const row = await repo.findOne({
    where: [
      { plantId, userId: req.auth!.userId, esgCategory: category },
      { plantId, userId: req.auth!.userId, esgCategory: 'ALL' },
    ],
  });
  if (!row) {
    throw new HttpError(403, 'ESG data entry is not allowed for this category', {
      code: 'ESG_CATEGORY_ACCESS_DENIED',
      plantId,
      category,
    });
  }
}

async function getPeriodData(plantId: string, year: number, month: number) {
  const [energy, water, emissions, waste, production, kpis] = await Promise.all([
    AppDataSource.getRepository(EsgEnergyDataEntity).findOneBy({ plantId, year, month }),
    AppDataSource.getRepository(EsgWaterDataEntity).findOneBy({ plantId, year, month }),
    AppDataSource.getRepository(EsgEmissionDataEntity).findOneBy({ plantId, year, month }),
    AppDataSource.getRepository(EsgWasteDataEntity).findOneBy({ plantId, year, month }),
    AppDataSource.getRepository(EsgProductionDataEntity).findOneBy({ plantId, year, month }),
    AppDataSource.getRepository(EsgKpiResultEntity).find({
      where: { plantId, year, month },
      order: { kpiName: 'ASC' },
    }),
  ]);
  return { energy, water, emissions, waste, production, kpis };
}

async function getEmissionFactorMap(referenceDate: string) {
  const repo = AppDataSource.getRepository(EsgEmissionFactorEntity);
  const factors = await repo
    .createQueryBuilder('factor')
    .where('factor.is_active = :active', { active: true })
    .andWhere('factor.effective_date <= :referenceDate', { referenceDate })
    .orderBy('factor.effective_date', 'DESC')
    .getMany();

  const map = new Map<string, number>();
  for (const factor of factors) {
    const key = factor.energyType.trim().toUpperCase();
    if (!map.has(key)) {
      map.set(key, toNumber(factor.co2Factor));
    }
  }
  return map;
}

function computeDerivedMetrics(input: {
  energy?: EsgEnergyDataEntity | null;
  water?: EsgWaterDataEntity | null;
  emissions?: EsgEmissionDataEntity | null;
  waste?: EsgWasteDataEntity | null;
  production?: EsgProductionDataEntity | null;
  factorMap: Map<string, number>;
}) {
  const totalEnergy =
    toNumber(input.energy?.gridElectricityKwh) +
    toNumber(input.energy?.dieselConsumptionLitre) +
    toNumber(input.energy?.coalConsumption) +
    toNumber(input.energy?.gasConsumption) +
    toNumber(input.energy?.steamConsumption) +
    toNumber(input.energy?.greenEnergyPurchase);
  const renewableEnergy =
    toNumber(input.energy?.solarGeneration) +
    toNumber(input.energy?.windGeneration) +
    toNumber(input.energy?.greenEnergyPurchase);
  const productionQuantity = toNumber(input.production?.productionQuantity);
  const totalWater =
    toNumber(input.water?.freshWaterIntake) +
    toNumber(input.water?.groundWater) +
    toNumber(input.water?.municipalWater) +
    toNumber(input.water?.recycledWater) +
    toNumber(input.water?.rainWater);
  const manualEmissions =
    toNumber(input.emissions?.scope1Emissions) +
    toNumber(input.emissions?.scope2Emissions) +
    toNumber(input.emissions?.scope3Emissions);
  const derivedEmissions =
    toNumber(input.energy?.gridElectricityKwh) * (input.factorMap.get('ELECTRICITY') ?? 0) +
    toNumber(input.energy?.dieselConsumptionLitre) * (input.factorMap.get('DIESEL') ?? 0) +
    toNumber(input.energy?.coalConsumption) * (input.factorMap.get('COAL') ?? 0) +
    toNumber(input.energy?.gasConsumption) * (input.factorMap.get('GAS') ?? 0) +
    toNumber(input.energy?.steamConsumption) * (input.factorMap.get('STEAM') ?? 0);
  const totalWaste = toNumber(input.waste?.hazardousWaste) + toNumber(input.waste?.nonHazardousWaste);
  const recycledWaste = toNumber(input.waste?.recycledWaste);
  const totalEmissions = manualEmissions > 0 ? manualEmissions : derivedEmissions;

  return {
    totalEnergy,
    renewablePercentage: totalEnergy > 0 ? (renewableEnergy / totalEnergy) * 100 : 0,
    energyIntensity: productionQuantity > 0 ? totalEnergy / productionQuantity : null,
    totalWater,
    waterIntensity: productionQuantity > 0 ? totalWater / productionQuantity : null,
    recycledWaterPercentage: totalWater > 0 ? (toNumber(input.water?.recycledWater) / totalWater) * 100 : 0,
    totalEmissions,
    emissionIntensity: productionQuantity > 0 ? totalEmissions / productionQuantity : null,
    totalWaste,
    recyclingRate: totalWaste > 0 ? (recycledWaste / totalWaste) * 100 : 0,
    wasteIntensity: productionQuantity > 0 ? totalWaste / productionQuantity : null,
  };
}

function resolveTargetValue(target: EsgTargetEntity | null, kpiName: string) {
  if (!target) return null;
  const normalized = kpiName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (normalized.includes('RENEWABLE')) return toNumber(target.renewableTarget);
  if (normalized.includes('WATER')) return toNumber(target.targetWaterReduction);
  if (normalized.includes('EMISSION') || normalized.includes('CARBON') || normalized.includes('GHG')) return toNumber(target.targetEmissionReduction);
  if (normalized.includes('WASTE')) return toNumber(target.targetWasteReduction);
  if (normalized.includes('ENERGY')) return toNumber(target.targetEnergyReduction);
  return null;
}

function resolveKpiValue(kpiName: string, computed: ReturnType<typeof computeDerivedMetrics>) {
  const normalized = kpiName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (normalized.includes('RENEWABLE')) return computed.renewablePercentage;
  if (normalized.includes('ENERGY_INTENSITY')) return computed.energyIntensity ?? 0;
  if (normalized.includes('ENERGY')) return computed.totalEnergy;
  if (normalized.includes('WATER_INTENSITY')) return computed.waterIntensity ?? 0;
  if (normalized.includes('WATER')) return computed.totalWater;
  if (normalized.includes('CARBON_INTENSITY') || normalized.includes('EMISSION_INTENSITY')) return computed.emissionIntensity ?? 0;
  if (normalized.includes('GHG') || normalized.includes('EMISSION')) return computed.totalEmissions;
  if (normalized.includes('RECYCLED') || normalized.includes('RECYCLING_RATE')) return computed.recyclingRate;
  if (normalized.includes('WASTE_INTENSITY')) return computed.wasteIntensity ?? 0;
  if (normalized.includes('WASTE')) return computed.totalWaste;
  return 0;
}

async function recalculateKpis(plantId: string, year: number, month: number) {
  const dateKey = `${year}-${String(month).padStart(2, '0')}-01`;
  const [bundle, factorMap, kpiMaster, target] = await Promise.all([
    getPeriodData(plantId, year, month),
    getEmissionFactorMap(dateKey),
    AppDataSource.getRepository(EsgKpiMasterEntity).find({ where: { status: 'ACTIVE' }, order: { kpiName: 'ASC' } }),
    AppDataSource.getRepository(EsgTargetEntity).findOneBy({ plantId, year }),
  ]);
  const computed = computeDerivedMetrics({ ...bundle, factorMap });

  if (bundle.energy) {
    bundle.energy.totalEnergy = toDecimal(computed.totalEnergy, 3) ?? '0.000';
    bundle.energy.renewableEnergyPercentage = toDecimal(computed.renewablePercentage, 3) ?? '0.000';
    bundle.energy.energyIntensity = toDecimal(computed.energyIntensity, 6);
    await AppDataSource.getRepository(EsgEnergyDataEntity).save(bundle.energy);
  }
  if (bundle.water) {
    bundle.water.totalWaterConsumption = toDecimal(computed.totalWater, 3) ?? '0.000';
    bundle.water.waterIntensity = toDecimal(computed.waterIntensity, 6);
    bundle.water.recycledWaterPercentage = toDecimal(computed.recycledWaterPercentage, 3) ?? '0.000';
    await AppDataSource.getRepository(EsgWaterDataEntity).save(bundle.water);
  }
  if (bundle.emissions) {
    bundle.emissions.totalGhgEmissions = toDecimal(computed.totalEmissions, 6) ?? '0.000000';
    bundle.emissions.emissionIntensity = toDecimal(computed.emissionIntensity, 6);
    await AppDataSource.getRepository(EsgEmissionDataEntity).save(bundle.emissions);
  }
  if (bundle.waste) {
    bundle.waste.totalWaste = toDecimal(computed.totalWaste, 3) ?? '0.000';
    bundle.waste.recyclingRate = toDecimal(computed.recyclingRate, 3) ?? '0.000';
    bundle.waste.wasteIntensity = toDecimal(computed.wasteIntensity, 6);
    await AppDataSource.getRepository(EsgWasteDataEntity).save(bundle.waste);
  }

  const kpiRepo = AppDataSource.getRepository(EsgKpiResultEntity);
  const existing = await kpiRepo.find({ where: { plantId, year, month } });
  const existingByName = new Map(existing.map((row) => [row.kpiName, row]));
  const rows = kpiMaster.map((kpi) => {
    const value = resolveKpiValue(kpi.kpiName, computed);
    const targetValue = resolveTargetValue(target, kpi.kpiName);
    const variance = targetValue === null || targetValue === undefined ? null : value - targetValue;
    const status =
      targetValue === null || targetValue === undefined
        ? 'INFO'
        : kpi.kpiName.toUpperCase().includes('RENEWABLE')
          ? (value >= targetValue ? 'ON_TRACK' : 'ALERT')
          : (value <= targetValue ? 'ON_TRACK' : 'ALERT');
    const entity = existingByName.get(kpi.kpiName) ?? kpiRepo.create({ plantId, year, month, kpiName: kpi.kpiName });
    entity.kpiCategory = kpi.kpiCategory;
    entity.unit = kpi.unit ?? null;
    entity.value = toDecimal(value, 6) ?? '0.000000';
    entity.targetValue = toDecimal(targetValue, 6);
    entity.status = status;
    entity.variance = toDecimal(variance, 6);
    entity.calculatedAt = new Date();
    return entity;
  });
  await kpiRepo.save(rows);
  return rows;
}

async function createThresholdNotifications(plantId: string, year: number, month: number, results: EsgKpiResultEntity[]) {
  const alertRows = results.filter((row) => row.status === 'ALERT');
  if (alertRows.length === 0) return;

  const [authorizedUsers, plantUsers] = await Promise.all([
    AppDataSource.getRepository(EsgAuthorizedUserEntity).find({ where: { plantId } }),
    AppDataSource.getRepository(UserRoleEntity).find({ where: { plantId, role: In(['ADMIN', 'PLANT_ADMIN']) } }),
  ]);
  const recipientIds = Array.from(new Set([...authorizedUsers.map((row) => row.userId), ...plantUsers.map((row) => row.userId)]));
  if (recipientIds.length === 0) return;

  const notificationRepo = AppDataSource.getRepository(NotificationEntity);
  const notifications = recipientIds.flatMap((userId) =>
    alertRows.map((result) =>
      notificationRepo.create({
        userId,
        title: 'ESG threshold alert',
        message: `${result.kpiName} exceeded the configured threshold for ${year}-${String(month).padStart(2, '0')}.`,
        type: 'warning',
        link: '/esg',
        woId: null,
      }),
    ),
  );
  await notificationRepo.save(notifications);
}

async function buildCrossPlantAnalytics(plantIds: string[], year: number, month: number) {
  if (plantIds.length === 0) return [];
  const [plants, results] = await Promise.all([
    AppDataSource.getRepository(PlantEntity).findBy({ id: In(plantIds) }),
    AppDataSource.getRepository(EsgKpiResultEntity).find({
      where: { plantId: In(plantIds), year, month },
      order: { plantId: 'ASC', kpiName: 'ASC' },
    }),
  ]);
  const plantMap = new Map(plants.map((plant) => [plant.id, plant]));
  const summary = new Map<string, Record<string, unknown>>();

  for (const row of results) {
    const current = summary.get(row.plantId) ?? {
      plantId: row.plantId,
      plantName: plantMap.get(row.plantId)?.plantName ?? row.plantId,
    };
    const key = row.kpiName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    current[key] = toNumber(row.value);
    summary.set(row.plantId, current);
  }
  return Array.from(summary.values()).sort((a, b) => String(a.plantName).localeCompare(String(b.plantName)));
}

export const esgRouter = Router();
esgRouter.use(requireAuth);

esgRouter.get('/esg/access', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = monthlyPeriodSchema.partial().parse(req.query);
    const plantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const authorizedRows = plantId
      ? await AppDataSource.getRepository(EsgAuthorizedUserEntity).find({
          where: [{ plantId, userId: req.auth!.userId }, { plantId, userId: req.auth!.userId, esgCategory: 'ALL' }],
        })
      : [];
    const categories = Array.from(new Set(authorizedRows.map((row) => row.esgCategory)));
    res.json(
      ok({
        plantId,
        canEnterData: isSuperAdminRequest(req) || categories.length > 0,
        categories,
        readOnly: !(isSuperAdminRequest(req) || categories.length > 0),
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/master/kpis', requireRole(['SUPERADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(EsgKpiMasterEntity);
    const qb = repo.createQueryBuilder('kpi');
    if (query.search) {
      const searchValue = `%${query.search}%`;
      qb.where('kpi.kpi_name ILIKE :searchValue OR kpi.kpi_category ILIKE :searchValue', { searchValue });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('kpi.kpi_name', 'ASC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'ESG KPI master fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

esgRouter.post('/esg/master/kpis', requireRole(['SUPERADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = kpiMasterSchema.parse(req.body);
    const repo = AppDataSource.getRepository(EsgKpiMasterEntity);
    const created = repo.create({
      ...body,
      formula: body.formula ?? null,
      unit: body.unit ?? null,
      description: body.description ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'ESG KPI created'));
  } catch (error) {
    next(error);
  }
});

esgRouter.patch('/esg/master/kpis/:id', requireRole(['SUPERADMIN']), requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = kpiMasterSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(EsgKpiMasterEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'ESG KPI not found' });
      return;
    }
    Object.assign(entity, body);
    if (body.formula !== undefined) entity.formula = body.formula ?? null;
    if (body.unit !== undefined) entity.unit = body.unit ?? null;
    if (body.description !== undefined) entity.description = body.description ?? null;
    await repo.save(entity);
    res.json(ok(entity, 'ESG KPI updated'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/master/emission-factors', requireRole(['SUPERADMIN']), requirePermission('ESG', 'READ'), async (_req, res, next) => {
  try {
    const rows = await AppDataSource.getRepository(EsgEmissionFactorEntity).find({ order: { energyType: 'ASC', effectiveDate: 'DESC' } });
    res.json(ok(rows, 'ESG emission factors fetched'));
  } catch (error) {
    next(error);
  }
});

esgRouter.post('/esg/master/emission-factors', requireRole(['SUPERADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = emissionFactorSchema.parse(req.body);
    const repo = AppDataSource.getRepository(EsgEmissionFactorEntity);
    const created = repo.create({
      energyType: body.energyType,
      unit: body.unit,
      co2Factor: body.co2Factor.toFixed(6),
      source: body.source ?? null,
      effectiveDate: body.effectiveDate,
      isActive: body.isActive,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'ESG emission factor created'));
  } catch (error) {
    next(error);
  }
});

esgRouter.patch('/esg/master/emission-factors/:id', requireRole(['SUPERADMIN']), requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = emissionFactorSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(EsgEmissionFactorEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Emission factor not found' });
      return;
    }
    if (body.energyType !== undefined) entity.energyType = body.energyType;
    if (body.unit !== undefined) entity.unit = body.unit;
    if (body.co2Factor !== undefined) entity.co2Factor = body.co2Factor.toFixed(6);
    if (body.source !== undefined) entity.source = body.source ?? null;
    if (body.effectiveDate !== undefined) entity.effectiveDate = body.effectiveDate;
    if (body.isActive !== undefined) entity.isActive = body.isActive;
    await repo.save(entity);
    res.json(ok(entity, 'Emission factor updated'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/master/targets', requireRole(['SUPERADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = listFiltersSchema.parse(req.query);
    const repo = AppDataSource.getRepository(EsgTargetEntity);
    const where = {
      ...(query.plantId ? { plantId: query.plantId } : {}),
      ...(query.year ? { year: query.year } : {}),
    };
    const rows = await repo.find({ where, order: { year: 'DESC', plantId: 'ASC' } });
    res.json(ok(rows, 'ESG targets fetched'));
  } catch (error) {
    next(error);
  }
});

esgRouter.post('/esg/master/targets', requireRole(['SUPERADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = targetSchema.parse(req.body);
    const repo = AppDataSource.getRepository(EsgTargetEntity);
    const existing = await repo.findOneBy({ plantId: body.plantId, year: body.year });
    const entity = existing ?? repo.create({ plantId: body.plantId, year: body.year });
    entity.targetEnergyReduction = toDecimal(body.targetEnergyReduction, 3);
    entity.targetWaterReduction = toDecimal(body.targetWaterReduction, 3);
    entity.targetEmissionReduction = toDecimal(body.targetEmissionReduction, 3);
    entity.targetWasteReduction = toDecimal(body.targetWasteReduction, 3);
    entity.renewableTarget = toDecimal(body.renewableTarget, 3);
    await repo.save(entity);
    res.status(existing ? 200 : 201).json(ok(entity, existing ? 'ESG target updated' : 'ESG target created'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/master/authorized-users', requireRole(['SUPERADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = listFiltersSchema.parse(req.query);
    const repo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
    const rows = await repo.find({
      where: query.plantId ? { plantId: query.plantId } : {},
      order: { plantId: 'ASC', esgCategory: 'ASC' },
    });
    const profileIds = Array.from(new Set(rows.map((row) => row.userId)));
    const profiles = profileIds.length > 0
      ? await AppDataSource.getRepository(ProfileEntity).find({ where: { userId: In(profileIds) } })
      : [];
    const profilesByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    res.json(
      ok(
        rows.map((row) => ({
          ...row,
          userName: profilesByUserId.get(row.userId)?.fullName ?? null,
          userEmail: profilesByUserId.get(row.userId)?.email ?? null,
        })),
        'ESG authorized users fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

esgRouter.post('/esg/master/authorized-users', requireRole(['SUPERADMIN']), requirePermission('ESG', 'CREATE'), async (req, res, next) => {
  try {
    const body = authorizedUserSchema.parse(req.body);
    const repo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
    const existing = await repo.findOneBy({
      plantId: body.plantId,
      userId: body.userId,
      esgCategory: body.esgCategory,
    });
    if (existing) {
      res.json(ok(existing, 'Authorized ESG user already exists'));
      return;
    }
    const created = repo.create({
      plantId: body.plantId,
      userId: body.userId,
      esgCategory: body.esgCategory,
      createdBy: req.auth!.userId,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Authorized ESG user created'));
  } catch (error) {
    next(error);
  }
});

esgRouter.delete('/esg/master/authorized-users/:id', requireRole(['SUPERADMIN']), requirePermission('ESG', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
    await repo.delete({ id: params.id });
    res.json(ok({ id: params.id, deleted: true }, 'Authorized ESG user deleted'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/master/analytics', requireRole(['SUPERADMIN']), requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = monthlyPeriodSchema.parse(req.query);
    const plantIds = resolvePlantFilter(req.auth!, undefined) ?? [];
    const data = await buildCrossPlantAnalytics(plantIds, query.year, query.month);
    res.json(ok(data, 'Cross plant ESG analytics fetched'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/metrics', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(EsgKpiMasterEntity);
    const qb = repo.createQueryBuilder('kpi');
    if (query.search) {
      const searchValue = `%${query.search}%`;
      qb.where('kpi.kpi_name ILIKE :searchValue OR kpi.kpi_category ILIKE :searchValue', { searchValue });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('kpi.kpi_name', 'ASC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'ESG KPI master fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/dashboard', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = monthlyPeriodSchema.partial().parse(req.query);
    const plantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const [current, target, accessRows, trends] = await Promise.all([
      getPeriodData(plantId, year, month),
      AppDataSource.getRepository(EsgTargetEntity).findOneBy({ plantId, year }),
      AppDataSource.getRepository(EsgAuthorizedUserEntity).find({
        where: [{ plantId, userId: req.auth!.userId }, { plantId, userId: req.auth!.userId, esgCategory: 'ALL' }],
      }),
      AppDataSource.getRepository(EsgKpiResultEntity).find({
        where: { plantId, year },
        order: { month: 'ASC', kpiName: 'ASC' },
      }),
    ]);
    res.json(
      ok({
        plantId,
        year,
        month,
        readOnly: !(isSuperAdminRequest(req) || accessRows.length > 0),
        authorizedCategories: Array.from(new Set(accessRows.map((row) => row.esgCategory))),
        target,
        current,
        trends,
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/data', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = monthlyPeriodSchema.parse(req.query);
    const plantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const [bundle, accessRows, target] = await Promise.all([
      getPeriodData(plantId, query.year, query.month),
      AppDataSource.getRepository(EsgAuthorizedUserEntity).find({
        where: [{ plantId, userId: req.auth!.userId }, { plantId, userId: req.auth!.userId, esgCategory: 'ALL' }],
      }),
      AppDataSource.getRepository(EsgTargetEntity).findOneBy({ plantId, year: query.year }),
    ]);
    res.json(
      ok({
        plantId,
        year: query.year,
        month: query.month,
        target,
        ...bundle,
        access: {
          canEnterData: isSuperAdminRequest(req) || accessRows.length > 0,
          categories: Array.from(new Set(accessRows.map((row) => row.esgCategory))),
        },
      }),
    );
  } catch (error) {
    next(error);
  }
});

esgRouter.put('/esg/data/energy', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = energyDataSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    await ensureAuthorizedForCategory(req, plantId, 'ENERGY');
    const repo = AppDataSource.getRepository(EsgEnergyDataEntity);
    const existing = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (existing?.isLocked) throw new HttpError(409, 'Energy data is locked for this month');
    const entity = existing ?? repo.create({ plantId, year: body.year, month: body.month, createdBy: req.auth!.userId });
    entity.gridElectricityKwh = body.gridElectricityKwh.toFixed(3);
    entity.dieselConsumptionLitre = body.dieselConsumptionLitre.toFixed(3);
    entity.coalConsumption = body.coalConsumption.toFixed(3);
    entity.gasConsumption = body.gasConsumption.toFixed(3);
    entity.steamConsumption = body.steamConsumption.toFixed(3);
    entity.solarGeneration = body.solarGeneration.toFixed(3);
    entity.windGeneration = body.windGeneration.toFixed(3);
    entity.greenEnergyPurchase = body.greenEnergyPurchase.toFixed(3);
    entity.updatedBy = req.auth!.userId;
    await repo.save(entity);
    const results = await recalculateKpis(plantId, body.year, body.month);
    await createThresholdNotifications(plantId, body.year, body.month, results);
    res.json(ok(entity, 'Energy data saved'));
  } catch (error) {
    next(error);
  }
});

esgRouter.put('/esg/data/water', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = waterDataSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    await ensureAuthorizedForCategory(req, plantId, 'WATER');
    const repo = AppDataSource.getRepository(EsgWaterDataEntity);
    const existing = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (existing?.isLocked) throw new HttpError(409, 'Water data is locked for this month');
    const entity = existing ?? repo.create({ plantId, year: body.year, month: body.month, createdBy: req.auth!.userId });
    entity.freshWaterIntake = body.freshWaterIntake.toFixed(3);
    entity.groundWater = body.groundWater.toFixed(3);
    entity.municipalWater = body.municipalWater.toFixed(3);
    entity.recycledWater = body.recycledWater.toFixed(3);
    entity.rainWater = body.rainWater.toFixed(3);
    entity.waterDischarge = body.waterDischarge.toFixed(3);
    entity.updatedBy = req.auth!.userId;
    await repo.save(entity);
    const results = await recalculateKpis(plantId, body.year, body.month);
    await createThresholdNotifications(plantId, body.year, body.month, results);
    res.json(ok(entity, 'Water data saved'));
  } catch (error) {
    next(error);
  }
});

esgRouter.put('/esg/data/emissions', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = emissionDataSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    await ensureAuthorizedForCategory(req, plantId, 'EMISSIONS');
    const repo = AppDataSource.getRepository(EsgEmissionDataEntity);
    const existing = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (existing?.isLocked) throw new HttpError(409, 'Emission data is locked for this month');
    const entity = existing ?? repo.create({ plantId, year: body.year, month: body.month, createdBy: req.auth!.userId });
    entity.scope1Emissions = body.scope1Emissions.toFixed(6);
    entity.scope2Emissions = body.scope2Emissions.toFixed(6);
    entity.scope3Emissions = body.scope3Emissions.toFixed(6);
    entity.boilerNox = body.boilerNox.toFixed(6);
    entity.boilerSox = body.boilerSox.toFixed(6);
    entity.boilerPm = body.boilerPm.toFixed(6);
    entity.stackEmission = body.stackEmission.toFixed(6);
    entity.updatedBy = req.auth!.userId;
    await repo.save(entity);
    const results = await recalculateKpis(plantId, body.year, body.month);
    await createThresholdNotifications(plantId, body.year, body.month, results);
    res.json(ok(entity, 'Emission data saved'));
  } catch (error) {
    next(error);
  }
});

esgRouter.put('/esg/data/waste', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = wasteDataSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    await ensureAuthorizedForCategory(req, plantId, 'WASTE');
    const repo = AppDataSource.getRepository(EsgWasteDataEntity);
    const existing = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (existing?.isLocked) throw new HttpError(409, 'Waste data is locked for this month');
    const entity = existing ?? repo.create({ plantId, year: body.year, month: body.month, createdBy: req.auth!.userId });
    entity.hazardousWaste = body.hazardousWaste.toFixed(3);
    entity.nonHazardousWaste = body.nonHazardousWaste.toFixed(3);
    entity.recycledWaste = body.recycledWaste.toFixed(3);
    entity.landfillWaste = body.landfillWaste.toFixed(3);
    entity.incineratedWaste = body.incineratedWaste.toFixed(3);
    entity.updatedBy = req.auth!.userId;
    await repo.save(entity);
    const results = await recalculateKpis(plantId, body.year, body.month);
    await createThresholdNotifications(plantId, body.year, body.month, results);
    res.json(ok(entity, 'Waste data saved'));
  } catch (error) {
    next(error);
  }
});

esgRouter.put('/esg/data/production', requirePermission('ESG', 'UPDATE'), async (req, res, next) => {
  try {
    const body = productionDataSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    await ensureAuthorizedForCategory(req, plantId, 'PRODUCTION');
    const repo = AppDataSource.getRepository(EsgProductionDataEntity);
    const existing = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (existing?.isLocked) throw new HttpError(409, 'Production data is locked for this month');
    const entity = existing ?? repo.create({ plantId, year: body.year, month: body.month, createdBy: req.auth!.userId });
    entity.productionQuantity = body.productionQuantity.toFixed(3);
    entity.operatingHours = body.operatingHours.toFixed(3);
    entity.machineUtilization = body.machineUtilization.toFixed(3);
    entity.updatedBy = req.auth!.userId;
    await repo.save(entity);
    const results = await recalculateKpis(plantId, body.year, body.month);
    await createThresholdNotifications(plantId, body.year, body.month, results);
    res.json(ok(entity, 'Production data saved'));
  } catch (error) {
    next(error);
  }
});

esgRouter.post('/esg/data/lock', requirePermission('ESG', 'APPROVE'), async (req, res, next) => {
  try {
    const body = lockSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const repoMap = {
      energy: AppDataSource.getRepository(EsgEnergyDataEntity),
      water: AppDataSource.getRepository(EsgWaterDataEntity),
      emissions: AppDataSource.getRepository(EsgEmissionDataEntity),
      waste: AppDataSource.getRepository(EsgWasteDataEntity),
      production: AppDataSource.getRepository(EsgProductionDataEntity),
    } as const;
    const repo = repoMap[body.section];
    const entity = await repo.findOneBy({ plantId, year: body.year, month: body.month });
    if (!entity) {
      res.status(404).json({ success: false, message: 'ESG data for selected section was not found' });
      return;
    }
    entity.isLocked = body.locked;
    entity.verifiedAt = body.locked ? new Date() : null;
    entity.verifiedBy = body.locked ? req.auth!.userId : null;
    await repo.save(entity);
    res.json(ok(entity, body.locked ? 'ESG period locked' : 'ESG period unlocked'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/analytics', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = monthlyPeriodSchema.parse(req.query);
    const requestedPlantIds = resolvePlantFilter(req.auth!, query.plantId ?? undefined);
    const plantIds = requestedPlantIds ?? [];
    const data = await buildCrossPlantAnalytics(plantIds, query.year, query.month);
    res.json(ok(data, 'ESG analytics fetched'));
  } catch (error) {
    next(error);
  }
});

esgRouter.get('/esg/reports', requirePermission('ESG', 'READ'), async (req, res, next) => {
  try {
    const query = reportSchema.parse(req.query);
    const plantIds = resolvePlantFilter(req.auth!, query.plantId);
    const scopedPlantIds = plantIds ?? (query.plantId ? [query.plantId] : []);
    const effectiveMonth = query.month ?? 1;
    const data = await buildCrossPlantAnalytics(scopedPlantIds, query.year, effectiveMonth);

    if (query.format === 'csv') {
      const headers = ['Plant', 'Period', 'Total Energy', 'Total Water', 'Total Emissions', 'Renewable %', 'Total Waste'];
      const rows = data.map((row) => [
        row.plantName,
        query.month ? `${query.year}-${String(query.month).padStart(2, '0')}` : String(query.year),
        row.total_energy_consumption ?? row.energy_consumption ?? '',
        row.water_consumption ?? '',
        row.total_ghg_emissions ?? '',
        row.renewable_energy_ ?? row.renewable_energy ?? '',
        row.waste_generated ?? row.total_waste ?? '',
      ]);
      const brandingNow = new Date().toISOString();
      const branding = await getReportBranding({
        organizationName: 'ESG Report',
        generatedAt: brandingNow,
        reportTitle: `ESG ${query.reportType} Report - ${query.year}`,
      });

      const csv = toCsv(headers, rows, branding);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="esg-${query.reportType.toLowerCase()}-${query.year}.csv"`);
      res.send(csv);
      return;
    }

    if (query.format === 'pdf') {
      const lines = [
        `ESG ${query.reportType} Report`,
        `Year: ${query.year}`,
        query.month ? `Month: ${query.month}` : 'Month: All',
        '',
        ...data.flatMap((row) => [
          `Plant: ${String(row.plantName)}`,
          `Energy: ${String(row.total_energy_consumption ?? row.energy_consumption ?? '-')}`,
          `Water: ${String(row.water_consumption ?? '-')}`,
          `Emissions: ${String(row.total_ghg_emissions ?? '-')}`,
          `Renewable %: ${String(row.renewable_energy_ ?? row.renewable_energy ?? '-')}`,
          `Waste: ${String(row.waste_generated ?? row.total_waste ?? '-')}`,
          '',
        ]),
      ];
      const brandingNow = new Date().toISOString();
      const branding = await getReportBranding({
        generatedAt: brandingNow,
        reportTitle: `ESG ${query.reportType} Report`,
      });
      const pdf = createSimplePdf(lines, {
        title: `ESG ${query.reportType} Report`,
        subtitle: `Year: ${query.year}`,
        generatedAt: brandingNow,
        footerBranding: branding.footerBranding,
        primaryColor: branding.primaryColor,
        headerBgColor: branding.headerBgColor,
        headerFontSize: branding.headerFontSize,
        footerFontSize: branding.footerFontSize,
        headerBold: branding.headerBold,
        headerUnderline: branding.headerUnderline,
        headerAlignment: branding.headerAlignment,
        logoAlignment: branding.logoAlignment,
        headerColor: branding.headerColor,
        footerColor: branding.footerColor,
        footerBold: branding.footerBold,
        showOrganizationLogo: branding.showOrganizationLogo,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="esg-${query.reportType.toLowerCase()}-${query.year}.pdf"`);
      res.send(pdf);
      return;
    }

    res.json(ok(data, 'ESG report generated'));
  } catch (error) {
    next(error);
  }
});
