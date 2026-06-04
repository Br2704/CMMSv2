import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  AssetEntity,
  DepartmentEntity,
  LogEntryEntity,
  LogEntryValueEntity,
  LogTemplateAssignmentEntity,
  LogTemplateEntity,
  LogTemplateFieldEntity,
  MachineModuleEntity,
  ProfileEntity,
  ShiftEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { isRootAdminRole } from '../../utils/rbac';
import { approvalEngineService } from '../../services/approval-engine.service';
import { executionApprovalService } from '../../services/execution-approval.service';
import { applyPlantScope } from '../../utils/query';
import { applyMachineOwnershipScope } from '../../utils/machineOwnershipScope';

const listTemplatesQuerySchema = z.object({
  plantId: z.string().uuid().optional(),
  assignedOnly: z.coerce.boolean().default(false),
});

const createLogEntrySchema = z.object({
  templateId: z.string().uuid(),
  shiftId: z.string().uuid().nullable().optional(),
  plantId: z.string().uuid().nullable().optional(),
  logDate: z.string().optional(),
  status: z.string().default('SUBMITTED'),
  remarks: z.string().nullable().optional(),
  values: z
    .array(
      z.object({
        fieldId: z.string().uuid(),
        value: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

const createTemplateSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  templateName: z.string().min(1),
  category: z.string().default('GENERAL'),
  description: z.string().nullable().optional(),
  frequency: z.string().default('PER_SHIFT'),
  reminderMinutesBefore: z.coerce.number().int().min(0).default(0),
  overdueAlertMinutes: z.coerce.number().int().min(0).default(0),
  notifyAtShiftStart: z.boolean().default(false),
  isActive: z.boolean().default(true),
  createdBy: z.string().uuid().nullable().optional(),
});

const createFieldSchema = z.object({
  sectionName: z.string().default('General'),
  fieldName: z.string().min(1),
  fieldLabel: z.string().min(1),
  fieldType: z.string().default('TEXT'),
  options: z.any().nullable().optional(),
  isRequired: z.boolean().default(false),
  minValue: z.coerce.number().nullable().optional(),
  maxValue: z.coerce.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  displayOrder: z.coerce.number().int().default(0),
  validationRules: z.any().nullable().optional(),
  conditionalOn: z.any().nullable().optional(),
});

const assignmentSchema = z.object({
  templateId: z.string().uuid(),
  userId: z.string().uuid(),
});

function normalizeFrequency(value: string | null | undefined) {
  const normalized = String(value ?? 'SHIFT').trim().toUpperCase();
  if (normalized === 'PER_SHIFT') {
    return 'SHIFT';
  }
  if (normalized === 'HOURLY' || normalized === 'DAILY' || normalized === 'WEEKLY' || normalized === 'SHIFT') {
    return normalized;
  }
  return 'SHIFT';
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

async function enforceFrequencyWindow(input: {
  template: LogTemplateEntity;
  userId: string;
  shiftId: string | null;
  logDate: string;
}) {
  const entryRepo = AppDataSource.getRepository(LogEntryEntity);
  const frequency = normalizeFrequency(input.template.frequency);
  const requestedDate = new Date(`${input.logDate}T00:00:00.000Z`);

  if (frequency === 'SHIFT') {
    if (!input.shiftId) {
      badRequest('Shift is required for shift-based log templates');
    }
    const existing = await entryRepo.findOneBy({
      templateId: input.template.id,
      loggedBy: input.userId,
      shiftId: input.shiftId,
      logDate: input.logDate,
    });
    if (existing) {
      conflict('A log entry already exists for this shift');
    }
    return;
  }

  if (frequency === 'DAILY') {
    const existing = await entryRepo.findOneBy({
      templateId: input.template.id,
      loggedBy: input.userId,
      logDate: input.logDate,
    });
    if (existing) {
      conflict('A daily log entry already exists for this date');
    }
    return;
  }

  if (frequency === 'WEEKLY') {
    const weekStart = getWeekStart(requestedDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const existing = await entryRepo
      .createQueryBuilder('entry')
      .where('entry.template_id = :templateId', { templateId: input.template.id })
      .andWhere('entry.logged_by = :userId', { userId: input.userId })
      .andWhere('entry.log_date >= :weekStart', { weekStart: toIsoDate(weekStart) })
      .andWhere('entry.log_date < :weekEnd', { weekEnd: toIsoDate(weekEnd) })
      .getOne();
    if (existing) {
      conflict('A weekly log entry already exists for this week');
    }
    return;
  }

  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);
  const existing = await entryRepo
    .createQueryBuilder('entry')
    .where('entry.template_id = :templateId', { templateId: input.template.id })
    .andWhere('entry.logged_by = :userId', { userId: input.userId })
    .andWhere('entry.created_at >= :hourStart', { hourStart: hourStart.toISOString() })
    .andWhere('entry.created_at < :hourEnd', { hourEnd: hourEnd.toISOString() })
    .getOne();
  if (existing) {
    conflict('An hourly log entry already exists for the current hour');
  }
}

async function ensureAssignedTemplate(templateId: string, userId: string) {
  const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
  const assignment = await assignmentRepo.findOneBy({ templateId, userId });
  if (!assignment) {
    forbidden('This log template is not assigned to your account');
  }
}

export const dataLoggingRouter = Router();
dataLoggingRouter.use(requireAuth);

dataLoggingRouter.get('/log-templates', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const qb = templateRepo.createQueryBuilder('template');
    applyPlantScope(qb, 'template', 'plant_id', req.auth!, query.plantId);
    applyMachineOwnershipScope(qb, 'template', req.auth!, {
      assetField: 'template.machine_id',
      departmentField: 'template.department_id',
    });
    if (query.search) {
      qb.andWhere('(LOWER(template.template_name) LIKE :search OR LOWER(template.category) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('template.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Log templates fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-templates/:id', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await templateRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Log template fetched'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/log-templates', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const body = createTemplateSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const payload = {
      ...body,
      plantId: resolvedPlantId,
      createdBy: body.createdBy ?? req.auth!.userId,
    };

    await approvalEngineService.submitChangeRequest(
      'LOG_TEMPLATE',
      'CREATE',
      payload,
      null,
      req.auth!
    );

    res.status(202).json(ok(null, 'Log template change request submitted for approval'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.patch('/log-templates/:id', requirePermission('LOGS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createTemplateSchema.partial().parse(req.body);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await templateRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : (body.plantId ?? null));
    ensurePlantAccess(req, nextPlantId);

    const payload = { ...body, plantId: nextPlantId };

    await approvalEngineService.submitChangeRequest(
      'LOG_TEMPLATE',
      'UPDATE',
      payload,
      entity.id,
      req.auth!
    );

    res.status(202).json(ok(null, 'Log template update submitted for approval'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.delete('/log-templates/:id', requirePermission('LOGS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await templateRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    
    await approvalEngineService.submitChangeRequest(
      'LOG_TEMPLATE',
      'DELETE',
      { isActive: false },
      entity.id,
      req.auth!
    );

    res.status(202).json(ok(null, 'Log template deletion submitted for approval'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-templates/:id/fields', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const template = await templateRepo.findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);
    const rows = await fieldRepo.find({ where: { templateId: params.id }, order: { displayOrder: 'ASC' } });
    res.json(ok(rows, 'Log template fields fetched'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-template-fields', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const templateId = typeof req.query.template_id === 'string' ? req.query.template_id : undefined;
    const requestedPlantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const qb = fieldRepo
      .createQueryBuilder('field')
      .innerJoin(LogTemplateEntity, 'template', 'template.id = field.template_id');

    applyPlantScope(qb, 'template', 'plant_id', req.auth!, requestedPlantId);

    if (templateId) {
      const template = await templateRepo.findOneBy({ id: templateId });
      if (!template) {
        res.status(404).json({ success: false, message: 'Log template not found' });
        return;
      }
      ensurePlantAccess(req, template.plantId);
      qb.andWhere('field.template_id = :templateId', { templateId });
    }

    if (query.search) {
      qb.andWhere('(LOWER(field.field_name) LIKE :search OR LOWER(field.field_label) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    qb
      .orderBy('field.display_order', 'ASC')
      .addOrderBy('field.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Log template fields fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/log-templates/:id/fields', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createFieldSchema.parse(req.body);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const template = await templateRepo.findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);
    const created = fieldRepo.create({
      ...body,
      templateId: params.id,
      minValue: body.minValue === null || body.minValue === undefined ? null : String(body.minValue),
      maxValue: body.maxValue === null || body.maxValue === undefined ? null : String(body.maxValue),
    });
    await fieldRepo.save(created);
    res.status(201).json(ok(created, 'Log template field created'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.patch('/log-template-fields/:id', requirePermission('LOGS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createFieldSchema.partial().parse(req.body);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await fieldRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template field not found' });
      return;
    }
    const template = await templateRepo.findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    Object.assign(entity, body);
    if (body.minValue !== undefined) {
      entity.minValue = body.minValue === null ? null : String(body.minValue);
    }
    if (body.maxValue !== undefined) {
      entity.maxValue = body.maxValue === null ? null : String(body.maxValue);
    }
    await fieldRepo.save(entity);
    res.json(ok(entity, 'Log template field updated'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.delete('/log-template-fields/:id', requirePermission('LOGS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await fieldRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template field not found' });
      return;
    }
    const template = await templateRepo.findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    await fieldRepo.remove(entity);
    res.json(ok({ id: params.id }, 'Log template field deleted'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-template-assignments', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const templateId = typeof req.query.template_id === 'string' ? req.query.template_id : undefined;
    const requestedPlantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    if (templateId) {
      const template = await templateRepo.findOneBy({ id: templateId });
      if (!template) {
        res.status(404).json({ success: false, message: 'Log template not found' });
        return;
      }
      ensurePlantAccess(req, template.plantId);
    }
    const qb = assignmentRepo
      .createQueryBuilder('assignment')
      .innerJoin(LogTemplateEntity, 'template', 'template.id = assignment.template_id');
    applyPlantScope(qb, 'template', 'plant_id', req.auth!, requestedPlantId);
    if (templateId) {
      qb.andWhere('assignment.template_id = :templateId', { templateId });
    }
    const rows = await qb.orderBy('assignment.created_at', 'DESC').take(500).getMany();
    res.json(ok(rows, 'Log template assignments fetched'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/log-template-assignments', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const body = assignmentSchema.parse(req.body);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
    const template = await templateRepo.findOneBy({ id: body.templateId });
    if (!template) {
      res.status(404).json({ success: false, message: 'Log template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);
    const created = assignmentRepo.create(body);
    await assignmentRepo.save(created);
    res.status(201).json(ok(created, 'Log template assignment created'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.delete('/log-template-assignments/:id', requirePermission('LOGS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const entity = await assignmentRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log template assignment not found' });
      return;
    }
    const template = await templateRepo.findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    await assignmentRepo.delete({ id: params.id });
    res.json(ok({ id: params.id }, 'Log template assignment deleted'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-entries', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const qb = entryRepo.createQueryBuilder('entry');
    applyPlantScope(qb, 'entry', 'plant_id', req.auth!, query.plantId);
    applyMachineOwnershipScope(qb, 'entry', req.auth!, {
      assetField: 'entry.machine_id',
      departmentField: 'entry.department_id',
    });
    if (query.search) {
      qb.andWhere('(LOWER(entry.status) LIKE :search OR LOWER(entry.remarks) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('entry.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Log entries fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/log-entries', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const body = createLogEntrySchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const created = entryRepo.create({
      templateId: body.templateId,
      shiftId: body.shiftId ?? null,
      plantId: resolvedPlantId,
      loggedBy: req.auth!.userId,
      logDate: body.logDate ?? new Date().toISOString().slice(0, 10),
      status: body.status,
      submittedAt: new Date(),
      remarks: body.remarks ?? null,
    });
    await entryRepo.save(created);
    res.status(201).json(ok(created, 'Log entry created'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.patch('/log-entries/:id', requirePermission('LOGS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        shiftId: z.string().uuid().nullable().optional(),
        status: z.string().optional(),
        remarks: z.string().nullable().optional(),
        submittedAt: z.string().nullable().optional(),
      })
      .parse(req.body);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const entity = await entryRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log entry not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    
    const request = await executionApprovalService.submitExecution(
      'LOG_ENTRY',
      body,
      entity.id,
      req.auth!
    );

    res.status(202).json(ok({ id: entity.id, status: 'PENDING_APPROVAL' }, 'Log entry update submitted for execution approval'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.delete('/log-entries/:id', requirePermission('LOGS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const entry = await entryRepo.findOneBy({ id: params.id });
    if (!entry) {
      res.status(404).json({ success: false, message: 'Log entry not found' });
      return;
    }
    ensurePlantAccess(req, entry.plantId);
    await entryRepo.delete({ id: params.id });
    res.json(ok({ id: params.id }, 'Log entry deleted'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/log-entry-values', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const entryId = typeof req.query.entry_id === 'string' ? req.query.entry_id : undefined;
    const requestedPlantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const qb = valueRepo
      .createQueryBuilder('value')
      .innerJoin(LogEntryEntity, 'entry', 'entry.id = value.entry_id');
    applyPlantScope(qb, 'entry', 'plant_id', req.auth!, requestedPlantId);
    if (entryId) {
      qb.andWhere('value.entry_id = :entryId', { entryId });
    }
    const rows = await qb.orderBy('value.created_at', 'DESC').take(1000).getMany();
    res.json(ok(rows, 'Log entry values fetched'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/log-entry-values', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const body = z
      .array(
        z.object({
          entryId: z.string().uuid(),
          fieldId: z.string().uuid(),
          value: z.string().nullable().optional(),
        }),
      )
      .or(
        z.object({
          entryId: z.string().uuid(),
          fieldId: z.string().uuid(),
          value: z.string().nullable().optional(),
        }),
      )
      .parse(req.body);
    const rows = Array.isArray(body) ? body : [body];
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const entryIds = Array.from(new Set(rows.map((row) => row.entryId)));
    const entries = await entryRepo.find({ where: entryIds.map((id) => ({ id })) });
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
    for (const row of rows) {
      const entry = entryMap.get(row.entryId);
      if (!entry) {
        res.status(404).json({ success: false, message: 'Log entry not found' });
        return;
      }
      ensurePlantAccess(req, entry.plantId);
    }
    const created = await valueRepo.save(rows.map((item) => valueRepo.create(item)));
    res.status(201).json(ok(created, 'Log entry values created'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.patch('/log-entry-values/:id', requirePermission('LOGS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ value: z.string().nullable().optional() }).parse(req.body);
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const entity = await valueRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log entry value not found' });
      return;
    }
    const entry = await entryRepo.findOneBy({ id: entity.entryId });
    ensurePlantAccess(req, entry?.plantId ?? null);
    if (body.value !== undefined) {
      entity.value = body.value ?? null;
    }
    await valueRepo.save(entity);
    res.json(ok(entity, 'Log entry value updated'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.delete('/log-entry-values/:id', requirePermission('LOGS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const entity = await valueRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Log entry value not found' });
      return;
    }
    const entry = await entryRepo.findOneBy({ id: entity.entryId });
    ensurePlantAccess(req, entry?.plantId ?? null);
    await valueRepo.delete({ id: params.id });
    res.json(ok({ id: params.id }, 'Log entry value deleted'));
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/data-logging/templates', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = listTemplatesQuerySchema.parse(req.query);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);
    const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);
    const machineRepo = AppDataSource.getRepository(AssetEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const shiftRepo = AppDataSource.getRepository(ShiftEntity);

    const templateQb = templateRepo.createQueryBuilder('template').where('template.is_active = :active', { active: true });
    applyPlantScope(templateQb, 'template', 'plant_id', req.auth!, query.plantId);
    applyMachineOwnershipScope(templateQb, 'template', req.auth!, {
      assetField: 'template.machine_id',
      departmentField: 'template.department_id',
    });

    if (query.assignedOnly) {
      templateQb.andWhere(
        'EXISTS (SELECT 1 FROM log_template_users assignment WHERE assignment.template_id = template.id AND assignment.user_id = :userId)',
        { userId: req.auth!.userId },
      );
    }

    templateQb.orderBy('template.created_at', 'DESC');
    const templates = await templateQb.getMany();

    const templateIds = templates.map((template) => template.id);
    const [fields, assignments] = await Promise.all([
      templateIds.length ? fieldRepo.find({ where: templateIds.map((templateId) => ({ templateId })) }) : [],
      templateIds.length ? assignmentRepo.find({ where: templateIds.map((templateId) => ({ templateId })) }) : [],
    ]);
    const departmentIds = Array.from(new Set(templates.map((item) => item.departmentId).filter((value): value is string => Boolean(value))));
    const moduleIds = Array.from(new Set(templates.map((item) => item.moduleId).filter((value): value is string => Boolean(value))));
    const machineIds = Array.from(new Set(templates.map((item) => item.machineId).filter((value): value is string => Boolean(value))));
    const assignedUserIds = Array.from(new Set(assignments.map((item) => item.userId).filter(Boolean)));
    const [departments, modules, machines, profiles] = await Promise.all([
      departmentIds.length ? departmentRepo.find({ where: departmentIds.map((id) => ({ id })) }) : [],
      moduleIds.length ? moduleRepo.find({ where: moduleIds.map((id) => ({ id })) }) : [],
      machineIds.length ? machineRepo.find({ where: machineIds.map((id) => ({ id })) }) : [],
      assignedUserIds.length ? profileRepo.find({ where: assignedUserIds.map((userId) => ({ userId })) }) : [],
    ]);

    const fieldMap = new Map<string, LogTemplateFieldEntity[]>();
    fields.forEach((field) => {
      const prev = fieldMap.get(field.templateId) ?? [];
      prev.push(field);
      fieldMap.set(field.templateId, prev);
    });

    const assignmentMap = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      const prev = assignmentMap.get(assignment.templateId) ?? [];
      prev.push(assignment.userId);
      assignmentMap.set(assignment.templateId, prev);
    });
    const departmentMap = new Map(departments.map((item) => [item.id, item]));
    const moduleMap = new Map(modules.map((item) => [item.id, item]));
    const machineMap = new Map(machines.map((item) => [item.id, item]));
    const profileMap = new Map(profiles.map((item) => [item.userId, item]));

    const shiftsQb = shiftRepo.createQueryBuilder('shift').where('shift.is_active = :active', { active: true });
    applyPlantScope(shiftsQb, 'shift', 'plant_id', req.auth!, query.plantId);
    const shifts = await shiftsQb.orderBy('shift.start_time', 'ASC').getMany();

    res.json(
      ok({
        templates: templates.map((template) => ({
          ...template,
          frequency: normalizeFrequency(template.frequency),
          departmentName: template.departmentId ? departmentMap.get(template.departmentId)?.name ?? null : null,
          moduleName: template.moduleId ? moduleMap.get(template.moduleId)?.name ?? null : null,
          machineName: template.machineId ? machineMap.get(template.machineId)?.name ?? null : null,
          fields: (fieldMap.get(template.id) ?? []).sort((a, b) => a.displayOrder - b.displayOrder),
          assignments: (assignmentMap.get(template.id) ?? []).map((userId) => ({
            userId,
            fullName: profileMap.get(userId)?.fullName ?? 'Assigned User',
            userCode: profileMap.get(userId)?.userCode ?? null,
          })),
        })),
        shifts,
      }),
    );
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.post('/data-logging/entries', requirePermission('LOGS', 'CREATE'), async (req, res, next) => {
  try {
    const body = createLogEntrySchema.parse(req.body);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);

    const template = await templateRepo.findOneBy({ id: body.templateId, isActive: true });
    if (!template) {
      notFound('Log template not found');
    }

    await ensureAssignedTemplate(body.templateId, req.auth!.userId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, template.plantId ?? body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const fields = await fieldRepo.find({ where: { templateId: body.templateId } });
    const fieldMap = new Map(fields.map((field) => [field.id, field]));
    for (const value of body.values) {
      if (!fieldMap.has(value.fieldId)) {
        badRequest('One or more log fields do not belong to the selected template');
      }
    }
    for (const field of fields) {
      const submitted = body.values.find((value) => value.fieldId === field.id);
      if (field.isRequired && (!submitted || !String(submitted.value ?? '').trim())) {
        badRequest(`"${field.fieldLabel}" is required`);
      }
      if (field.fieldType === 'NUMBER' && submitted?.value !== undefined && submitted.value !== null && String(submitted.value).trim() !== '') {
        const numeric = Number(submitted.value);
        if (Number.isNaN(numeric)) {
          badRequest(`"${field.fieldLabel}" must be a number`);
        }
        if (field.minValue !== null && numeric < Number(field.minValue)) {
          badRequest(`"${field.fieldLabel}" cannot be below ${field.minValue}`);
        }
        if (field.maxValue !== null && numeric > Number(field.maxValue)) {
          badRequest(`"${field.fieldLabel}" cannot exceed ${field.maxValue}`);
        }
      }
    }

    const logDate = body.logDate ?? new Date().toISOString().slice(0, 10);
    await enforceFrequencyWindow({
      template,
      userId: req.auth!.userId,
      shiftId: body.shiftId ?? null,
      logDate,
    });

    const payload = {
      templateId: body.templateId,
      shiftId: body.shiftId ?? null,
      plantId: resolvedPlantId,
      departmentId: template.departmentId ?? null,
      moduleId: template.moduleId ?? null,
      machineId: template.machineId ?? null,
      loggedBy: req.auth!.userId,
      logDate,
      status: body.status,
      submittedAt: new Date(),
      remarks: body.remarks ?? null,
      values: body.values.length > 0 ? body.values : undefined
    };

    const request = await executionApprovalService.submitExecution(
      'LOG_ENTRY',
      payload,
      null,
      req.auth!
    );

    res.status(202).json(
      ok(
        {
          id: request.id,
          status: 'PENDING_APPROVAL',
          templateName: template.templateName,
          values: []
        },
        'Data log entry submitted for execution approval'
      )
    );
  } catch (error) {
    next(error);
  }
});

dataLoggingRouter.get('/data-logging/entries', requirePermission('LOGS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const entryRepo = AppDataSource.getRepository(LogEntryEntity);
    const valueRepo = AppDataSource.getRepository(LogEntryValueEntity);
    const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
    const shiftRepo = AppDataSource.getRepository(ShiftEntity);
    const fieldRepo = AppDataSource.getRepository(LogTemplateFieldEntity);

    const qb = entryRepo.createQueryBuilder('entry');
    applyPlantScope(qb, 'entry', 'plant_id', req.auth!, query.plantId);
    qb.andWhere('entry.logged_by = :userId', { userId: req.auth!.userId });
    if (typeof req.query.templateId === 'string') {
      qb.andWhere('entry.template_id = :templateId', { templateId: req.query.templateId });
    }
    if (query.search) {
      qb.andWhere('(LOWER(entry.status) LIKE :search OR LOWER(entry.remarks) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('entry.created_at', 'DESC');
    const [entries, total] = await qb.getManyAndCount();

    const entryIds = entries.map((entry) => entry.id);
    const values = entryIds.length ? await valueRepo.find({ where: entryIds.map((entryId) => ({ entryId })) }) : [];
    const templateIds = Array.from(new Set(entries.map((entry) => entry.templateId)));
    const shiftIds = Array.from(new Set(entries.map((entry) => entry.shiftId).filter((value): value is string => Boolean(value))));
    const fieldIds = Array.from(new Set(values.map((value) => value.fieldId)));
    const [templates, shifts, fields] = await Promise.all([
      templateIds.length ? templateRepo.find({ where: templateIds.map((id) => ({ id })) }) : [],
      shiftIds.length ? shiftRepo.find({ where: shiftIds.map((id) => ({ id })) }) : [],
      fieldIds.length ? fieldRepo.find({ where: fieldIds.map((id) => ({ id })) }) : [],
    ]);
    const valueMap = new Map<string, LogEntryValueEntity[]>();
    values.forEach((value) => {
      const prev = valueMap.get(value.entryId) ?? [];
      prev.push(value);
      valueMap.set(value.entryId, prev);
    });
    const templateMap = new Map(templates.map((item) => [item.id, item]));
    const shiftMap = new Map(shifts.map((item) => [item.id, item]));
    const fieldMap = new Map(fields.map((item) => [item.id, item]));

    res.json(
      ok(
        entries.map((entry) => ({
          ...entry,
          templateName: templateMap.get(entry.templateId)?.templateName ?? 'Log Template',
          frequency: normalizeFrequency(templateMap.get(entry.templateId)?.frequency),
          shiftName: entry.shiftId ? shiftMap.get(entry.shiftId)?.shiftName ?? null : null,
          values: (valueMap.get(entry.id) ?? []).map((value) => ({
            ...value,
            fieldLabel: fieldMap.get(value.fieldId)?.fieldLabel ?? null,
            unit: fieldMap.get(value.fieldId)?.unit ?? null,
          })),
        })),
        'Data log entries fetched',
        buildPagination(query.page, query.limit, total),
      ),
    );
  } catch (error) {
    next(error);
  }
});
