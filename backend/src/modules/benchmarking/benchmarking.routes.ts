import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, AssetPerformanceLogEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';

const ALLOWED_ASSET_TYPES = ['BOILER', 'COMPRESSOR', 'CHILLER', 'HVAC', 'PUMP', 'MOTOR', 'GENERATOR', 'FAN', 'CONVEYOR', 'ROBOT', 'CNC', 'TRANSFORMER', 'GEARBOX', 'COOLING_TOWER'] as const;

const compareQuerySchema = z
  .object({
    assetType: z.enum(ALLOWED_ASSET_TYPES),
    window: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
    metric: z.enum(['efficiencyValue', 'energyPerRuntime', 'energyKwh', 'runtimeHours', 'productionOutput']).default('efficiencyValue'),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.window === 'custom' && (!value.from || !value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'from and to are required for custom window' });
    }
  });

function resolveWindow(window: '7d' | '30d' | '90d' | 'custom', from?: string, to?: string) {
  if (window === 'custom' && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }

  const now = new Date();
  const days = window === '7d' ? 7 : window === '90d' ? 90 : 30;
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return { from: start, to: now };
}

function getMetricValue(metric: string, row: AssetPerformanceLogEntity) {
  const energy = row.energyKwh ? Number(row.energyKwh) : null;
  const runtime = row.runtimeHours ? Number(row.runtimeHours) : null;
  const productionOutput = row.productionOutput ? Number(row.productionOutput) : null;
  const efficiency = row.efficiencyValue ? Number(row.efficiencyValue) : null;

  if (metric === 'efficiencyValue') return efficiency;
  if (metric === 'energyKwh') return energy;
  if (metric === 'runtimeHours') return runtime;
  if (metric === 'productionOutput') return productionOutput;
  if (metric === 'energyPerRuntime') {
    if (!energy || !runtime || runtime <= 0) return null;
    return energy / runtime;
  }

  return null;
}

export const benchmarkingRouter = Router();
benchmarkingRouter.use(requireAuth);

benchmarkingRouter.get('/benchmarking/asset-types', requireRole(['SUPERADMIN']), requirePermission('BENCHMARKING', 'READ'), async (req, res, next) => {
  try {
    const rowsQb = AppDataSource.getRepository(AssetEntity)
      .createQueryBuilder('asset')
      .select('DISTINCT asset.asset_type', 'assetType')
      .where('asset.is_active = :active', { active: true })
      .andWhere('asset.asset_type IS NOT NULL');

    const scopedPlantIds = req.auth?.plantIds ?? [];
    if (scopedPlantIds.length === 0) {
      rowsQb.andWhere('1=0');
    } else {
      rowsQb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }

    const rows = await rowsQb.orderBy('asset.asset_type', 'ASC').getRawMany<{ assetType: string }>();

    res.json(ok(rows.map((item) => item.assetType).filter(Boolean), 'Asset types fetched'));
  } catch (error) {
    next(error);
  }
});

benchmarkingRouter.get('/benchmarking/assets', requireRole(['SUPERADMIN']), requirePermission('BENCHMARKING', 'READ'), async (req, res, next) => {
  try {
    const query = z
      .object({
        assetType: z.enum(ALLOWED_ASSET_TYPES),
        plantId: z.string().uuid().optional(),
      })
      .parse(req.query);

    if (query.plantId) {
      ensurePlantAccess(req, query.plantId);
    }

    const qb = AppDataSource.getRepository(AssetEntity)
      .createQueryBuilder('asset')
      .where('asset.is_active = :active', { active: true })
      .andWhere('asset.asset_type = :assetType', { assetType: query.assetType });

    if (query.plantId) {
      qb.andWhere('asset.plant_id = :plantId', { plantId: query.plantId });
    } else {
      const scopedPlantIds = req.auth?.plantIds ?? [];
      if (!scopedPlantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
      }
    }

    const data = await qb
      .select(['asset.id', 'asset.code', 'asset.name', 'asset.plant_id AS "plantId"', 'asset.asset_type AS "assetType"'])
      .orderBy('asset.name', 'ASC')
      .getRawMany();

    res.json(ok(data, 'Benchmarking assets fetched'));
  } catch (error) {
    next(error);
  }
});

benchmarkingRouter.get('/benchmarking/compare', requireRole(['SUPERADMIN']), requirePermission('BENCHMARKING', 'READ'), async (req, res, next) => {
  try {
    const query = compareQuerySchema.parse(req.query);
    const range = resolveWindow(query.window, query.from, query.to);

    const logRepo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const rows = await logRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.asset', 'asset')
      .leftJoinAndSelect('log.plant', 'plant')
      .where('log.is_active = :active', { active: true })
      .andWhere('log.captured_at >= :from', { from: range.from })
      .andWhere('log.captured_at <= :to', { to: range.to })
      .andWhere('asset.asset_type = :assetType', { assetType: query.assetType })
      .andWhere(
        (req.auth?.plantIds ?? []).length > 0 ? 'log.plant_id IN (:...plantIds)' : '1=0',
        { plantIds: req.auth?.plantIds ?? [] },
      )
      .orderBy('log.captured_at', 'DESC')
      .getMany();

    const perPlant = new Map<
      string,
      { plantId: string; plantName: string; values: number[]; lastValue: number | null; assets: Map<string, { assetId: string; assetCode: string; assetName: string; values: number[] }> }
    >();

    rows.forEach((row) => {
      const metricValue = getMetricValue(query.metric, row);
      if (metricValue === null || Number.isNaN(metricValue)) return;

      const plantId = row.plantId;
      const plantName = row.plant?.plantName ?? 'Unknown Plant';
      const asset = row.asset;
      if (!plantId || !asset?.id) return;

      if (!perPlant.has(plantId)) {
        perPlant.set(plantId, {
          plantId,
          plantName,
          values: [],
          lastValue: null,
          assets: new Map(),
        });
      }

      const plantEntry = perPlant.get(plantId)!;
      plantEntry.values.push(metricValue);
      if (plantEntry.lastValue === null) {
        plantEntry.lastValue = metricValue;
      }

      if (!plantEntry.assets.has(asset.id)) {
        plantEntry.assets.set(asset.id, {
          assetId: asset.id,
          assetCode: asset.code,
          assetName: asset.name,
          values: [],
        });
      }
      plantEntry.assets.get(asset.id)!.values.push(metricValue);
    });

    const plantStats = Array.from(perPlant.values()).map((entry) => {
      const sum = entry.values.reduce((acc, value) => acc + value, 0);
      const avg = entry.values.length ? sum / entry.values.length : 0;
      const min = entry.values.length ? Math.min(...entry.values) : 0;
      const max = entry.values.length ? Math.max(...entry.values) : 0;

      const assets = Array.from(entry.assets.values()).map((assetRow) => {
        const assetSum = assetRow.values.reduce((acc, value) => acc + value, 0);
        return {
          assetId: assetRow.assetId,
          assetCode: assetRow.assetCode,
          assetName: assetRow.assetName,
          avg: assetRow.values.length ? Number((assetSum / assetRow.values.length).toFixed(4)) : 0,
          min: assetRow.values.length ? Number(Math.min(...assetRow.values).toFixed(4)) : 0,
          max: assetRow.values.length ? Number(Math.max(...assetRow.values).toFixed(4)) : 0,
          count: assetRow.values.length,
        };
      });

      return {
        plantId: entry.plantId,
        plantName: entry.plantName,
        avg: Number(avg.toFixed(4)),
        min: Number(min.toFixed(4)),
        max: Number(max.toFixed(4)),
        count: entry.values.length,
        lastValue: entry.lastValue !== null ? Number(entry.lastValue.toFixed(4)) : null,
        assets,
      };
    });

    const ranking = [...plantStats].sort((a, b) => b.avg - a.avg);

    res.json(
      ok({
        assetType: query.assetType,
        metric: query.metric,
        from: range.from,
        to: range.to,
        plants: plantStats,
        ranking,
        topRankingPlants: ranking.slice(0, 5),
      }),
    );
  } catch (error) {
    next(error);
  }
});
