import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, AssetPerformanceLogEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { evaluatePerformanceLogAlerts } from '../../utils/alerts';
import { buildPagination, parseListQuery } from '../../utils/pagination';

const basePerformanceLogSchema = z.object({
  plantId: z.string().uuid(),
  assetId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  runtimeHours: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  energyKwh: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  productionOutput: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  efficiencyValue: z.coerce.number().min(0).max(100_000).nullable().optional(),
  efficiencyUnit: z.string().max(64).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const createPerformanceLogSchema = basePerformanceLogSchema;
const patchPerformanceLogSchema = basePerformanceLogSchema.partial();

function toNullableString(value: number | null | undefined) {
  if (value === undefined || value === null) return null;
  return value.toString();
}

function isPercentUnit(unit?: string | null) {
  if (!unit) return true;
  const normalized = unit.trim().toLowerCase();
  return normalized === '%' || normalized === 'percent' || normalized === 'percentage';
}

function validatePerformanceInput(body: z.infer<typeof basePerformanceLogSchema>) {
  if (body.runtimeHours !== null && body.runtimeHours !== undefined && body.runtimeHours > 744) {
    return 'runtimeHours cannot exceed 744 hours for a single record';
  }
  if (body.runtimeHours !== null && body.runtimeHours !== undefined && body.energyKwh !== null && body.energyKwh !== undefined) {
    if (body.runtimeHours === 0 && body.energyKwh > 0) {
      return 'energyKwh must be 0 when runtimeHours is 0';
    }
  }
  if (body.efficiencyValue !== null && body.efficiencyValue !== undefined) {
    const maxEfficiency = isPercentUnit(body.efficiencyUnit) ? 100 : 10_000;
    if (body.efficiencyValue > maxEfficiency) {
      return `efficiencyValue exceeds realistic range for unit ${body.efficiencyUnit ?? '%'}`;
    }
  }
  return null;
}

export const performanceLogsRouter = Router();
performanceLogsRouter.use(requireAuth);

performanceLogsRouter.post('/performance-logs', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const body = createPerformanceLogSchema.parse(req.body);
    const validationError = validatePerformanceInput(body);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }

    ensurePlantAccess(req, body.plantId);

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id: body.assetId });
    if (!asset || !asset.isActive) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }
    if (asset.plantId !== body.plantId) {
      res.status(400).json({ success: false, message: 'Asset does not belong to selected plant' });
      return;
    }

    const repo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const created = repo.create({
      plantId: body.plantId,
      assetId: body.assetId,
      capturedAt: new Date(body.capturedAt),
      runtimeHours: toNullableString(body.runtimeHours),
      energyKwh: toNullableString(body.energyKwh),
      productionOutput: toNullableString(body.productionOutput),
      efficiencyValue: toNullableString(body.efficiencyValue),
      efficiencyUnit: body.efficiencyUnit ?? null,
      notes: body.notes ?? null,
      isActive: true,
    });

    await repo.save(created);
    await evaluatePerformanceLogAlerts(created, asset, req.auth?.userId ?? null);
    res.status(201).json(ok(created, 'Performance log created'));
  } catch (error) {
    next(error);
  }
});

performanceLogsRouter.get('/performance-logs', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = z
      .object({
        assetId: z.string().uuid().optional(),
        plantId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(req.query);

    if (filters.plantId) {
      ensurePlantAccess(req, filters.plantId);
    }

    const repo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const qb = repo.createQueryBuilder('log').where('log.is_active = :active', { active: true });

    if (filters.assetId) {
      qb.andWhere('log.asset_id = :assetId', { assetId: filters.assetId });
    }

    if (filters.plantId) {
      qb.andWhere('log.plant_id = :plantId', { plantId: filters.plantId });
    }

    if (filters.from) {
      qb.andWhere('log.captured_at >= :from', { from: new Date(filters.from) });
    }

    if (filters.to) {
      qb.andWhere('log.captured_at <= :to', { to: new Date(filters.to) });
    }

    const scopedPlantIds = req.auth?.plantIds ?? [];
    if (!scopedPlantIds.length) {
      qb.andWhere('1=0');
    } else {
      qb.andWhere('log.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }

    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('log.captured_at', 'DESC');

    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Performance logs fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

performanceLogsRouter.patch('/performance-logs/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = patchPerformanceLogSchema.parse(req.body);

    const repo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);

    const entity = await repo.findOneBy({ id: params.id });
    if (!entity || !entity.isActive) {
      res.status(404).json({ success: false, message: 'Performance log not found' });
      return;
    }

    const nextPlantId = body.plantId ?? entity.plantId;
    ensurePlantAccess(req, nextPlantId);

    const nextAssetId = body.assetId ?? entity.assetId;
    const asset = await assetRepo.findOneBy({ id: nextAssetId });
    if (!asset || !asset.isActive) {
      res.status(404).json({ success: false, message: 'Asset not found' });
      return;
    }

    if (asset.plantId !== nextPlantId) {
      res.status(400).json({ success: false, message: 'Asset does not belong to selected plant' });
      return;
    }

    const mergedInput: z.infer<typeof basePerformanceLogSchema> = {
      plantId: nextPlantId,
      assetId: nextAssetId,
      capturedAt: (body.capturedAt ? new Date(body.capturedAt) : entity.capturedAt).toISOString(),
      runtimeHours: body.runtimeHours === undefined ? (entity.runtimeHours === null ? null : Number(entity.runtimeHours)) : body.runtimeHours,
      energyKwh: body.energyKwh === undefined ? (entity.energyKwh === null ? null : Number(entity.energyKwh)) : body.energyKwh,
      productionOutput:
        body.productionOutput === undefined ? (entity.productionOutput === null ? null : Number(entity.productionOutput)) : body.productionOutput,
      efficiencyValue: body.efficiencyValue === undefined ? (entity.efficiencyValue === null ? null : Number(entity.efficiencyValue)) : body.efficiencyValue,
      efficiencyUnit: body.efficiencyUnit === undefined ? entity.efficiencyUnit : body.efficiencyUnit,
      notes: body.notes === undefined ? entity.notes : body.notes,
    };
    const validationError = validatePerformanceInput(mergedInput);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }

    entity.plantId = nextPlantId;
    entity.assetId = nextAssetId;
    if (body.capturedAt !== undefined) entity.capturedAt = new Date(body.capturedAt);
    if (body.runtimeHours !== undefined) entity.runtimeHours = toNullableString(body.runtimeHours);
    if (body.energyKwh !== undefined) entity.energyKwh = toNullableString(body.energyKwh);
    if (body.productionOutput !== undefined) entity.productionOutput = toNullableString(body.productionOutput);
    if (body.efficiencyValue !== undefined) entity.efficiencyValue = toNullableString(body.efficiencyValue);
    if (body.efficiencyUnit !== undefined) entity.efficiencyUnit = body.efficiencyUnit ?? null;
    if (body.notes !== undefined) entity.notes = body.notes ?? null;

    await repo.save(entity);
    await evaluatePerformanceLogAlerts(entity, asset, req.auth?.userId ?? null);
    res.json(ok(entity, 'Performance log updated'));
  } catch (error) {
    next(error);
  }
});

performanceLogsRouter.delete('/performance-logs/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(AssetPerformanceLogEntity);

    const entity = await repo.findOneBy({ id: params.id });
    if (!entity || !entity.isActive) {
      res.status(404).json({ success: false, message: 'Performance log not found' });
      return;
    }

    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);

    res.json(ok({ id: entity.id, deleted: true }, 'Performance log deleted'));
  } catch (error) {
    next(error);
  }
});
