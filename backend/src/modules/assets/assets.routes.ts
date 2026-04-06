import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  AmcContractEntity,
  AmcContractMachineEntity,
  AmcServiceReportEntity,
  AssetEntity,
  AssetEnergyMeterConfigEntity,
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
  assetType: z.enum(['BOILER', 'COMPRESSOR', 'CHILLER', 'HVAC', 'PUMP', 'MOTOR', 'GENERATOR', 'FAN', 'CONVEYOR', 'ROBOT', 'CNC', 'TRANSFORMER', 'GEARBOX', 'COOLING_TOWER']).default('PUMP'),
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

const energyMeterDataPointSchema = z.object({
  label: z.string().trim().max(120).optional(),
  register: z.string().trim().min(1).max(120),
  unit: z.string().trim().max(40).nullable().optional(),
  multiplier: z.coerce.number().finite().nullable().optional(),
});

const energyMeterConfigSchema = z.object({
  checklistName: z.string().trim().min(1).max(120).default('Energy Meter Checklist'),
  meterName: z.string().trim().min(1).max(120),
  connectionType: z.enum(['MODBUS_TCP', 'MODBUS_RTU_RS485']).default('MODBUS_TCP'),
  ipAddress: z.string().trim().max(120).nullable().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(502),
  modbusSlaveId: z.coerce.number().int().min(1).max(247).nullable().optional(),
  modbusRegister: z.string().trim().max(120).nullable().optional(),
  baudRate: z.coerce.number().int().min(300).max(115200).nullable().optional(),
  parity: z.enum(['NONE', 'EVEN', 'ODD']).nullable().optional(),
  stopBits: z.coerce.number().int().min(1).max(2).nullable().optional(),
  pollIntervalSeconds: z.coerce.number().int().min(5).max(86400).default(60),
  driverType: z.enum(['DOTNET_RS485_BRIDGE', 'NATIVE_MODBUS_TCP']).default('DOTNET_RS485_BRIDGE'),
  bridgeEndpoint: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dataPoints: z.array(energyMeterDataPointSchema).max(100).optional(),
  isActive: z.boolean().default(true),
});

const energyMeterConfigParamsSchema = z.object({
  id: z.string().uuid(),
  configId: z.string().uuid(),
});

function normalizeNullableString(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEnergyDataPoints(dataPoints: Array<z.infer<typeof energyMeterDataPointSchema>> | undefined) {
  return (dataPoints ?? [])
    .map((point, index) => ({
      label: normalizeNullableString(point.label) ?? `Point ${index + 1}`,
      register: point.register.trim(),
      unit: normalizeNullableString(point.unit),
      multiplier: point.multiplier ?? null,
    }))
    .filter((point) => point.register.length > 0);
}

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

assetsRouter.get('/assets/:id/energy-meter-configs', requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const configRepo = AppDataSource.getRepository(AssetEnergyMeterConfigEntity);

    const asset = await assetRepo.findOneBy({ id: params.id });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }

    ensurePlantAccess(req, asset.plantId);

    const rows = await configRepo.find({
      where: { assetId: asset.id, isActive: true },
      order: { updatedAt: 'DESC' },
    });

    res.json(ok(rows, 'Asset energy meter configs fetched'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.post('/assets/:id/energy-meter-configs', requirePermission('ASSETS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = energyMeterConfigSchema.parse(req.body);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const configRepo = AppDataSource.getRepository(AssetEnergyMeterConfigEntity);

    const asset = await assetRepo.findOneBy({ id: params.id });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }

    if (!asset.plantId) {
      res.status(400).json(fail('Asset plant mapping is required for energy meter configuration'));
      return;
    }

    ensurePlantAccess(req, asset.plantId);

    const ipAddress = normalizeNullableString(body.ipAddress);
    const modbusRegister = normalizeNullableString(body.modbusRegister);
    const bridgeEndpoint = normalizeNullableString(body.bridgeEndpoint);
    const notes = normalizeNullableString(body.notes);
    const dataPoints = normalizeEnergyDataPoints(body.dataPoints);

    if (body.connectionType === 'MODBUS_TCP' && !ipAddress) {
      res.status(400).json(fail('ipAddress is required for MODBUS_TCP connection'));
      return;
    }

    if (body.connectionType === 'MODBUS_RTU_RS485' && !body.modbusSlaveId) {
      res.status(400).json(fail('modbusSlaveId is required for MODBUS_RTU_RS485 connection'));
      return;
    }

    if (dataPoints.length === 0) {
      res.status(400).json(fail('At least one data point register is required'));
      return;
    }

    const created = configRepo.create({
      assetId: asset.id,
      plantId: asset.plantId,
      checklistName: body.checklistName,
      meterName: body.meterName,
      connectionType: body.connectionType,
      ipAddress,
      port: body.port,
      modbusSlaveId: body.modbusSlaveId ?? null,
      modbusRegister,
      baudRate: body.baudRate ?? null,
      parity: body.parity ?? null,
      stopBits: body.stopBits ?? null,
      pollIntervalSeconds: body.pollIntervalSeconds,
      driverType: body.driverType,
      bridgeEndpoint,
      notes,
      dataPoints,
      isActive: body.isActive,
    });

    await configRepo.save(created);

    await audit('assets.energy_meter_config.create', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_energy_meter_configs',
      entityId: created.id,
      plantId: asset.plantId,
      statusCode: 201,
    });

    res.status(201).json(ok(created, 'Energy meter checklist saved'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.patch('/assets/:id/energy-meter-configs/:configId', requirePermission('ASSETS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = energyMeterConfigParamsSchema.parse(req.params);
    const body = energyMeterConfigSchema.partial().parse(req.body);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const configRepo = AppDataSource.getRepository(AssetEnergyMeterConfigEntity);

    const asset = await assetRepo.findOneBy({ id: params.id });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    if (!asset.plantId) {
      res.status(400).json(fail('Asset plant mapping is required for energy meter configuration'));
      return;
    }
    ensurePlantAccess(req, asset.plantId);

    const config = await configRepo.findOneBy({ id: params.configId, assetId: asset.id });
    if (!config) {
      res.status(404).json(fail('Energy meter config not found'));
      return;
    }

    const nextConnectionType = body.connectionType ?? config.connectionType;
    const nextIpAddress = body.ipAddress === undefined ? config.ipAddress : normalizeNullableString(body.ipAddress);
    const nextSlaveId = body.modbusSlaveId === undefined ? config.modbusSlaveId : body.modbusSlaveId;
    const nextDataPoints = body.dataPoints === undefined ? (config.dataPoints ?? []) : normalizeEnergyDataPoints(body.dataPoints);

    if (nextConnectionType === 'MODBUS_TCP' && !nextIpAddress) {
      res.status(400).json(fail('ipAddress is required for MODBUS_TCP connection'));
      return;
    }
    if (nextConnectionType === 'MODBUS_RTU_RS485' && !nextSlaveId) {
      res.status(400).json(fail('modbusSlaveId is required for MODBUS_RTU_RS485 connection'));
      return;
    }
    if (nextDataPoints.length === 0) {
      res.status(400).json(fail('At least one data point register is required'));
      return;
    }

    if (body.checklistName !== undefined) config.checklistName = body.checklistName;
    if (body.meterName !== undefined) config.meterName = body.meterName;
    if (body.connectionType !== undefined) config.connectionType = body.connectionType;
    if (body.ipAddress !== undefined) config.ipAddress = normalizeNullableString(body.ipAddress);
    if (body.port !== undefined) config.port = body.port;
    if (body.modbusSlaveId !== undefined) config.modbusSlaveId = body.modbusSlaveId;
    if (body.modbusRegister !== undefined) config.modbusRegister = normalizeNullableString(body.modbusRegister);
    if (body.baudRate !== undefined) config.baudRate = body.baudRate;
    if (body.parity !== undefined) config.parity = body.parity;
    if (body.stopBits !== undefined) config.stopBits = body.stopBits;
    if (body.pollIntervalSeconds !== undefined) config.pollIntervalSeconds = body.pollIntervalSeconds;
    if (body.driverType !== undefined) config.driverType = body.driverType;
    if (body.bridgeEndpoint !== undefined) config.bridgeEndpoint = normalizeNullableString(body.bridgeEndpoint);
    if (body.notes !== undefined) config.notes = normalizeNullableString(body.notes);
    if (body.dataPoints !== undefined) config.dataPoints = nextDataPoints;
    if (body.isActive !== undefined) config.isActive = body.isActive;

    await configRepo.save(config);

    await audit('assets.energy_meter_config.update', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_energy_meter_configs',
      entityId: config.id,
      plantId: asset.plantId,
      statusCode: 200,
    });

    res.json(ok(config, 'Energy meter checklist updated'));
  } catch (error) {
    next(error);
  }
});

assetsRouter.delete('/assets/:id/energy-meter-configs/:configId', requirePermission('ASSETS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = energyMeterConfigParamsSchema.parse(req.params);
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const configRepo = AppDataSource.getRepository(AssetEnergyMeterConfigEntity);

    const asset = await assetRepo.findOneBy({ id: params.id });
    if (!asset) {
      res.status(404).json(fail('Asset not found'));
      return;
    }
    if (!asset.plantId) {
      res.status(400).json(fail('Asset plant mapping is required for energy meter configuration'));
      return;
    }
    ensurePlantAccess(req, asset.plantId);

    const config = await configRepo.findOneBy({ id: params.configId, assetId: asset.id });
    if (!config) {
      res.status(404).json(fail('Energy meter config not found'));
      return;
    }

    config.isActive = false;
    await configRepo.save(config);

    await audit('assets.energy_meter_config.delete', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_energy_meter_configs',
      entityId: config.id,
      plantId: asset.plantId,
      statusCode: 200,
    });

    res.json(ok({ id: config.id, deleted: true }, 'Energy meter checklist deleted'));
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
    const energyMeterConfigRepo = AppDataSource.getRepository(AssetEnergyMeterConfigEntity);

    const [workOrders, pmSchedules, instruments, calibrationTasks, amcLinks, amcServiceReports, reliability, recentPerformance, esgSample, energyMeterConfigs] = await Promise.all([
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
      energyMeterConfigRepo.find({
        where: { assetId: asset.id, isActive: true },
        order: { updatedAt: 'DESC' },
        take: 20,
      }),
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
            energyMeterConfigs,
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
