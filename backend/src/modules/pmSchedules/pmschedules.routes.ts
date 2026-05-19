import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { MaintenanceTeamEntity, PmScheduleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { validateRequest } from '../../middlewares/validate';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { buildPagination, listQuerySchema, parseListQuery } from '../../utils/pagination';
import { applyPlantScope, applySearch } from '../../utils/query';
import { pmschedulesService } from './pmschedules.service';
import { createPMScheduleSchema, updatePMScheduleSchema } from './pmschedules.validators';
import { generateDuePmTasks } from './pm-scheduling.utils';

const idParamSchema = z.object({ id: z.string().uuid() });
const pmListQuerySchema = listQuerySchema.extend({
  assetId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  status: z.string().optional(),
});

function mapScheduleRow(row: PmScheduleEntity) {
  const asset = row.asset;
  const template = row.template;
  const team = row.assignedTeam as MaintenanceTeamEntity | null;
  const assignedUser = row.assignedToUser;

  return {
    id: row.id,
    pmId: `PM-${row.id.slice(0, 8).toUpperCase()}`,
    plantId: row.plantId,
    assetId: row.assetId,
    templateId: row.templateId,
    templateLinkId: row.templateLinkId,
    maintenanceType: row.maintenanceType,
    discipline: row.discipline,
    frequency: row.frequency,
    frequencyType: row.frequencyType,
    frequencyValue: row.frequencyValue,
    estimatedDuration: row.estimatedDuration,
    checklist: row.checklist,
    assignedTo: row.assignedTo,
    assignedTeamId: row.assignedTeamId,
    lastCompleted: row.lastCompleted,
    nextDue: row.nextDue,
    completedAt: row.completedAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    asset: asset
      ? {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          assetType: asset.assetType,
          plantId: asset.plantId,
          departmentId: asset.departmentId,
          moduleId: asset.moduleId,
        }
      : null,
    template: template
      ? {
          id: template.id,
          templateName: template.templateName,
          maintenanceType: template.maintenanceType,
          discipline: template.discipline,
          frequencyType: template.frequencyType,
          frequencyValue: template.frequencyValue,
          estimatedDuration: template.estimatedDuration,
        }
      : null,
    assignedTeam: team
      ? {
          id: team.id,
          teamName: team.teamName,
          discipline: team.discipline,
        }
      : null,
    responsibleUser: assignedUser
      ? {
          id: assignedUser.id,
          fullName: assignedUser.fullName,
          email: assignedUser.email,
        }
      : null,
  };
}

async function listSchedulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await generateDuePmTasks();
    const extendedQuery = pmListQuerySchema.parse(req.query as Record<string, unknown>);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(PmScheduleEntity);
    const qb = repo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.asset', 'asset')
      .leftJoinAndSelect('schedule.template', 'template')
      .leftJoinAndSelect('schedule.assignedToUser', 'assignedToUser')
      .leftJoinAndSelect('schedule.assignedTeam', 'assignedTeam');

    if (query.search) {
      const searchValue = `%${query.search}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('schedule.status ILIKE :searchValue', { searchValue })
            .orWhere('schedule.frequency ILIKE :searchValue', { searchValue })
            .orWhere('schedule.maintenanceType ILIKE :searchValue', { searchValue })
            .orWhere('schedule.discipline ILIKE :searchValue', { searchValue })
            .orWhere('asset.code ILIKE :searchValue', { searchValue })
            .orWhere('asset.name ILIKE :searchValue', { searchValue })
            .orWhere('template.templateName ILIKE :searchValue', { searchValue });
        }),
      );
    }
    applyPlantScope(qb, 'schedule', 'plantId', req.auth!, query.plantId);
    if (extendedQuery.assetId) qb.andWhere('schedule.assetId = :assetId', { assetId: extendedQuery.assetId });
    if (extendedQuery.templateId) qb.andWhere('schedule.templateId = :templateId', { templateId: extendedQuery.templateId });
    if (extendedQuery.status) qb.andWhere('schedule.status = :status', { status: extendedQuery.status });
    if (!query.includeInactive) qb.andWhere("schedule.status <> 'CANCELLED'");
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('schedule.nextDue', 'ASC');

    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows.map(mapScheduleRow), 'PM schedules fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
}

async function getScheduleByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await generateDuePmTasks();
    const params = idParamSchema.parse(req.params);
    const repo = AppDataSource.getRepository(PmScheduleEntity);
    const row = await repo.findOne({
      where: { id: params.id },
      relations: {
        asset: true,
        template: true,
        assignedToUser: true,
        assignedTeam: true,
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'PM schedule not found' });
      return;
    }
    ensurePlantAccess(req, row.plantId);
    res.json(ok(mapScheduleRow(row), 'PM schedule fetched'));
  } catch (error) {
    next(error);
  }
}

async function createScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createPMScheduleSchema.parse(req.body);
    const created = await pmschedulesService.create(body, req.auth!);
    const full = await AppDataSource.getRepository(PmScheduleEntity).findOne({
      where: { id: String(created.id) },
      relations: { asset: true, template: true, assignedToUser: true, assignedTeam: true },
    });
    res.status(201).json(ok(full ? mapScheduleRow(full) : created, 'PM schedule created'));
  } catch (error) {
    next(error);
  }
}

async function updateScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const params = idParamSchema.parse(req.params);
    const body = updatePMScheduleSchema.parse(req.body);
    const updated = await pmschedulesService.update(params.id, body, req.auth!);
    const full = await AppDataSource.getRepository(PmScheduleEntity).findOne({
      where: { id: params.id },
      relations: { asset: true, template: true, assignedToUser: true, assignedTeam: true },
    });
    res.json(ok(full ? mapScheduleRow(full) : updated, 'PM schedule updated'));
  } catch (error) {
    next(error);
  }
}

async function deleteScheduleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const params = idParamSchema.parse(req.params);
    await pmschedulesService.remove(params.id, req.auth!);
    res.json(ok({ id: params.id, deleted: true }, 'PM schedule deleted'));
  } catch (error) {
    next(error);
  }
}

function mountRoutes(basePath: string) {
  const router = Router();
  router.get(basePath, requirePermission('PM_SCHEDULES', 'READ'), validateRequest({ query: pmListQuerySchema }), listSchedulesHandler);
  router.get(`${basePath}/:id`, requirePermission('PM_SCHEDULES', 'READ'), validateRequest({ params: idParamSchema }), getScheduleByIdHandler);
  router.post(basePath, requirePermission('PM_SCHEDULES', 'CREATE'), validateRequest({ body: createPMScheduleSchema }), createScheduleHandler);
  router.patch(
    `${basePath}/:id`,
    requirePermission('PM_SCHEDULES', 'UPDATE'),
    validateRequest({ params: idParamSchema, body: updatePMScheduleSchema }),
    updateScheduleHandler,
  );
  router.delete(`${basePath}/:id`, requirePermission('PM_SCHEDULES', 'DELETE'), validateRequest({ params: idParamSchema }), deleteScheduleHandler);
  return router;
}

export const pmschedulesRouter = Router();
pmschedulesRouter.use(requireAuth);
pmschedulesRouter.use(mountRoutes('/pm-schedules'));
pmschedulesRouter.use(mountRoutes('/pmschedules'));
