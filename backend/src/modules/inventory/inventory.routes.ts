import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, SpareItemEntity, StockRequestEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { buildPagination, listQuerySchema, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';

const optionalUuidQuery = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().uuid().optional());

const optionalBooleanQuery = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}, z.boolean().optional());

const inventoryListQuerySchema = listQuerySchema.extend({
  assetId: optionalUuidQuery,
  isCritical: optionalBooleanQuery,
});

const spareSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  currentStock: z.number().int().nonnegative().default(0),
  minLevel: z.number().int().nonnegative().default(0),
  reorderLevel: z.number().int().nonnegative().default(0),
  unit: z.string().default('Pcs'),
  location: z.string().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  isCritical: z.boolean().default(false),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

const stockRequestSchema = z.object({
  spareItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  requestedBy: z.string().uuid().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  status: z.string().default('PENDING'),
  remarks: z.string().nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
  plantId: z.string().uuid().nullable().optional(),
});

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get('/inventory', requirePermission('INVENTORY', 'READ'), async (req, res, next) => {
  try {
    const extendedQuery = inventoryListQuerySchema.parse(req.query as Record<string, unknown>);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(SpareItemEntity);
    const qb = repo.createQueryBuilder('item');
    applySearch(qb, 'item', query.search, ['code', 'name', 'category', 'location']);
    applyPlantScope(qb, 'item', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('item.is_active = :isActive', { isActive: true });
    }
    if (extendedQuery.assetId) {
      qb.andWhere('item.asset_id = :assetId', { assetId: extendedQuery.assetId });
    }
    if (extendedQuery.isCritical !== undefined) {
      qb.andWhere('item.is_critical = :isCritical', { isCritical: extendedQuery.isCritical });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('item.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Inventory items fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/inventory', requirePermission('INVENTORY', 'CREATE'), async (req, res, next) => {
  try {
    const body = spareSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    if (body.assetId) {
      const asset = await AppDataSource.getRepository(AssetEntity).findOneBy({ id: body.assetId, isActive: true });
      if (!asset || asset.plantId !== resolvedPlantId) {
        res.status(400).json({ success: false, message: 'Selected machine does not belong to the current plant' });
        return;
      }
    }
    const repo = AppDataSource.getRepository(SpareItemEntity);
    const created = repo.create({ ...body, plantId: resolvedPlantId });
    await repo.save(created);
    res.status(201).json(ok(created, 'Inventory item created'));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.patch('/inventory/:id', requirePermission('INVENTORY', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = spareSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(SpareItemEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Spare item not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    const nextAssetId = body.assetId === undefined ? entity.assetId : body.assetId;
    if (nextAssetId) {
      const asset = await AppDataSource.getRepository(AssetEntity).findOneBy({ id: nextAssetId, isActive: true });
      if (!asset || asset.plantId !== nextPlantId) {
        res.status(400).json({ success: false, message: 'Selected machine does not belong to the current plant' });
        return;
      }
    }
    Object.assign(entity, { ...body, plantId: nextPlantId });
    await repo.save(entity);
    res.json(ok(entity, 'Inventory item updated'));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.delete('/inventory/:id', requirePermission('INVENTORY', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(SpareItemEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Spare item not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    res.json(ok({ id: entity.id, deleted: true }, 'Inventory item deactivated'));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.get('/stock-requests', requirePermission('INVENTORY', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(StockRequestEntity);
    const qb = repo.createQueryBuilder('request');
    applySearch(qb, 'request', query.search, ['status', 'remarks']);
    applyPlantScope(qb, 'request', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('request.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Stock requests fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/stock-requests', requirePermission('INVENTORY', 'CREATE'), async (req, res, next) => {
  try {
    const body = stockRequestSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const repo = AppDataSource.getRepository(StockRequestEntity);
    const created = repo.create({
      ...body,
      plantId: resolvedPlantId,
      requestedBy: body.requestedBy ?? req.auth!.userId,
      approvedAt: body.approvedAt ? new Date(body.approvedAt) : null,
      remarks: body.remarks ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Stock request created'));
  } catch (error) {
    next(error);
  }
});

inventoryRouter.patch('/stock-requests/:id', requirePermission('INVENTORY', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = stockRequestSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(StockRequestEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Stock request not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);

    Object.assign(entity, body);
    if (body.approvedAt !== undefined) entity.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
    await repo.save(entity);
    res.json(ok(entity, 'Stock request updated'));
  } catch (error) {
    next(error);
  }
});
