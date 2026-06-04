import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { ShiftHandoverEntity, WorkOrderEntity, PmScheduleEntity, PendingExecutionEntity, AssetEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { resolveScopedPlantId } from '../../utils/plantScope';

export const shiftHandoverRouter = Router();
shiftHandoverRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

shiftHandoverRouter.get('/shift-handovers', async (req, res, next) => {
  try {
    const query = z.object({
      plantId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
    }).parse(req.query);

    const resolvedPlantId = resolveScopedPlantId(req.auth!, query.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(ShiftHandoverEntity);
    const qb = repo.createQueryBuilder('handover')
      .leftJoinAndSelect('handover.shift', 'shift')
      .leftJoinAndSelect('handover.department', 'department')
      .leftJoinAndSelect('handover.handedOverByUser', 'handedOverByUser')
      .leftJoinAndSelect('handover.receivedByUser', 'receivedByUser')
      .where('handover.plantId = :plantId', { plantId: resolvedPlantId });

    if (query.departmentId) {
      qb.andWhere('handover.departmentId = :departmentId', { departmentId: query.departmentId });
    }

    qb.orderBy('handover.createdAt', 'DESC').take(50);
    const rows = await qb.getMany();
    res.json(ok(rows, 'Shift handovers fetched'));
  } catch (error) {
    next(error);
  }
});

shiftHandoverRouter.post('/shift-handovers/generate', async (req, res, next) => {
  try {
    const body = z.object({
      plantId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      shiftId: z.string().uuid(),
    }).parse(req.body);

    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    // Aggregate counts
    const woRepo = AppDataSource.getRepository(WorkOrderEntity);
    const pendingWoCount = await woRepo.createQueryBuilder('wo')
      .where('wo.plantId = :plantId', { plantId: resolvedPlantId })
      .andWhere('wo.status IN (:...statuses)', { statuses: ['OPEN', 'IN_PROGRESS'] })
      .getCount();

    const pmRepo = AppDataSource.getRepository(PmScheduleEntity);
    const pendingPmCount = await pmRepo.createQueryBuilder('pm')
      .where('pm.plantId = :plantId', { plantId: resolvedPlantId })
      .andWhere('pm.status = :status', { status: 'SCHEDULED' })
      .andWhere('pm.maintenanceType = :type', { type: 'PM' })
      .getCount();
      
    const pendingPdCount = await pmRepo.createQueryBuilder('pm')
      .where('pm.plantId = :plantId', { plantId: resolvedPlantId })
      .andWhere('pm.status = :status', { status: 'SCHEDULED' })
      .andWhere('pm.maintenanceType = :type', { type: 'PD' })
      .getCount();

    const pendingExecutionRepo = AppDataSource.getRepository(PendingExecutionEntity);
    const pendingLogsCount = await pendingExecutionRepo.createQueryBuilder('pe')
      .where('pe.status = :status', { status: 'PENDING_L1' })
      .andWhere('pe.executionType = :type', { type: 'LOG_ENTRY' })
      .getCount();

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const assets = await assetRepo.find({ where: { plantId: resolvedPlantId as any }, select: ['id', 'name', 'status'] });
    const machineStatusSummary = assets.reduce((acc, asset) => {
      acc[asset.status] = (acc[asset.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json(ok({
      pendingWoCount,
      pendingPmCount,
      pendingPdCount,
      pendingLogsCount,
      machineStatusSummary
    }, 'Shift handover data generated'));
  } catch (error) {
    next(error);
  }
});

shiftHandoverRouter.post('/shift-handovers', async (req, res, next) => {
  try {
    const body = z.object({
      plantId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      shiftId: z.string().uuid(),
      pendingWoCount: z.number().int().min(0),
      pendingPmCount: z.number().int().min(0),
      pendingPdCount: z.number().int().min(0),
      pendingLogsCount: z.number().int().min(0),
      machineStatusSummary: z.any().optional(),
      followUpActions: z.string().nullable().optional()
    }).parse(req.body);

    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(ShiftHandoverEntity);
    const handover = repo.create({
      ...body,
      plantId: resolvedPlantId as any,
      handedOverBy: req.auth!.userId,
      status: 'PENDING_RECEIPT'
    });

    await repo.save(handover);
    res.status(201).json(ok(handover, 'Shift handover submitted'));
  } catch (error) {
    next(error);
  }
});

shiftHandoverRouter.post('/shift-handovers/:id/receive', async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const repo = AppDataSource.getRepository(ShiftHandoverEntity);
    const handover = await repo.findOneBy({ id: params.id });

    if (!handover) {
      res.status(404).json({ success: false, message: 'Shift handover not found' });
      return;
    }

    ensurePlantAccess(req, handover.plantId);

    handover.status = 'COMPLETED';
    handover.receivedBy = req.auth!.userId;
    await repo.save(handover);

    res.json(ok(handover, 'Shift handover received'));
  } catch (error) {
    next(error);
  }
});
