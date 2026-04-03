import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  AmcContractEntity,
  AmcContractMachineEntity,
  AmcServiceReportEntity,
  AssetEntity,
  AssetPerformanceLogEntity,
  AssetReliabilityKpiEntity,
  DepartmentEntity,
  EsgDailyEntryEntity,
  InstrumentCalibrationTaskEntity,
  MachineInstrumentEntity,
  MachineModuleEntity,
  PmScheduleEntity,
  WorkOrderEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { validateMasterHierarchy } from '../../utils/hierarchy';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { generateQrCodeId } from '../../utils/qr';
import { isSafeImageValue } from '../../utils/fileValidation';

const assetSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().default('MACHINE'),
  assetType: z.enum(['BOILER', 'COMPRESSOR', 'CHILLER', 'HVAC', 'PUMP']).default('PUMP'),
  departmentId: z.string().uuid().nullable().optional(),
  moduleId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  plantId: z.string().uuid().nullable().optional(),
  criticality: z.string().default('MEDIUM'),
  commissionDate: z.string().nullable().optional(),
  warrantyExpiry: z.string().nullable().optional(),
  status: z.string().default('ACTIVE'),
  make: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  ratedCapacity: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  capacityUnit: z.string().max(20).nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  refrigerantGasType: z.string().max(100).nullable().optional(),
  machineImageUrl: z.string().trim().refine((value) => isSafeImageValue(value), 'machineImageUrl must be a valid secure image').nullable().optional(),
  location: z.string().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

assetsRouter.get('/assets', requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(AssetEntity);
    const qb = repo.createQueryBuilder('asset');
    applySearch(qb, 'asset', query.search, ['code', 'name', 'location', 'serial_number']);
    applyPlantScope(qb, 'asset', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('asset.is_active = :active', { active: true });
    }
    if (query.departmentId) {
      qb.andWhere('asset.department_id = :departmentId', { departmentId: query.departmentId });
    }
    if (query.moduleId) {
      qb.andWhere('asset.module_id = :moduleId', { moduleId: query.moduleId });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('asset.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Assets fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

assetsRouter.get('/assets/:id', requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(AssetEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Asset fetched'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.get('/assets/:id/overview', requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOne({
      where: { id: params.id },
      relations: { department: true, module: true, plant: true, vendor: true },
    });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    ensurePlantAccess(req, asset.plantId);

    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
    const pmRepo = AppDataSource.getRepository(PmScheduleEntity);
    const instrumentRepo = AppDataSource.getRepository(MachineInstrumentEntity);
    const calibrationTaskRepo = AppDataSource.getRepository(InstrumentCalibrationTaskEntity);
    const amcMachineRepo = AppDataSource.getRepository(AmcContractMachineEntity);
    const amcContractRepo = AppDataSource.getRepository(AmcContractEntity);
    const amcServiceReportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const reliabilityRepo = AppDataSource.getRepository(AssetReliabilityKpiEntity);
    const performanceRepo = AppDataSource.getRepository(AssetPerformanceLogEntity);
    const esgDailyRepo = AppDataSource.getRepository(EsgDailyEntryEntity);

    const [workOrders, pmSchedules, instruments, calibrationTasks, amcLinks, amcServiceReports, reliability, recentPerformance, esgSample] = await Promise.all([
      workOrderRepo.find({
        where: { assetId: asset.id },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      pmRepo.find({
        where: { assetId: asset.id },
        relations: { template: true, assignedTeam: true },
        order: { nextDue: 'ASC' },
        take: 50,
      }),
      instrumentRepo.find({
        where: { assetId: asset.id },
        order: { createdAt: 'DESC' },
      }),
      calibrationTaskRepo.find({
        where: { assetId: asset.id },
        relations: { instrument: true, template: true, assignedTeam: true },
        order: { dueDate: 'ASC' },
        take: 50,
      }),
      amcMachineRepo.find({
        where: { assetId: asset.id },
        relations: { contract: { vendor: true } },
      }),
      amcServiceReportRepo.find({
        where: { assetId: asset.id },
        relations: { vendor: true, contract: true, workOrder: true },
        order: { serviceDate: 'DESC' },
        take: 25,
      }),
      reliabilityRepo.findOne({
        where: { assetId: asset.id },
        order: { windowEnd: 'DESC' },
      }),
      performanceRepo.find({
        where: { assetId: asset.id, isActive: true },
        order: { capturedAt: 'DESC' },
        take: 20,
      }),
      asset.plantId
        ? esgDailyRepo.find({
            where: { plantId: asset.plantId },
            order: { entryDate: 'DESC' },
            take: 10,
          })
        : [],
    ]);

    const amcContractIds = amcLinks.map((link) => link.contractId);
    const amcContracts = amcContractIds.length
      ? await amcContractRepo.find({
          where: amcContractIds.map((id) => ({ id })),
          relations: { vendor: true },
          order: { endDate: 'ASC' },
        })
      : [];

    const spareUsage = workOrders
      .flatMap((workOrder) =>
        Array.isArray(workOrder.spareConsumption)
          ? workOrder.spareConsumption.map((item) => ({
              workOrderId: workOrder.id,
              woNumber: workOrder.woNumber,
              status: workOrder.status,
              usedAt: workOrder.closedAt ?? workOrder.updatedAt,
              item,
            }))
          : [],
      )
      .slice(0, 50);

    res.json(
      ok(
        {
          asset,
          hierarchy: {
            plant: asset.plant,
            department: asset.department,
            module: asset.module,
          },
          workOrders,
          pmSchedules,
          instruments,
          calibrationTasks,
          amcContracts,
          amcServiceReports,
          spareUsage,
          analytics: {
            reliability: reliability
              ? {
                  failures: reliability.failures,
                  downtimeMinutes: reliability.downtimeMinutes,
                  uptimeMinutes: reliability.uptimeMinutes,
                  mttrMinutes: reliability.mttrMinutes,
                  mtbfMinutes: reliability.mtbfMinutes,
                  mttfMinutes: reliability.mttfMinutes,
                  windowStart: reliability.windowStart,
                  windowEnd: reliability.windowEnd,
                }
              : null,
            performance: recentPerformance,
            esgSample,
          },
        },
        'Asset overview fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

assetsRouter.post('/assets', requirePermission('ASSETS', 'CREATE'), async (req, res, next) => {
  try {
    const body = assetSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    if (!resolvedPlantId || !body.departmentId || !body.moduleId) {
      res.status(400).json(fail('plantId, departmentId and moduleId are required'));
      return;
    }
    ensurePlantAccess(req, resolvedPlantId);

    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
    const department = await departmentRepo.findOneBy({ id: body.departmentId });
    if (!department) {
      res.status(404).json(fail('Department not found'));
      return;
    }
    if (department.plantId !== resolvedPlantId) {
      res.status(400).json(fail('Department does not belong to selected plant'));
      return;
    }
    const module = await moduleRepo.findOneBy({ id: body.moduleId });
    if (!module) {
      res.status(404).json(fail('Module not found'));
      return;
    }
    if (module.departmentId !== body.departmentId || module.plantId !== resolvedPlantId) {
      res.status(400).json(fail('Module does not belong to selected plant/department'));
      return;
    }
    try {
      await validateMasterHierarchy({
        plantId: resolvedPlantId,
        departmentId: body.departmentId,
        moduleId: body.moduleId,
      });
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid machine hierarchy'));
      return;
    }

    const repo = AppDataSource.getRepository(AssetEntity);
    const created = repo.create({
      ...body,
      plantId: resolvedPlantId,
      qrCodeId: generateQrCodeId(),
      ratedCapacity: body.ratedCapacity == null ? null : String(body.ratedCapacity),
    });
    await repo.save(created);
    await audit('assets.create', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'assets',
      entityId: created.id,
      plantId: created.plantId,
      statusCode: 201,
    });
    res.status(201).json(ok(created, 'Asset created'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.patch('/assets/:id', requirePermission('ASSETS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = assetSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(AssetEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    const nextDepartmentId = body.departmentId === undefined ? entity.departmentId : body.departmentId;
    const nextModuleId = body.moduleId === undefined ? entity.moduleId : body.moduleId;

    if (!nextPlantId || !nextDepartmentId || !nextModuleId) {
      res.status(400).json(fail('plantId, departmentId and moduleId are required'));
      return;
    }

    ensurePlantAccess(req, nextPlantId);

    const department = await departmentRepo.findOneBy({ id: nextDepartmentId });
    if (!department) {
      res.status(404).json(fail('Department not found'));
      return;
    }
    if (department.plantId !== nextPlantId) {
      res.status(400).json(fail('Department does not belong to selected plant'));
      return;
    }
    const module = await moduleRepo.findOneBy({ id: nextModuleId });
    if (!module) {
      res.status(404).json(fail('Module not found'));
      return;
    }
    if (module.departmentId !== nextDepartmentId || module.plantId !== nextPlantId) {
      res.status(400).json(fail('Module does not belong to selected plant/department'));
      return;
    }
    try {
      await validateMasterHierarchy({
        plantId: nextPlantId,
        departmentId: nextDepartmentId,
        moduleId: nextModuleId,
      });
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid machine hierarchy'));
      return;
    }

    Object.assign(entity, { ...body, plantId: nextPlantId, departmentId: nextDepartmentId, moduleId: nextModuleId });
    await repo.save(entity);
    await audit('assets.update', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'assets',
      entityId: entity.id,
      plantId: entity.plantId,
      statusCode: 200,
    });
    res.json(ok(entity, 'Asset updated'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.delete('/assets/:id', requirePermission('ASSETS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(AssetEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    await audit('assets.delete', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'assets',
      entityId: entity.id,
      plantId: entity.plantId,
      statusCode: 200,
    });
    res.json(ok({ id: entity.id, deleted: true }, 'Asset deactivated'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.get('/assets/:id/work-orders', requirePermission('WORK_ORDERS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(WorkOrderEntity);
    const qb = repo.createQueryBuilder('wo').where('wo.asset_id = :assetId', { assetId: params.id });
    applyPlantScope(qb, 'wo', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('wo.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Asset work orders fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});
