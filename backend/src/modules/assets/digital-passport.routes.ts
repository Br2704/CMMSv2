import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, WorkOrderEntity, PmScheduleEntity, LogEntryEntity, PendingExecutionEntity, RecordRevisionEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess } from '../../middlewares/permissionGuard';
import { notFound, forbidden } from '../../utils/httpError';

const router = Router();
router.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

router.get('/:id/passport', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id });

    if (!asset) {
      throw notFound('Asset not found');
    }

    ensurePlantAccess(req, asset.plantId);

    // Fetch Asset Profile
    const profile = asset;

    // Fetch WO History
    const woRepo = AppDataSource.getRepository(WorkOrderEntity);
    const workOrders = await woRepo.find({
      where: { assetId: id },
      order: { createdAt: 'DESC' },
      take: 20
    });

    // Fetch PM/PD History
    const pmRepo = AppDataSource.getRepository(PmScheduleEntity);
    const pms = await pmRepo.find({
      where: { assetId: id },
      order: { createdAt: 'DESC' },
      take: 20
    });

    // Fetch Log History
    const logRepo = AppDataSource.getRepository(LogEntryEntity);
    const logs = await logRepo.find({
      where: { machineId: id },
      order: { createdAt: 'DESC' },
      take: 20
    });

    // Fetch Approval & Execution History via referenceId
    const pendingExecutionRepo = AppDataSource.getRepository(PendingExecutionEntity);
    
    // We get executions that referenced any logs or PMs linked to this asset.
    // For simplicity, we query those directly based on IDs we found.
    const logIds = logs.map(l => l.id);
    const pmIds = pms.map(p => p.id);
    const referenceIds = [...logIds, ...pmIds];
    
    let executions: any[] = [];
    if (referenceIds.length > 0) {
      const qb = pendingExecutionRepo.createQueryBuilder('pe');
      qb.where('pe.referenceId IN (:...referenceIds)', { referenceIds })
        .orderBy('pe.createdAt', 'DESC')
        .take(50);
      executions = await qb.getMany();
    }

    // Fetch Revision History
    const revisionRepo = AppDataSource.getRepository(RecordRevisionEntity);
    let revisions: any[] = [];
    if (referenceIds.length > 0) {
      const qb = revisionRepo.createQueryBuilder('rev');
      qb.where('rev.recordId IN (:...referenceIds)', { referenceIds })
        .orWhere('rev.recordId = :assetId', { assetId: id })
        .orderBy('rev.createdAt', 'DESC')
        .take(50);
      revisions = await qb.getMany();
    }

    // Determine Compliance History (mock logic: completed vs scheduled ratio)
    const completedPms = pms.filter(p => p.status === 'COMPLETED').length;
    const pmCompliance = pms.length > 0 ? (completedPms / pms.length) * 100 : 100;

    res.json({
      success: true,
      data: {
        profile,
        workOrders,
        pmHistory: pms,
        logHistory: logs,
        approvalHistory: executions,
        revisionHistory: revisions,
        compliance: {
          pmCompliance: Math.round(pmCompliance)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

export const digitalPassportRouter = router;
