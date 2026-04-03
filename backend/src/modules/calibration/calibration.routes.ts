import { Router } from 'express';
import { z } from 'zod';
import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  CalibrationTemplateEntity,
  InstrumentCalibrationScheduleEntity,
  InstrumentCalibrationTaskEntity,
  MachineInstrumentEntity,
  MaintenanceTeamEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { validateRequest } from '../../middlewares/validate';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { buildPagination, listQuerySchema, parseListQuery } from '../../utils/pagination';
import { resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import { createCrudRouter } from '../_core/crud.routes';
import { calibrationService } from './calibration.service';
import { createCalibrationSchema, updateCalibrationSchema } from './calibration.validators';
import {
  computeCalibrationNextDueDate,
  normalizeCalibrationChecklistResults,
  parseCalibrationChecklistTasks,
  validateInstrumentScope,
} from './calibration.utils';
import { isSafeDocumentUpload } from '../../utils/fileValidation';

const idParamSchema = z.object({ id: z.string().uuid() });

const optionalUuidFilter = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== 'string') return undefined;
  const trimmed = scalar.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return undefined;
  }
  return trimmed;
}, z.string().uuid().optional());

const optionalTextFilter = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== 'string') return undefined;
  const trimmed = scalar.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return undefined;
  }
  return trimmed;
}, z.string().optional());

const instrumentSchema = z.object({
  assetId: z.string().uuid(),
  plantId: z.string().uuid().nullable().optional(),
  instrumentName: z.string().min(1),
  instrumentType: z.string().min(1),
  serialNumber: z.string().trim().nullable().optional(),
  rangeMin: z.union([z.string(), z.number()]).nullable().optional(),
  rangeMax: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().trim().nullable().optional(),
  installationDate: z.string().date().nullable().optional(),
  status: z.string().default('ACTIVE'),
});

const templateSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  templateName: z.string().min(1),
  instrumentType: z.string().min(1),
  calibrationMethod: z.string().min(1),
  tolerance: z.string().trim().nullable().optional(),
  frequencyType: z.enum(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']).default('MONTH'),
  frequencyValue: z.number().int().positive().default(1),
  estimatedDuration: z.number().int().positive().default(60),
  responsibleTeamId: z.string().uuid().nullable().optional(),
  checklistTasks: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});

const scheduleSchema = z.object({
  instrumentId: z.string().uuid(),
  templateId: z.string().uuid(),
  plantId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime(),
  assignedTeamId: z.string().uuid().nullable().optional(),
  calibrationType: z.string().default('INTERNAL'),
  isActive: z.boolean().default(true),
});

const taskUpdateSchema = z.object({
  status: z.string().optional(),
  checklist: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        taskStatus: z.string().optional(),
        referenceValue: z.string().optional(),
        measuredValue: z.string().optional(),
        deviation: z.string().optional(),
        passFail: z.string().optional(),
        remarks: z.string().optional(),
      }),
    )
    .optional(),
  remarks: z.string().nullable().optional(),
  certificateUpload: z.object({ name: z.string(), dataUrl: z.string() }).nullable().optional().refine((value) => isSafeDocumentUpload(value), {
    message: 'certificateUpload must be a supported document or image under the configured size limit',
  }),
});

const instrumentListSchema = listQuerySchema.extend({
  assetId: optionalUuidFilter,
  departmentId: optionalUuidFilter,
  moduleId: optionalUuidFilter,
  status: optionalTextFilter,
  instrumentType: optionalTextFilter,
});

const scheduleListSchema = listQuerySchema.extend({
  instrumentId: optionalUuidFilter,
  templateId: optionalUuidFilter,
  assetId: optionalUuidFilter,
});

const taskListSchema = listQuerySchema.extend({
  instrumentId: optionalUuidFilter,
  assetId: optionalUuidFilter,
  status: optionalTextFilter,
});

function toNullableText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function toNullableDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(3);
}

function parseCertificateUpload(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as Record<string, unknown>;
    return { name: String(source.name ?? ''), dataUrl: String(source.dataUrl ?? '') };
  } catch {
    return null;
  }
}

function mapInstrument(entity: MachineInstrumentEntity) {
  return {
    id: entity.id,
    assetId: entity.assetId,
    instrumentName: entity.instrumentName,
    instrumentType: entity.instrumentType,
    serialNumber: entity.serialNumber,
    rangeMin: entity.rangeMin,
    rangeMax: entity.rangeMax,
    unit: entity.unit,
    installationDate: entity.installationDate,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    asset: entity.asset
      ? {
          id: entity.asset.id,
          code: entity.asset.code,
          name: entity.asset.name,
          plantId: entity.asset.plantId,
          departmentId: entity.asset.departmentId,
          moduleId: entity.asset.moduleId,
        }
      : null,
  };
}

function mapTemplate(entity: CalibrationTemplateEntity) {
  return {
    id: entity.id,
    plantId: entity.plantId,
    templateName: entity.templateName,
    instrumentType: entity.instrumentType,
    calibrationMethod: entity.calibrationMethod,
    tolerance: entity.tolerance,
    frequencyType: entity.frequencyType,
    frequencyValue: entity.frequencyValue,
    estimatedDuration: entity.estimatedDuration,
    responsibleTeamId: entity.responsibleTeamId,
    checklistTasks: parseCalibrationChecklistTasks(entity.checklistTasks).map((item) => item.title),
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    responsibleTeam: entity.responsibleTeam
      ? {
          id: entity.responsibleTeam.id,
          teamName: entity.responsibleTeam.teamName,
          discipline: entity.responsibleTeam.discipline,
        }
      : null,
  };
}

function mapSchedule(entity: InstrumentCalibrationScheduleEntity) {
  return {
    id: entity.id,
    scheduleCode: `CAL-SCH-${entity.id.slice(0, 8).toUpperCase()}`,
    instrumentId: entity.instrumentId,
    templateId: entity.templateId,
    plantId: entity.plantId,
    startDate: entity.startDate,
    nextDueDate: entity.nextDueDate,
    assignedTeamId: entity.assignedTeamId,
    calibrationType: entity.calibrationType,
    lastGeneratedAt: entity.lastGeneratedAt,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    instrument: entity.instrument
      ? {
          id: entity.instrument.id,
          instrumentName: entity.instrument.instrumentName,
          instrumentType: entity.instrument.instrumentType,
          serialNumber: entity.instrument.serialNumber,
          status: entity.instrument.status,
          asset: entity.instrument.asset
            ? {
                id: entity.instrument.asset.id,
                code: entity.instrument.asset.code,
                name: entity.instrument.asset.name,
                plantId: entity.instrument.asset.plantId,
                departmentId: entity.instrument.asset.departmentId,
                moduleId: entity.instrument.asset.moduleId,
              }
            : null,
        }
      : null,
    template: entity.template
      ? {
          id: entity.template.id,
          templateName: entity.template.templateName,
          instrumentType: entity.template.instrumentType,
          calibrationMethod: entity.template.calibrationMethod,
          tolerance: entity.template.tolerance,
          frequencyType: entity.template.frequencyType,
          frequencyValue: entity.template.frequencyValue,
          estimatedDuration: entity.template.estimatedDuration,
        }
      : null,
    assignedTeam: entity.assignedTeam
      ? {
          id: entity.assignedTeam.id,
          teamName: entity.assignedTeam.teamName,
          discipline: entity.assignedTeam.discipline,
        }
      : null,
  };
}

function mapTask(entity: InstrumentCalibrationTaskEntity) {
  return {
    id: entity.id,
    calibrationId: `CAL-${entity.id.slice(0, 8).toUpperCase()}`,
    scheduleId: entity.scheduleId,
    instrumentId: entity.instrumentId,
    templateId: entity.templateId,
    assetId: entity.assetId,
    plantId: entity.plantId,
    assignedTeamId: entity.assignedTeamId,
    calibrationType: entity.calibrationType,
    dueDate: entity.dueDate,
    startedAt: entity.startedAt,
    completedAt: entity.completedAt,
    status: entity.status,
    checklist: normalizeCalibrationChecklistResults(entity.checklist),
    certificateUpload: parseCertificateUpload(entity.certificateUpload),
    remarks: entity.remarks,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    instrument: entity.instrument
      ? {
          id: entity.instrument.id,
          instrumentName: entity.instrument.instrumentName,
          instrumentType: entity.instrument.instrumentType,
          serialNumber: entity.instrument.serialNumber,
          status: entity.instrument.status,
        }
      : null,
    asset: entity.asset
      ? {
          id: entity.asset.id,
          code: entity.asset.code,
          name: entity.asset.name,
          plantId: entity.asset.plantId,
          departmentId: entity.asset.departmentId,
          moduleId: entity.asset.moduleId,
        }
      : null,
    template: entity.template
      ? {
          id: entity.template.id,
          templateName: entity.template.templateName,
          instrumentType: entity.template.instrumentType,
          calibrationMethod: entity.template.calibrationMethod,
          tolerance: entity.template.tolerance,
        }
      : null,
    assignedTeam: entity.assignedTeam
      ? {
          id: entity.assignedTeam.id,
          teamName: entity.assignedTeam.teamName,
          discipline: entity.assignedTeam.discipline,
        }
      : null,
  };
}

export const calibrationRouter = Router();
calibrationRouter.use(requireAuth);

calibrationRouter.get(
  '/calibration/instruments',
  requirePermission('CALIBRATION', 'READ'),
  validateRequest({ query: instrumentListSchema }),
  async (req, res, next) => {
    try {
      const extended = instrumentListSchema.parse(req.query as Record<string, unknown>);
      const query = parseListQuery(req.query as Record<string, unknown>);
      const plantIds = resolvePlantFilter(req.auth!, query.plantId);

      if (plantIds && plantIds.length === 0) {
        res.json(ok([], 'Machine instruments fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }

      const repo = AppDataSource.getRepository(MachineInstrumentEntity);
      const qb = repo.createQueryBuilder('instrument').leftJoinAndSelect('instrument.asset', 'asset');

      if (query.search) {
        const searchValue = `%${query.search}%`;
        qb.andWhere(
          new Brackets((where) => {
            where
              .where('instrument.instrument_name ILIKE :searchValue', { searchValue })
              .orWhere('instrument.instrument_type ILIKE :searchValue', { searchValue })
              .orWhere('instrument.serial_number ILIKE :searchValue', { searchValue })
              .orWhere('asset.code ILIKE :searchValue', { searchValue })
              .orWhere('asset.name ILIKE :searchValue', { searchValue });
          }),
        );
      }

      if (plantIds) qb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds });
      if (!query.includeInactive) qb.andWhere('instrument.status != :inactiveStatus', { inactiveStatus: 'INACTIVE' });
      if (extended.assetId) qb.andWhere('instrument.asset_id = :assetId', { assetId: extended.assetId });
      if (extended.departmentId) qb.andWhere('asset.department_id = :departmentId', { departmentId: extended.departmentId });
      if (extended.moduleId) qb.andWhere('asset.module_id = :moduleId', { moduleId: extended.moduleId });
      if (extended.status) qb.andWhere('instrument.status = :status', { status: extended.status });
      if (extended.instrumentType) qb.andWhere('instrument.instrument_type ILIKE :instrumentType', { instrumentType: `%${extended.instrumentType}%` });

      qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('instrument.createdAt', 'DESC');
      const [rows, total] = await qb.getManyAndCount();
      res.json(ok(rows.map(mapInstrument), 'Machine instruments fetched', buildPagination(query.page, query.limit, total)));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.post(
  '/calibration/instruments',
  requirePermission('CALIBRATION', 'CREATE'),
  validateRequest({ body: instrumentSchema }),
  async (req, res, next) => {
    try {
      const body = instrumentSchema.parse(req.body);
      const asset = await validateInstrumentScope({ assetId: body.assetId, plantId: body.plantId ?? null });
      ensurePlantAccess(req, asset.plantId);

      const repo = AppDataSource.getRepository(MachineInstrumentEntity);
      const created = repo.create({
        assetId: body.assetId,
        instrumentName: body.instrumentName.trim(),
        instrumentType: body.instrumentType.trim(),
        serialNumber: toNullableText(body.serialNumber),
        rangeMin: toNullableDecimal(body.rangeMin),
        rangeMax: toNullableDecimal(body.rangeMax),
        unit: toNullableText(body.unit),
        installationDate: body.installationDate ?? null,
        status: body.status,
      });
      await repo.save(created);
      const full = await repo.findOne({ where: { id: created.id }, relations: { asset: true } });
      res.status(201).json(ok(full ? mapInstrument(full) : created, 'Machine instrument created'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.patch(
  '/calibration/instruments/:id',
  requirePermission('CALIBRATION', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: instrumentSchema.partial() }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const body = instrumentSchema.partial().parse(req.body);
      const repo = AppDataSource.getRepository(MachineInstrumentEntity);
      const entity = await repo.findOne({ where: { id: params.id }, relations: { asset: true } });
      if (!entity) {
        res.status(404).json(fail('Machine instrument not found'));
        return;
      }

      const nextAssetId = body.assetId ?? entity.assetId;
      const asset = await validateInstrumentScope({
        assetId: nextAssetId,
        plantId: body.plantId ?? entity.asset?.plantId ?? null,
      });
      ensurePlantAccess(req, asset.plantId);

      Object.assign(entity, {
        assetId: nextAssetId,
        instrumentName: body.instrumentName?.trim() ?? entity.instrumentName,
        instrumentType: body.instrumentType?.trim() ?? entity.instrumentType,
        serialNumber: body.serialNumber === undefined ? entity.serialNumber : toNullableText(body.serialNumber),
        rangeMin: body.rangeMin === undefined ? entity.rangeMin : toNullableDecimal(body.rangeMin),
        rangeMax: body.rangeMax === undefined ? entity.rangeMax : toNullableDecimal(body.rangeMax),
        unit: body.unit === undefined ? entity.unit : toNullableText(body.unit),
        installationDate: body.installationDate === undefined ? entity.installationDate : body.installationDate ?? null,
        status: body.status ?? entity.status,
      });

      await repo.save(entity);
      const full = await repo.findOne({ where: { id: entity.id }, relations: { asset: true } });
      res.json(ok(full ? mapInstrument(full) : entity, 'Machine instrument updated'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.delete(
  '/calibration/instruments/:id',
  requirePermission('CALIBRATION', 'DELETE'),
  validateRequest({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const repo = AppDataSource.getRepository(MachineInstrumentEntity);
      const entity = await repo.findOne({ where: { id: params.id }, relations: { asset: true } });
      if (!entity) {
        res.status(404).json(fail('Machine instrument not found'));
        return;
      }
      ensurePlantAccess(req, entity.asset?.plantId ?? null);
      await repo.delete(entity.id);
      res.json(ok({ id: entity.id, deleted: true }, 'Machine instrument deleted'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.get(
  '/calibration/templates',
  requirePermission('CALIBRATION', 'READ'),
  validateRequest({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const query = parseListQuery(req.query as Record<string, unknown>);
      const plantIds = resolvePlantFilter(req.auth!, query.plantId);
      if (plantIds && plantIds.length === 0) {
        res.json(ok([], 'Calibration templates fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }

      const repo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const qb = repo.createQueryBuilder('template').leftJoinAndSelect('template.responsibleTeam', 'responsibleTeam');

      if (query.search) {
        const searchValue = `%${query.search}%`;
        qb.andWhere(
          new Brackets((where) => {
            where
              .where('template.template_name ILIKE :searchValue', { searchValue })
              .orWhere('template.instrument_type ILIKE :searchValue', { searchValue })
              .orWhere('template.calibration_method ILIKE :searchValue', { searchValue })
              .orWhere('template.tolerance ILIKE :searchValue', { searchValue })
              .orWhere('responsibleTeam.team_name ILIKE :searchValue', { searchValue });
          }),
        );
      }

      if (plantIds) qb.andWhere('template.plant_id IN (:...plantIds)', { plantIds });
      if (!query.includeInactive) qb.andWhere('template.is_active = :isActive', { isActive: true });

      qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('template.createdAt', 'DESC');
      const [rows, total] = await qb.getManyAndCount();
      res.json(ok(rows.map(mapTemplate), 'Calibration templates fetched', buildPagination(query.page, query.limit, total)));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.post(
  '/calibration/templates',
  requirePermission('CALIBRATION', 'CREATE'),
  validateRequest({ body: templateSchema }),
  async (req, res, next) => {
    try {
      const body = templateSchema.parse(req.body);
      const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
      ensurePlantAccess(req, plantId);

      if (body.responsibleTeamId) {
        const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
        const team = await teamRepo.findOneBy({ id: body.responsibleTeamId, isActive: true });
        if (!team || (plantId && team.plantId !== plantId)) {
          res.status(400).json(fail('Responsible team is outside the selected plant'));
          return;
        }
      }

      const repo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const created = repo.create({
        plantId,
        templateName: body.templateName.trim(),
        instrumentType: body.instrumentType.trim(),
        calibrationMethod: body.calibrationMethod.trim(),
        tolerance: toNullableText(body.tolerance),
        frequencyType: body.frequencyType,
        frequencyValue: body.frequencyValue,
        estimatedDuration: body.estimatedDuration,
        responsibleTeamId: body.responsibleTeamId ?? null,
        checklistTasks: JSON.stringify(body.checklistTasks),
        isActive: body.isActive,
      });
      await repo.save(created);
      const full = await repo.findOne({ where: { id: created.id }, relations: { responsibleTeam: true } });
      res.status(201).json(ok(full ? mapTemplate(full) : created, 'Calibration template created'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.patch(
  '/calibration/templates/:id',
  requirePermission('CALIBRATION', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: templateSchema.partial() }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const body = templateSchema.partial().parse(req.body);
      const repo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const entity = await repo.findOne({ where: { id: params.id }, relations: { responsibleTeam: true } });
      if (!entity) {
        res.status(404).json(fail('Calibration template not found'));
        return;
      }

      const plantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId ?? null);
      ensurePlantAccess(req, plantId);
      const responsibleTeamId = body.responsibleTeamId === undefined ? entity.responsibleTeamId : body.responsibleTeamId ?? null;

      if (responsibleTeamId) {
        const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
        const team = await teamRepo.findOneBy({ id: responsibleTeamId, isActive: true });
        if (!team || (plantId && team.plantId !== plantId)) {
          res.status(400).json(fail('Responsible team is outside the selected plant'));
          return;
        }
      }

      Object.assign(entity, {
        plantId,
        templateName: body.templateName?.trim() ?? entity.templateName,
        instrumentType: body.instrumentType?.trim() ?? entity.instrumentType,
        calibrationMethod: body.calibrationMethod?.trim() ?? entity.calibrationMethod,
        tolerance: body.tolerance === undefined ? entity.tolerance : toNullableText(body.tolerance),
        frequencyType: body.frequencyType ?? entity.frequencyType,
        frequencyValue: body.frequencyValue ?? entity.frequencyValue,
        estimatedDuration: body.estimatedDuration ?? entity.estimatedDuration,
        responsibleTeamId,
        checklistTasks: body.checklistTasks === undefined ? entity.checklistTasks : JSON.stringify(body.checklistTasks),
        isActive: body.isActive ?? entity.isActive,
      });
      await repo.save(entity);
      const full = await repo.findOne({ where: { id: entity.id }, relations: { responsibleTeam: true } });
      res.json(ok(full ? mapTemplate(full) : entity, 'Calibration template updated'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.delete(
  '/calibration/templates/:id',
  requirePermission('CALIBRATION', 'DELETE'),
  validateRequest({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const repo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const entity = await repo.findOneBy({ id: params.id });
      if (!entity) {
        res.status(404).json(fail('Calibration template not found'));
        return;
      }
      ensurePlantAccess(req, entity.plantId);
      entity.isActive = false;
      await repo.save(entity);
      res.json(ok({ id: entity.id, deleted: true }, 'Calibration template deactivated'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.get(
  '/calibration/schedules',
  requirePermission('CALIBRATION', 'READ'),
  validateRequest({ query: scheduleListSchema }),
  async (req, res, next) => {
    try {
      const extended = scheduleListSchema.parse(req.query as Record<string, unknown>);
      const query = parseListQuery(req.query as Record<string, unknown>);
      const plantIds = resolvePlantFilter(req.auth!, query.plantId);
      if (plantIds && plantIds.length === 0) {
        res.json(ok([], 'Calibration schedules fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }

      const repo = AppDataSource.getRepository(InstrumentCalibrationScheduleEntity);
      const qb = repo
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.template', 'template')
        .leftJoinAndSelect('schedule.instrument', 'instrument')
        .leftJoinAndSelect('instrument.asset', 'asset')
        .leftJoinAndSelect('schedule.assignedTeam', 'assignedTeam');

      if (query.search) {
        const searchValue = `%${query.search}%`;
        qb.andWhere(
          new Brackets((where) => {
            where
              .where('template.template_name ILIKE :searchValue', { searchValue })
              .orWhere('instrument.instrument_name ILIKE :searchValue', { searchValue })
              .orWhere('instrument.serial_number ILIKE :searchValue', { searchValue })
              .orWhere('asset.code ILIKE :searchValue', { searchValue })
              .orWhere('asset.name ILIKE :searchValue', { searchValue })
              .orWhere('assignedTeam.team_name ILIKE :searchValue', { searchValue });
          }),
        );
      }

      if (plantIds) qb.andWhere('schedule.plant_id IN (:...plantIds)', { plantIds });
      if (!query.includeInactive) qb.andWhere('schedule.is_active = :isActive', { isActive: true });
      if (extended.instrumentId) qb.andWhere('schedule.instrument_id = :instrumentId', { instrumentId: extended.instrumentId });
      if (extended.templateId) qb.andWhere('schedule.template_id = :templateId', { templateId: extended.templateId });
      if (extended.assetId) qb.andWhere('instrument.asset_id = :assetId', { assetId: extended.assetId });

      qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('schedule.nextDueDate', 'ASC');
      const [rows, total] = await qb.getManyAndCount();
      res.json(ok(rows.map(mapSchedule), 'Calibration schedules fetched', buildPagination(query.page, query.limit, total)));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.post(
  '/calibration/schedules',
  requirePermission('CALIBRATION', 'CREATE'),
  validateRequest({ body: scheduleSchema }),
  async (req, res, next) => {
    try {
      const body = scheduleSchema.parse(req.body);
      const templateRepo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const instrumentRepo = AppDataSource.getRepository(MachineInstrumentEntity);
      const repo = AppDataSource.getRepository(InstrumentCalibrationScheduleEntity);

      const template = await templateRepo.findOneBy({ id: body.templateId, isActive: true });
      if (!template) {
        res.status(404).json(fail('Calibration template not found'));
        return;
      }

      const instrument = await instrumentRepo.findOne({ where: { id: body.instrumentId }, relations: { asset: true } });
      if (!instrument?.asset) {
        res.status(404).json(fail('Machine instrument not found'));
        return;
      }

      const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? instrument.asset.plantId ?? template.plantId ?? null);
      ensurePlantAccess(req, plantId);

      try {
        await validateInstrumentScope({
          assetId: instrument.assetId,
          plantId,
          instrumentId: instrument.id,
          templateId: template.id,
          assignedTeamId: body.assignedTeamId ?? template.responsibleTeamId ?? null,
        });
      } catch (error) {
        res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid calibration schedule scope'));
        return;
      }

      const startDate = new Date(body.startDate);
      const created = repo.create({
        instrumentId: body.instrumentId,
        templateId: body.templateId,
        plantId,
        startDate,
        nextDueDate: computeCalibrationNextDueDate(startDate, template),
        assignedTeamId: body.assignedTeamId ?? template.responsibleTeamId ?? null,
        calibrationType: body.calibrationType,
        lastGeneratedAt: null,
        isActive: body.isActive,
      });
      await repo.save(created);
      const full = await repo.findOne({
        where: { id: created.id },
        relations: { template: true, instrument: { asset: true }, assignedTeam: true },
      });
      res.status(201).json(ok(full ? mapSchedule(full) : created, 'Calibration schedule created'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.patch(
  '/calibration/schedules/:id',
  requirePermission('CALIBRATION', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: scheduleSchema.partial() }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const body = scheduleSchema.partial().parse(req.body);
      const scheduleRepo = AppDataSource.getRepository(InstrumentCalibrationScheduleEntity);
      const templateRepo = AppDataSource.getRepository(CalibrationTemplateEntity);
      const instrumentRepo = AppDataSource.getRepository(MachineInstrumentEntity);

      const entity = await scheduleRepo.findOne({
        where: { id: params.id },
        relations: { template: true, instrument: { asset: true }, assignedTeam: true },
      });
      if (!entity) {
        res.status(404).json(fail('Calibration schedule not found'));
        return;
      }

      const templateId = body.templateId ?? entity.templateId;
      const instrumentId = body.instrumentId ?? entity.instrumentId;
      const template = await templateRepo.findOneBy({ id: templateId, isActive: true });
      if (!template) {
        res.status(404).json(fail('Calibration template not found'));
        return;
      }
      const instrument = await instrumentRepo.findOne({ where: { id: instrumentId }, relations: { asset: true } });
      if (!instrument?.asset) {
        res.status(404).json(fail('Machine instrument not found'));
        return;
      }

      const plantId = resolveScopedPlantId(
        req.auth!,
        body.plantId === undefined ? entity.plantId : body.plantId ?? instrument.asset.plantId ?? null,
      );
      ensurePlantAccess(req, plantId);
      const assignedTeamId = body.assignedTeamId === undefined ? entity.assignedTeamId : body.assignedTeamId ?? null;

      try {
        await validateInstrumentScope({
          assetId: instrument.assetId,
          plantId,
          instrumentId,
          templateId,
          assignedTeamId,
        });
      } catch (error) {
        res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid calibration schedule scope'));
        return;
      }

      const startDate = body.startDate ? new Date(body.startDate) : entity.startDate;
      Object.assign(entity, {
        instrumentId,
        templateId,
        plantId,
        startDate,
        nextDueDate: computeCalibrationNextDueDate(startDate, template),
        assignedTeamId,
        calibrationType: body.calibrationType ?? entity.calibrationType,
        isActive: body.isActive ?? entity.isActive,
      });
      await scheduleRepo.save(entity);
      const full = await scheduleRepo.findOne({
        where: { id: entity.id },
        relations: { template: true, instrument: { asset: true }, assignedTeam: true },
      });
      res.json(ok(full ? mapSchedule(full) : entity, 'Calibration schedule updated'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.delete(
  '/calibration/schedules/:id',
  requirePermission('CALIBRATION', 'DELETE'),
  validateRequest({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const repo = AppDataSource.getRepository(InstrumentCalibrationScheduleEntity);
      const entity = await repo.findOneBy({ id: params.id });
      if (!entity) {
        res.status(404).json(fail('Calibration schedule not found'));
        return;
      }
      ensurePlantAccess(req, entity.plantId);
      entity.isActive = false;
      await repo.save(entity);
      res.json(ok({ id: entity.id, deleted: true }, 'Calibration schedule deactivated'));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.get(
  '/calibration/tasks',
  requirePermission('CALIBRATION', 'READ'),
  validateRequest({ query: taskListSchema }),
  async (req, res, next) => {
    try {
      const extended = taskListSchema.parse(req.query as Record<string, unknown>);
      const query = parseListQuery(req.query as Record<string, unknown>);
      const plantIds = resolvePlantFilter(req.auth!, query.plantId);
      if (plantIds && plantIds.length === 0) {
        res.json(ok([], 'Calibration tasks fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }

      const repo = AppDataSource.getRepository(InstrumentCalibrationTaskEntity);
      const qb = repo
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.instrument', 'instrument')
        .leftJoinAndSelect('task.asset', 'asset')
        .leftJoinAndSelect('task.template', 'template')
        .leftJoinAndSelect('task.assignedTeam', 'assignedTeam');

      if (query.search) {
        const searchValue = `%${query.search}%`;
        qb.andWhere(
          new Brackets((where) => {
            where
              .where('instrument.instrument_name ILIKE :searchValue', { searchValue })
              .orWhere('instrument.serial_number ILIKE :searchValue', { searchValue })
              .orWhere('asset.code ILIKE :searchValue', { searchValue })
              .orWhere('asset.name ILIKE :searchValue', { searchValue })
              .orWhere('template.template_name ILIKE :searchValue', { searchValue })
              .orWhere('task.status ILIKE :searchValue', { searchValue });
          }),
        );
      }

      if (plantIds) qb.andWhere('task.plant_id IN (:...plantIds)', { plantIds });
      if (extended.status) qb.andWhere('task.status = :status', { status: extended.status });
      if (extended.instrumentId) qb.andWhere('task.instrument_id = :instrumentId', { instrumentId: extended.instrumentId });
      if (extended.assetId) qb.andWhere('task.asset_id = :assetId', { assetId: extended.assetId });

      qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('task.dueDate', 'ASC');
      const [rows, total] = await qb.getManyAndCount();
      res.json(ok(rows.map(mapTask), 'Calibration tasks fetched', buildPagination(query.page, query.limit, total)));
    } catch (error) {
      next(error);
    }
  },
);

calibrationRouter.patch(
  '/calibration/tasks/:id',
  requirePermission('CALIBRATION', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: taskUpdateSchema }),
  async (req, res, next) => {
    try {
      const params = idParamSchema.parse(req.params);
      const body = taskUpdateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(InstrumentCalibrationTaskEntity);
      const entity = await repo.findOne({
        where: { id: params.id },
        relations: { instrument: true, asset: true, template: true, assignedTeam: true },
      });
      if (!entity) {
        res.status(404).json(fail('Calibration task not found'));
        return;
      }
      ensurePlantAccess(req, entity.plantId ?? entity.asset?.plantId ?? null);

      const nextStatus = (body.status ?? entity.status).toUpperCase();
      entity.status = nextStatus;
      entity.checklist = body.checklist
        ? normalizeCalibrationChecklistResults(body.checklist)
        : normalizeCalibrationChecklistResults(entity.checklist);
      entity.remarks = body.remarks === undefined ? entity.remarks : body.remarks ?? null;
      entity.certificateUpload =
        body.certificateUpload === undefined
          ? entity.certificateUpload
          : body.certificateUpload
            ? JSON.stringify(body.certificateUpload)
            : null;

      if (nextStatus === 'IN_PROGRESS' && !entity.startedAt) {
        entity.startedAt = new Date();
      }
      if (nextStatus === 'COMPLETED') {
        if (!entity.startedAt) entity.startedAt = new Date();
        entity.completedAt = new Date();
      } else if (body.status && nextStatus !== 'COMPLETED') {
        entity.completedAt = null;
      }

      await repo.save(entity);
      const full = await repo.findOne({
        where: { id: entity.id },
        relations: { instrument: true, asset: true, template: true, assignedTeam: true },
      });
      res.json(ok(full ? mapTask(full) : entity, 'Calibration task updated'));
    } catch (error) {
      next(error);
    }
  },
);

const legacyCrudRouter = createCrudRouter(
  {
    moduleName: 'calibration',
    moduleId: 'CALIBRATION',
    basePath: '/api/calibration',
    tableName: 'calibration_records',
    plantColumn: 'plant_id',
  },
  calibrationService,
  { createSchema: createCalibrationSchema, updateSchema: updateCalibrationSchema },
);

calibrationRouter.use(legacyCrudRouter);
