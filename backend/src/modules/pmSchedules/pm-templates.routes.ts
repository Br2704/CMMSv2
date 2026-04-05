import { Router } from 'express';
import { z } from 'zod';
import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { PmTemplateEntity, PmTemplateLinkEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { validateRequest } from '../../middlewares/validate';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { buildPagination, listQuerySchema, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { computeNextDueDate, parseChecklistTasks, validatePmLinkScope } from './pm-scheduling.utils';

const idParamSchema = z.object({ id: z.string().uuid() });

const templateSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  templateName: z.string().min(1),
  maintenanceType: z.enum(['PM', 'PD']).default('PM'),
  discipline: z.string().nullable().optional(),
  frequencyType: z.enum(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']).default('MONTH'),
  frequencyValue: z.number().int().positive().default(1),
  estimatedDuration: z.number().int().positive().default(60),
  checklistTasks: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});

const linkSchema = z.object({
  templateId: z.string().uuid(),
  plantId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid(),
  startDate: z.string().datetime(),
  assignedTeamId: z.string().uuid().nullable().optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  checklistTasksOverride: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().default(true),
});

const linkListSchema = listQuerySchema.extend({
  templateId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
});

function mapTemplate(entity: PmTemplateEntity) {
  return {
    id: entity.id,
    plantId: entity.plantId,
    templateName: entity.templateName,
    maintenanceType: entity.maintenanceType,
    discipline: entity.discipline,
    frequencyType: entity.frequencyType,
    frequencyValue: entity.frequencyValue,
    estimatedDuration: entity.estimatedDuration,
    checklistTasks: parseChecklistTasks(entity.checklistTasks).map((item) => item.title),
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapLink(entity: PmTemplateLinkEntity) {
  return {
    id: entity.id,
    templateId: entity.templateId,
    plantId: entity.plantId,
    departmentId: entity.departmentId,
    assetId: entity.assetId,
    startDate: entity.startDate,
    assignedTeamId: entity.assignedTeamId,
    responsibleUserId: entity.responsibleUserId,
    checklistTasksOverride: parseChecklistTasks(entity.checklistTasksOverride).map((item) => item.title),
    nextDueDate: entity.nextDueDate,
    lastGeneratedAt: entity.lastGeneratedAt,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    template: entity.template
      ? {
          id: entity.template.id,
          templateName: entity.template.templateName,
          maintenanceType: entity.template.maintenanceType,
          discipline: entity.template.discipline,
          frequencyType: entity.template.frequencyType,
          frequencyValue: entity.template.frequencyValue,
          estimatedDuration: entity.template.estimatedDuration,
        }
      : null,
    asset: entity.asset
      ? {
          id: entity.asset.id,
          code: entity.asset.code,
          name: entity.asset.name,
          departmentId: entity.asset.departmentId,
          moduleId: entity.asset.moduleId,
          plantId: entity.asset.plantId,
        }
      : null,
    assignedTeam: entity.assignedTeam
      ? {
          id: entity.assignedTeam.id,
          teamName: entity.assignedTeam.teamName,
        }
      : null,
    responsibleUser: entity.responsibleUser
      ? {
          id: entity.responsibleUser.id,
          fullName: entity.responsibleUser.fullName,
          email: entity.responsibleUser.email,
        }
      : null,
  };
}

export const pmTemplatesRouter = Router();
pmTemplatesRouter.use(requireAuth);

pmTemplatesRouter.get('/pm-templates', requirePermission('MASTERS', 'READ'), validateRequest({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(PmTemplateEntity);
    const qb = repo.createQueryBuilder('template');
    applySearch(qb, 'template', query.search, ['template_name', 'maintenance_type', 'discipline', 'frequency_type']);
    applyPlantScope(qb, 'template', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) qb.andWhere('template.is_active = :isActive', { isActive: true });
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('template.createdAt', 'DESC');
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows.map(mapTemplate), 'PM templates fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.post('/pm-templates', requirePermission('MASTERS', 'CREATE'), validateRequest({ body: templateSchema }), async (req, res, next) => {
  try {
    const body = templateSchema.parse(req.body);
    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const repo = AppDataSource.getRepository(PmTemplateEntity);
    const created = repo.create({
      plantId,
      templateName: body.templateName,
      maintenanceType: body.maintenanceType,
      discipline: body.discipline ?? null,
      frequencyType: body.frequencyType,
      frequencyValue: body.frequencyValue,
      estimatedDuration: body.estimatedDuration,
      checklistTasks: JSON.stringify(body.checklistTasks),
      isActive: body.isActive,
    });
    await repo.save(created);
    res.status(201).json(ok(mapTemplate(created), 'PM template created'));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.patch('/pm-templates/:id', requirePermission('MASTERS', 'UPDATE'), validateRequest({ params: idParamSchema, body: templateSchema.partial() }), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const body = templateSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(PmTemplateEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('PM template not found'));
      return;
    }
    const plantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, plantId);
    Object.assign(entity, {
      plantId,
      templateName: body.templateName ?? entity.templateName,
      maintenanceType: body.maintenanceType ?? entity.maintenanceType,
      discipline: body.discipline === undefined ? entity.discipline : body.discipline ?? null,
      frequencyType: body.frequencyType ?? entity.frequencyType,
      frequencyValue: body.frequencyValue ?? entity.frequencyValue,
      estimatedDuration: body.estimatedDuration ?? entity.estimatedDuration,
      checklistTasks: body.checklistTasks === undefined ? entity.checklistTasks : JSON.stringify(body.checklistTasks),
      isActive: body.isActive ?? entity.isActive,
    });
    await repo.save(entity);
    res.json(ok(mapTemplate(entity), 'PM template updated'));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.delete('/pm-templates/:id', requirePermission('MASTERS', 'DELETE'), validateRequest({ params: idParamSchema }), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const repo = AppDataSource.getRepository(PmTemplateEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('PM template not found'));
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    res.json(ok({ id: entity.id, deleted: true }, 'PM template deactivated'));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.get('/pm-template-links', requirePermission('MASTERS', 'READ'), validateRequest({ query: linkListSchema }), async (req, res, next) => {
  try {
    const extended = linkListSchema.parse(req.query as Record<string, unknown>);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(PmTemplateLinkEntity);
    const qb = repo
      .createQueryBuilder('link')
      .leftJoinAndSelect('link.template', 'template')
      .leftJoinAndSelect('link.asset', 'asset')
      .leftJoinAndSelect('link.assignedTeam', 'assignedTeam')
      .leftJoinAndSelect('link.responsibleUser', 'responsibleUser');

    if (query.search) {
      const searchValue = `%${query.search}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('template.template_name ILIKE :searchValue', { searchValue })
            .orWhere('template.maintenance_type ILIKE :searchValue', { searchValue })
            .orWhere('template.discipline ILIKE :searchValue', { searchValue })
            .orWhere('asset.code ILIKE :searchValue', { searchValue })
            .orWhere('asset.name ILIKE :searchValue', { searchValue });
        }),
      );
    }
    applyPlantScope(qb, 'link', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) qb.andWhere('link.is_active = :isActive', { isActive: true });
    if (extended.templateId) qb.andWhere('link.template_id = :templateId', { templateId: extended.templateId });
    if (extended.assetId) qb.andWhere('link.asset_id = :assetId', { assetId: extended.assetId });
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('link.nextDueDate', 'ASC');
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows.map(mapLink), 'PM linked assets fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.post('/pm-template-links', requirePermission('MASTERS', 'CREATE'), validateRequest({ body: linkSchema }), async (req, res, next) => {
  try {
    const body = linkSchema.parse(req.body);
    const templateRepo = AppDataSource.getRepository(PmTemplateEntity);
    const repo = AppDataSource.getRepository(PmTemplateLinkEntity);
    const template = await templateRepo.findOneBy({ id: body.templateId, isActive: true });
    if (!template) {
      res.status(404).json(fail('PM template not found'));
      return;
    }

    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? template.plantId ?? null);
    ensurePlantAccess(req, plantId);

    try {
      await validatePmLinkScope({
        plantId,
        departmentId: body.departmentId ?? null,
        assetId: body.assetId,
        responsibleUserId: body.responsibleUserId ?? null,
        assignedTeamId: body.assignedTeamId ?? null,
        expectedDiscipline: template.discipline,
      });
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid PM link scope'));
      return;
    }

    const startDate = new Date(body.startDate);
    const created = repo.create({
      templateId: body.templateId,
      plantId,
      departmentId: body.departmentId ?? null,
      assetId: body.assetId,
      startDate,
      assignedTeamId: body.assignedTeamId ?? null,
      responsibleUserId: body.responsibleUserId ?? null,
      checklistTasksOverride:
        body.checklistTasksOverride && body.checklistTasksOverride.length > 0
          ? JSON.stringify(body.checklistTasksOverride)
          : null,
      nextDueDate: computeNextDueDate(startDate, template),
      isActive: body.isActive,
    });
    await repo.save(created);
    const full = await repo.findOne({
      where: { id: created.id },
      relations: { template: true, asset: true, assignedTeam: true, responsibleUser: true },
    });
    res.status(201).json(ok(full ? mapLink(full) : created, 'PM asset link created'));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.patch('/pm-template-links/:id', requirePermission('MASTERS', 'UPDATE'), validateRequest({ params: idParamSchema, body: linkSchema.partial() }), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const body = linkSchema.partial().parse(req.body);
    const templateRepo = AppDataSource.getRepository(PmTemplateEntity);
    const repo = AppDataSource.getRepository(PmTemplateLinkEntity);
    const entity = await repo.findOne({
      where: { id: params.id },
      relations: { template: true, asset: true, assignedTeam: true, responsibleUser: true },
    });
    if (!entity) {
      res.status(404).json(fail('PM asset link not found'));
      return;
    }

    const templateId = body.templateId ?? entity.templateId;
    const template = await templateRepo.findOneBy({ id: templateId, isActive: true });
    if (!template) {
      res.status(404).json(fail('PM template not found'));
      return;
    }

    const plantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId ?? null);
    ensurePlantAccess(req, plantId);
    const startDate = body.startDate ? new Date(body.startDate) : entity.startDate;
    const departmentId = body.departmentId === undefined ? entity.departmentId : body.departmentId ?? null;
    const assetId = body.assetId ?? entity.assetId;
    const responsibleUserId = body.responsibleUserId === undefined ? entity.responsibleUserId : body.responsibleUserId ?? null;
    const assignedTeamId = body.assignedTeamId === undefined ? entity.assignedTeamId : body.assignedTeamId ?? null;
    const checklistTasksOverride =
      body.checklistTasksOverride === undefined
        ? entity.checklistTasksOverride
        : body.checklistTasksOverride.length > 0
          ? JSON.stringify(body.checklistTasksOverride)
          : null;

    try {
      await validatePmLinkScope({
        plantId,
        departmentId,
        assetId,
        responsibleUserId,
        assignedTeamId,
        expectedDiscipline: template.discipline,
      });
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'Invalid PM link scope'));
      return;
    }

    Object.assign(entity, {
      templateId,
      plantId,
      departmentId,
      assetId,
      startDate,
      assignedTeamId,
      responsibleUserId,
      checklistTasksOverride,
      isActive: body.isActive ?? entity.isActive,
      nextDueDate: computeNextDueDate(startDate, template),
    });
    await repo.save(entity);
    const full = await repo.findOne({
      where: { id: entity.id },
      relations: { template: true, asset: true, assignedTeam: true, responsibleUser: true },
    });
    res.json(ok(full ? mapLink(full) : entity, 'PM asset link updated'));
  } catch (error) {
    next(error);
  }
});

pmTemplatesRouter.delete('/pm-template-links/:id', requirePermission('MASTERS', 'DELETE'), validateRequest({ params: idParamSchema }), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const repo = AppDataSource.getRepository(PmTemplateLinkEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('PM asset link not found'));
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    res.json(ok({ id: entity.id, deleted: true }, 'PM asset link deactivated'));
  } catch (error) {
    next(error);
  }
});
