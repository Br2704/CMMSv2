import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { toPagination } from '../../utils/pagination';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { CrudService } from './crud.service';

export function createCrudController(service: CrudService, moduleName = 'resource') {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(req.query as never, req.auth!);
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 100) || 100;
      res.status(200).json(ok(result.items, 'Fetched successfully', toPagination(page, limit, result.total)));
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.getById(req.params.id, req.auth!);
      res.status(200).json(ok(data));
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.create(req.body, req.auth!);
      await audit(`${moduleName}.create`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: typeof data.id === 'string' ? data.id : null,
        plantId: typeof (data.plant_id ?? data.plantId) === 'string' ? String(data.plant_id ?? data.plantId) : null,
        statusCode: 201,
      });
      res.status(201).json(ok(data, 'Created successfully'));
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.update(req.params.id, req.body, req.auth!);
      await audit(`${moduleName}.update`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: req.params.id,
        plantId: typeof (data.plant_id ?? data.plantId) === 'string' ? String(data.plant_id ?? data.plantId) : null,
        statusCode: 200,
      });
      res.status(200).json(ok(data, 'Updated successfully'));
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      await service.remove(req.params.id, req.auth!);
      await audit(`${moduleName}.delete`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: req.params.id,
        statusCode: 200,
      });
      res.status(200).json(ok({ id: req.params.id, deleted: true }, 'Deleted successfully'));
    }),
  };
}
