import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { MachineFailureCodeMappingEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { ok, fail } from '../../utils/apiResponse';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { activePlantId } = req.auth!;
    const repo = AppDataSource.getRepository(MachineFailureCodeMappingEntity);
    
    const query = repo.createQueryBuilder('mapping')
      .leftJoinAndSelect('mapping.machine', 'machine')
      .leftJoinAndSelect('mapping.requester', 'requester')
      .leftJoinAndSelect('mapping.approver', 'approver');
      
    if (activePlantId) {
      query.innerJoin('mapping.machine', 'm2', 'm2.plantId = :activePlantId', { activePlantId });
    }
    
    if (req.query.machineId) {
      query.andWhere('mapping.machineId = :machineId', { machineId: req.query.machineId });
    }
    
    if (req.query.status) {
      query.andWhere('mapping.status = :status', { status: req.query.status });
    }
    
    if (req.query.category) {
      query.andWhere('mapping.failureCategory = :category', { category: req.query.category });
    }
    
    const mappings = await query.getMany();
    res.json(ok(mappings, 'Fetched machine failure code mappings'));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { machineId, failureCategory, failureCode } = req.body;
    const { userId } = req.auth!;
    
    if (!machineId || !failureCategory || !failureCode) {
      res.status(400).json(fail('Machine, category, and code are required'));
      return;
    }
    
    const repo = AppDataSource.getRepository(MachineFailureCodeMappingEntity);
    
    // Check for existing
    const existing = await repo.findOne({
      where: { machineId, failureCategory, failureCode }
    });
    
    if (existing) {
      res.status(400).json(fail('This failure code is already mapped to this machine'));
      return;
    }
    
    const mapping = repo.create({
      machineId,
      failureCategory,
      failureCode,
      status: 'PENDING',
      requestedBy: userId,
    });
    
    await repo.save(mapping);
    
    res.json(ok(mapping, 'Mapping requested successfully and is pending approval'));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.auth!;
    
    const repo = AppDataSource.getRepository(MachineFailureCodeMappingEntity);
    const mapping = await repo.findOne({ where: { id } });
    
    if (!mapping) {
      res.status(404).json(fail('Mapping not found'));
      return;
    }
    
    mapping.status = 'APPROVED';
    mapping.approvedBy = userId;
    mapping.approvedAt = new Date();
    
    await repo.save(mapping);
    
    res.json(ok(mapping, 'Mapping approved successfully'));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.auth!;
    
    const repo = AppDataSource.getRepository(MachineFailureCodeMappingEntity);
    const mapping = await repo.findOne({ where: { id } });
    
    if (!mapping) {
      res.status(404).json(fail('Mapping not found'));
      return;
    }
    
    mapping.status = 'REJECTED';
    mapping.approvedBy = userId;
    mapping.approvedAt = new Date();
    
    await repo.save(mapping);
    
    res.json(ok(mapping, 'Mapping rejected successfully'));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(MachineFailureCodeMappingEntity);
    
    const mapping = await repo.findOne({ where: { id } });
    if (!mapping) {
      res.status(404).json(fail('Mapping not found'));
      return;
    }
    
    await repo.remove(mapping);
    
    res.json(ok(null, 'Mapping deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;
