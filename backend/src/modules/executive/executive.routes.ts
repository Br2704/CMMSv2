import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  AssetDowntimeEventEntity,
  AssetEntity,
  AssetPerformanceLogEntity,
  GhgActivityDataEntity,
  PlantEntity,
  SafetyIncidentEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { mean, resolveDateRange, safeNumber } from '../../utils/advancedAnalytics';

const executiveQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  assetType: z.string().trim().min(1).optional(),
});

const drilldownQuerySchema = executiveQuerySchema.extend({
  plantId: z.string().uuid(),
});

function monthLabel(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export const executiveRouter = Router();
executiveRouter.use('/executive', requireAuth, requireRole(['SUPERADMIN']), requirePermission('BENCHMARKING', 'READ'));

executiveRouter.get('/executive/global-operations', async (req, res, next) => {
  try {
    const query = executiveQuerySchema.parse(req.query);
    const range = resolveDateRange(query.from, query.to, 30);

    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const performanceRepo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const downtimeRepo = AppDataSource.getRepository(AssetDowntimeEventEntity);
    const ghgRepo = AppDataSource.getRepository(GhgActivityDataEntity);
    const safetyRepo = AppDataSource.getRepository(SafetyIncidentEntity);

    const [totalPlants, totalAssets] = await Promise.all([
      plantRepo.count({ where: { isActive: true } }),
      assetRepo
        .createQueryBuilder('asset')
        .where('asset.is_active = :active', { active: true })
        .andWhere(query.assetType ? 'asset.asset_type = :assetType' : '1=1', { assetType: query.assetType })
        .getCount(),
    ]);

    const downtimeRows = await downtimeRepo
      .createQueryBuilder('event')
      .where('event.is_active = :active', { active: true })
      .andWhere('event.started_at <= :to', { to: range.to })
      .andWhere('(event.ended_at IS NULL OR event.ended_at >= :from)', { from: range.from })
      .select(['event.plant_id AS "plantId"', 'SUM(COALESCE(event.duration_minutes, 0)) AS "downtimeMinutes"'])
      .groupBy('event.plant_id')
      .getRawMany<{ plantId: string; downtimeMinutes: string | null }>();

    const totalDowntimeMinutes = downtimeRows.reduce((acc, row) => acc + safeNumber(row.downtimeMinutes), 0);

    const perfQb = performanceRepo
      .createQueryBuilder('log')
      .innerJoin('assets', 'asset', 'asset.id = log.asset_id')
      .leftJoin('plants', 'plant', 'plant.id = log.plant_id')
      .where('log.is_active = :active', { active: true })
      .andWhere('asset.is_active = :assetActive', { assetActive: true })
      .andWhere('log.captured_at >= :from', { from: range.from })
      .andWhere('log.captured_at <= :to', { to: range.to });

    if (query.assetType) {
      perfQb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });
    }

    const performanceRows = await perfQb
      .clone()
      .select([
        'log.plant_id AS "plantId"',
        'plant.plant_name AS "plantName"',
        'AVG(CAST(log.efficiency_value AS decimal(18,6))) AS "avgEfficiency"',
        'SUM(CAST(log.energy_kwh AS decimal(18,6))) AS "sumEnergyKwh"',
        'SUM(CAST(log.production_output AS decimal(18,6))) AS "sumOutput"',
      ])
      .groupBy('log.plant_id')
      .addGroupBy('plant.plant_name')
      .getRawMany<{ plantId: string; plantName: string; avgEfficiency: string | null; sumEnergyKwh: string | null; sumOutput: string | null }>();

    const plantScores = performanceRows.map((row) => {
      const avgEfficiency = safeNumber(row.avgEfficiency);
      const totalEnergy = safeNumber(row.sumEnergyKwh);
      const totalOutput = safeNumber(row.sumOutput);
      const energyIntensity = totalOutput > 0 ? totalEnergy / totalOutput : 0;
      const downtimeMinutes = safeNumber(downtimeRows.find((item) => item.plantId === row.plantId)?.downtimeMinutes);
      const composite = Math.max(0, avgEfficiency - downtimeMinutes / 600 - energyIntensity * 5);
      return {
        plantId: row.plantId,
        plantName: row.plantName ?? 'Unknown',
        avgEfficiency: Number(avgEfficiency.toFixed(2)),
        energyIntensity: Number(energyIntensity.toFixed(4)),
        downtimeMinutes: Number(downtimeMinutes.toFixed(2)),
        score: Number(composite.toFixed(2)),
      };
    });

    const sorted = [...plantScores].sort((a, b) => b.score - a.score);
    const topPlant = sorted[0] ?? null;
    const worstPlant = sorted[sorted.length - 1] ?? null;

    const healthRows = await assetRepo
      .createQueryBuilder('asset')
      .where('asset.is_active = :active', { active: true })
      .select(['AVG(CAST(asset.asset_health_score AS decimal(10,2))) AS "avgHealthScore"'])
      .getRawOne<{ avgHealthScore: string | null }>();
    const reliabilityScore = safeNumber(healthRows?.avgHealthScore);

    const totalEnergyAndOutput = await perfQb
      .clone()
      .select([
        'SUM(CAST(log.energy_kwh AS decimal(18,6))) AS "totalEnergy"',
        'SUM(CAST(log.production_output AS decimal(18,6))) AS "totalOutput"',
      ])
      .getRawOne<{ totalEnergy: string | null; totalOutput: string | null }>();
    const totalEnergy = safeNumber(totalEnergyAndOutput?.totalEnergy);
    const totalOutput = safeNumber(totalEnergyAndOutput?.totalOutput);
    const energyIntensity = totalOutput > 0 ? totalEnergy / totalOutput : 0;

    const ghgRows = await ghgRepo
      .createQueryBuilder('ghg')
      .where('ghg.is_active = :active', { active: true })
      .andWhere('ghg.period_start <= :to', { to: range.to })
      .andWhere('ghg.period_end >= :from', { from: range.from })
      .getMany();
    const ghgByMonth = new Map<string, number>();
    ghgRows.forEach((row) => {
      const month = monthLabel(row.periodStart);
      const curr = ghgByMonth.get(month) ?? 0;
      ghgByMonth.set(month, curr + safeNumber(row.computedCo2e));
    });

    const safetySummary = await safetyRepo
      .createQueryBuilder('incident')
      .where('incident.incident_date >= :from', { from: range.from })
      .andWhere('incident.incident_date <= :to', { to: range.to })
      .select([
        'COUNT(1) AS "totalIncidents"',
        `SUM(CASE WHEN UPPER(incident.severity) IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) AS "criticalIncidents"`,
        `AVG(CAST(incident.lost_time_hours AS decimal(18,3))) AS "avgLostTimeHours"`,
      ])
      .getRawOne<{ totalIncidents: string | null; criticalIncidents: string | null; avgLostTimeHours: string | null }>();

    const response = {
      from: range.from,
      to: range.to,
      assetType: query.assetType ?? null,
      totalPlants,
      totalAssets,
      totalDowntimeHours: Number((totalDowntimeMinutes / 60).toFixed(2)),
      reliabilityScore: Number(reliabilityScore.toFixed(2)),
      energyIntensity: Number(energyIntensity.toFixed(4)),
      ghgEmissionsTrend: Array.from(ghgByMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, totalCo2e]) => ({ month, totalCo2e: Number(totalCo2e.toFixed(4)) })),
      topPerformingPlant: topPlant,
      worstPerformingPlant: worstPlant,
      plantRanking: sorted,
      safetyIncidentsSummary: {
        totalIncidents: safeNumber(safetySummary?.totalIncidents),
        criticalIncidents: safeNumber(safetySummary?.criticalIncidents),
        avgLostTimeHours: Number(safeNumber(safetySummary?.avgLostTimeHours).toFixed(3)),
      },
      hrAbsenteeismSummary: null,
    };

    res.json(ok(response, 'Global operations overview fetched'));
  } catch (error) {
    next(error);
  }
});

executiveRouter.get('/executive/global-operations/drilldown', async (req, res, next) => {
  try {
    const query = drilldownQuerySchema.parse(req.query);
    ensurePlantAccess(req, query.plantId);
    const range = resolveDateRange(query.from, query.to, 30);

    const performanceRepo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const downtimeRepo = AppDataSource.getRepository(AssetDowntimeEventEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);

    const assets = await assetRepo
      .createQueryBuilder('asset')
      .where('asset.is_active = :active', { active: true })
      .andWhere('asset.plant_id = :plantId', { plantId: query.plantId })
      .andWhere(query.assetType ? 'asset.asset_type = :assetType' : '1=1', { assetType: query.assetType })
      .getMany();

    const performance = await performanceRepo
      .createQueryBuilder('log')
      .where('log.is_active = :active', { active: true })
      .andWhere('log.plant_id = :plantId', { plantId: query.plantId })
      .andWhere('log.captured_at >= :from', { from: range.from })
      .andWhere('log.captured_at <= :to', { to: range.to })
      .getMany();

    const downtime = await downtimeRepo
      .createQueryBuilder('event')
      .where('event.is_active = :active', { active: true })
      .andWhere('event.plant_id = :plantId', { plantId: query.plantId })
      .andWhere('event.started_at <= :to', { to: range.to })
      .andWhere('(event.ended_at IS NULL OR event.ended_at >= :from)', { from: range.from })
      .getMany();

    res.json(
      ok({
        plantId: query.plantId,
        from: range.from,
        to: range.to,
        assetType: query.assetType ?? null,
        assetsCount: assets.length,
        avgAssetHealth: Number(mean(assets.map((item) => safeNumber(item.assetHealthScore))).toFixed(2)),
        avgEfficiency: Number(mean(performance.map((item) => safeNumber(item.efficiencyValue))).toFixed(2)),
        totalRuntimeHours: Number(performance.reduce((acc, item) => acc + safeNumber(item.runtimeHours), 0).toFixed(2)),
        totalEnergyKwh: Number(performance.reduce((acc, item) => acc + safeNumber(item.energyKwh), 0).toFixed(2)),
        totalDowntimeHours: Number((downtime.reduce((acc, item) => acc + safeNumber(item.durationMinutes), 0) / 60).toFixed(2)),
      }),
    );
  } catch (error) {
    next(error);
  }
});
