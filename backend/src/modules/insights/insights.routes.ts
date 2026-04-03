import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetPerformanceLogEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { clamp, mean, percentileRank, resolveDateRange, stdDeviation } from '../../utils/advancedAnalytics';

const performanceQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  assetType: z.string().trim().min(1).optional(),
});

export const insightsRouter = Router();
insightsRouter.use('/insights', requireAuth, requireRole(['SUPERADMIN']), requirePermission('BENCHMARKING', 'READ'));

insightsRouter.get('/insights/plant-performance', async (req, res, next) => {
  try {
    const query = performanceQuerySchema.parse(req.query);
    const range = resolveDateRange(query.from, query.to, 30);

    const qb = AppDataSource.getRepository(AssetPerformanceLogEntity)
      .createQueryBuilder('log')
      .innerJoin('assets', 'asset', 'asset.id = log.asset_id AND asset.is_active = true')
      .leftJoin('plants', 'plant', 'plant.id = log.plant_id')
      .where('log.is_active = :active', { active: true })
      .andWhere('log.captured_at >= :from', { from: range.from })
      .andWhere('log.captured_at <= :to', { to: range.to });

    if (query.assetType) {
      qb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });
    }

    const rows = await qb
      .select([
        'log.plant_id AS "plantId"',
        'plant.plant_name AS "plantName"',
        'AVG(CAST(log.efficiency_value AS decimal(18,6))) AS "avgEfficiency"',
        'SUM(CAST(log.energy_kwh AS decimal(18,6))) AS "sumEnergyKwh"',
        'SUM(CAST(log.runtime_hours AS decimal(18,6))) AS "sumRuntimeHours"',
        'COUNT(1) AS "records"',
      ])
      .groupBy('log.plant_id')
      .addGroupBy('plant.plant_name')
      .getRawMany<{ plantId: string; plantName: string; avgEfficiency: string | null; sumEnergyKwh: string | null; sumRuntimeHours: string | null; records: string }>();

    const withMetrics = rows.map((row) => {
      const avgEfficiency = Number(row.avgEfficiency ?? 0);
      const energyKwh = Number(row.sumEnergyKwh ?? 0);
      const runtimeHours = Number(row.sumRuntimeHours ?? 0);
      const energyPerRuntime = runtimeHours > 0 ? energyKwh / runtimeHours : 0;
      return {
        plantId: row.plantId,
        plantName: row.plantName ?? 'Unknown',
        avgEfficiency,
        energyPerRuntime,
        records: Number(row.records || 0),
      };
    });

    const efficiencyValues = withMetrics.map((row) => row.avgEfficiency);
    const energyValues = withMetrics.map((row) => row.energyPerRuntime);
    const minEff = Math.min(...efficiencyValues, 0);
    const maxEff = Math.max(...efficiencyValues, 1);
    const minEnergy = Math.min(...energyValues, 0);
    const maxEnergy = Math.max(...energyValues, 1);

    const scored = withMetrics.map((row) => {
      const effNorm = maxEff === minEff ? 100 : ((row.avgEfficiency - minEff) / (maxEff - minEff)) * 100;
      const energyNorm = maxEnergy === minEnergy ? 100 : ((row.energyPerRuntime - minEnergy) / (maxEnergy - minEnergy)) * 100;
      const composite = clamp(effNorm * 0.65 + (100 - energyNorm) * 0.35, 0, 100);
      return {
        ...row,
        rankingScore: Number(composite.toFixed(2)),
      };
    });

    const allScores = scored.map((item) => item.rankingScore);
    const ranked = scored
      .map((item) => ({
        ...item,
        percentile: Number(percentileRank(allScores, item.rankingScore).toFixed(2)),
      }))
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .map((item, index, arr) => {
        const avgScore = mean(arr.map((row) => row.rankingScore));
        const delta = item.rankingScore - avgScore;
        const recommendation =
          delta < -8
            ? `${item.plantName} is below peer average by ${Math.abs(delta).toFixed(1)} points. Prioritize reliability and efficiency audits.`
            : delta > 8
              ? `${item.plantName} is outperforming peers by ${delta.toFixed(1)} points. Reuse practices as benchmark template.`
              : `${item.plantName} is near peer baseline. Focus on targeted optimizations and threshold tuning.`;
        return {
          rank: index + 1,
          ...item,
          recommendation,
        };
      });

    res.json(
      ok({
        from: range.from,
        to: range.to,
        assetType: query.assetType ?? null,
        plants: ranked,
      }),
    );
  } catch (error) {
    next(error);
  }
});

insightsRouter.get('/insights/asset-anomalies', async (req, res, next) => {
  try {
    const query = performanceQuerySchema.parse(req.query);
    const range = resolveDateRange(query.from, query.to, 30);

    const qb = AppDataSource.getRepository(AssetPerformanceLogEntity)
      .createQueryBuilder('log')
      .innerJoin('assets', 'asset', 'asset.id = log.asset_id AND asset.is_active = true')
      .leftJoin('plants', 'plant', 'plant.id = log.plant_id')
      .where('log.is_active = :active', { active: true })
      .andWhere('log.captured_at >= :from', { from: range.from })
      .andWhere('log.captured_at <= :to', { to: range.to });

    if (query.assetType) {
      qb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });
    } else {
      qb.andWhere('asset.asset_type = :assetType', { assetType: 'BOILER' });
    }

    const plantRows = await qb
      .select([
        'log.plant_id AS "plantId"',
        'plant.plant_name AS "plantName"',
        'asset.asset_type AS "assetType"',
        'AVG(CAST(log.efficiency_value AS decimal(18,6))) AS "avgEfficiency"',
        'COUNT(1) AS records',
      ])
      .groupBy('log.plant_id')
      .addGroupBy('plant.plant_name')
      .addGroupBy('asset.asset_type')
      .getRawMany<{ plantId: string; plantName: string; assetType: string; avgEfficiency: string | null; records: string }>();

    const mapped = plantRows
      .map((row) => ({
        plantId: row.plantId,
        plantName: row.plantName ?? 'Unknown',
        assetType: row.assetType,
        avgEfficiency: Number(row.avgEfficiency ?? 0),
        records: Number(row.records || 0),
      }))
      .filter((item) => item.records > 0);

    const values = mapped.map((item) => item.avgEfficiency);
    const avg = mean(values);
    const stdev = stdDeviation(values);
    const threshold = avg - 2 * stdev;

    const anomalies = mapped
      .filter((item) => stdev > 0 && item.avgEfficiency < threshold)
      .map((item) => {
        const dropPercent = avg > 0 ? ((avg - item.avgEfficiency) / avg) * 100 : 0;
        return {
          ...item,
          benchmarkMean: Number(avg.toFixed(3)),
          standardDeviation: Number(stdev.toFixed(3)),
          anomalyThreshold: Number(threshold.toFixed(3)),
          deviationPercent: Number(dropPercent.toFixed(2)),
          recommendation: `${item.plantName} ${item.assetType} efficiency is ${dropPercent.toFixed(1)}% below benchmark. Suggest immediate maintenance review and combustion tuning.`,
        };
      })
      .sort((a, b) => b.deviationPercent - a.deviationPercent);

    res.json(
      ok({
        from: range.from,
        to: range.to,
        assetType: query.assetType ?? 'BOILER',
        benchmarkMean: Number(avg.toFixed(3)),
        standardDeviation: Number(stdev.toFixed(3)),
        anomalies,
      }),
    );
  } catch (error) {
    next(error);
  }
});
