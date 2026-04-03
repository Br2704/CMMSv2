import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetDowntimeEventEntity, AssetEntity, AssetPerformanceLogEntity, WorkOrderEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { clamp, mean, resolveDateRange, safeNumber } from '../../utils/advancedAnalytics';

function overlapHours(start: Date, end: Date, range: { from: Date; to: Date }) {
  const effectiveStart = Math.max(start.getTime(), range.from.getTime());
  const effectiveEnd = Math.min(end.getTime(), range.to.getTime());
  if (effectiveEnd <= effectiveStart) return 0;
  return (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
}

function riskLevelFromProbability(probability: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (probability >= 0.75) return 'CRITICAL';
  if (probability >= 0.55) return 'HIGH';
  if (probability >= 0.3) return 'MEDIUM';
  return 'LOW';
}

function failureWindowFromProbability(probability: number) {
  if (probability >= 0.75) return '0-7 days';
  if (probability >= 0.55) return '7-21 days';
  if (probability >= 0.3) return '21-45 days';
  return '45-90 days';
}

async function calculateAssetRisk(asset: AssetEntity, range: { from: Date; to: Date }) {
  const downtimeRepo = AppDataSource.getRepository(AssetDowntimeEventEntity);
  const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
  const performanceRepo = AppDataSource.getRepository(AssetPerformanceLogEntity);

  const events = await downtimeRepo
    .createQueryBuilder('event')
    .where('event.asset_id = :assetId', { assetId: asset.id })
    .andWhere('event.is_active = :active', { active: true })
    .andWhere('event.started_at <= :to', { to: range.to })
    .andWhere('(event.ended_at IS NULL OR event.ended_at >= :from)', { from: range.from })
    .getMany();

  let failureCount = 0;
  let downtimeHours = 0;
  for (const event of events) {
    const endedAt = event.endedAt ?? range.to;
    downtimeHours += overlapHours(event.startedAt, endedAt, range);
    if (event.isFailureEvent) {
      failureCount += 1;
    }
  }

  if (events.length === 0) {
    const workOrders = await workOrderRepo
      .createQueryBuilder('wo')
      .where('wo.asset_id = :assetId', { assetId: asset.id })
      .andWhere('wo.is_failure_event = :isFailureEvent', { isFailureEvent: true })
      .andWhere('COALESCE(wo.downtime_start_at, wo.started_at, wo.opened_at) <= :to', { to: range.to })
      .andWhere('COALESCE(wo.downtime_end_at, wo.resolved_at, wo.closed_at, :to) >= :from', { from: range.from, to: range.to })
      .getMany();

    for (const wo of workOrders) {
      const startedAt = wo.downtimeStartAt ?? wo.startedAt ?? wo.openedAt;
      const endedAt = wo.downtimeEndAt ?? wo.resolvedAt ?? wo.closedAt ?? range.to;
      if (!startedAt) continue;
      failureCount += 1;
      downtimeHours += overlapHours(startedAt, endedAt, range);
    }
  }

  const performanceLogs = await performanceRepo
    .createQueryBuilder('log')
    .where('log.asset_id = :assetId', { assetId: asset.id })
    .andWhere('log.is_active = :active', { active: true })
    .andWhere('log.captured_at >= :from', { from: range.from })
    .andWhere('log.captured_at <= :to', { to: range.to })
    .orderBy('log.captured_at', 'ASC')
    .getMany();

  const efficiencySeries = performanceLogs.map((log) => safeNumber(log.efficiencyValue)).filter((value) => value > 0);
  const recentEfficiency = efficiencySeries.slice(-8);
  const avgEfficiency = recentEfficiency.length ? mean(recentEfficiency) : 0;

  let trendPenalty = 0;
  if (efficiencySeries.length >= 4) {
    const firstHalf = mean(efficiencySeries.slice(0, Math.floor(efficiencySeries.length / 2)));
    const secondHalf = mean(efficiencySeries.slice(Math.floor(efficiencySeries.length / 2)));
    const decline = firstHalf - secondHalf;
    trendPenalty = decline > 0 ? clamp(decline * 0.8, 0, 20) : 0;
  }

  const windowDays = Math.max((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24), 1);
  const failureRate = failureCount / windowDays;
  const downtimeRatio = downtimeHours / (windowDays * 24);
  const efficiencyPenalty = avgEfficiency > 0 ? clamp((75 - avgEfficiency) * 0.9, 0, 25) : 10;

  const riskScorePenalty = clamp(failureCount * 6 + downtimeHours * 0.4 + efficiencyPenalty + trendPenalty, 0, 95);
  const healthScore = clamp(100 - riskScorePenalty, 1, 100);
  const failureProbability = clamp(0.05 + failureRate * 0.45 + downtimeRatio * 0.7 + efficiencyPenalty / 220, 0.01, 0.99);
  const riskLevel = riskLevelFromProbability(failureProbability);

  const recommendation =
    riskLevel === 'CRITICAL'
      ? 'Immediate inspection and shutdown planning recommended. Create emergency work order and investigate failure root cause.'
      : riskLevel === 'HIGH'
        ? 'Schedule preventive maintenance within this week, verify alignment/lubrication, and review spare readiness.'
        : riskLevel === 'MEDIUM'
          ? 'Increase monitoring frequency and recalibrate thresholds. Plan maintenance in next cycle.'
          : 'Maintain standard PM cycle and continue periodic condition monitoring.';

  return {
    healthScore: Number(healthScore.toFixed(2)),
    riskLevel,
    failureProbability: Number(failureProbability.toFixed(4)),
    predictedFailureWindow: failureWindowFromProbability(failureProbability),
    recommendation,
    diagnostics: {
      failureCount,
      downtimeHours: Number(downtimeHours.toFixed(2)),
      avgEfficiency: Number(avgEfficiency.toFixed(2)),
      trendPenalty: Number(trendPenalty.toFixed(2)),
      records: performanceLogs.length,
      range,
    },
  };
}

const assetRiskQuerySchema = z.object({
  assetId: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const highRiskQuerySchema = z.object({
  plantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const predictiveRouter = Router();
predictiveRouter.use(requireAuth);

predictiveRouter.get('/predictive/asset-risk', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const query = assetRiskQuerySchema.parse(req.query);
    const range = resolveDateRange(query.from, query.to, 90);

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id: query.assetId, isActive: true });
    if (!asset) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    ensurePlantAccess(req, asset.plantId);
    const result = await calculateAssetRisk(asset, range);

    asset.assetHealthScore = result.healthScore.toFixed(2);
    asset.riskLevel = result.riskLevel;
    asset.failureProbability = result.failureProbability.toFixed(4);
    await assetRepo.save(asset);

    res.json(ok({ assetId: asset.id, ...result }, 'Asset risk prediction computed'));
  } catch (error) {
    next(error);
  }
});

predictiveRouter.get('/predictive/high-risk', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const query = highRiskQuerySchema.parse(req.query);
    const range = resolveDateRange(query.from, query.to, 90);
    if (query.plantId) {
      ensurePlantAccess(req, query.plantId);
    }

    const repo = AppDataSource.getRepository(AssetEntity);
    const qb = repo.createQueryBuilder('asset').where('asset.is_active = :active', { active: true });
    if (query.plantId) {
      qb.andWhere('asset.plant_id = :plantId', { plantId: query.plantId });
    } else if (req.auth?.scopeType === 'ORGANIZATION' || !req.auth?.accessAllPlants) {
      if (!req.auth?.plantIds.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds: req.auth.plantIds });
      }
    }
    const assets = await qb.getMany();

    const risks = await Promise.all(
      assets.map(async (asset) => {
        const risk = await calculateAssetRisk(asset, range);
        return {
          assetId: asset.id,
          code: asset.code,
          name: asset.name,
          plantId: asset.plantId,
          departmentId: asset.departmentId,
          moduleId: asset.moduleId,
          assetType: asset.assetType,
          ...risk,
        };
      }),
    );

    const topRisk = risks.sort((a, b) => b.failureProbability - a.failureProbability).slice(0, query.limit);
    res.json(ok(topRisk, 'High risk assets fetched'));
  } catch (error) {
    next(error);
  }
});
