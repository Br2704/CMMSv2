import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { toPagination } from '../../utils/pagination';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import type { CrudLikeService } from './crud.types';

function toCamelKey(input: string) {
  return input.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toCamelCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).map(([key, item]) => [toCamelKey(key), toCamelCase(item)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function createCrudController(service: CrudLikeService, moduleName = 'resource') {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(req.query as never, req.auth!);
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 100) || 100;
      res.status(200).json(ok(toCamelCase(result.items), 'Fetched successfully', toPagination(page, limit, result.total)));
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.getById(req.params.id, req.auth!);
      res.status(200).json(ok(toCamelCase(data)));
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.create(req.body, req.auth!);
      await audit(`${moduleName}.create`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        actorRoles: req.auth?.roles ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: typeof data.id === 'string' ? data.id : null,
        plantId: typeof (data.plant_id ?? data.plantId) === 'string' ? String(data.plant_id ?? data.plantId) : null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        statusCode: 201,
      });
      res.status(201).json(ok(toCamelCase(data), 'Created successfully'));
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.update(req.params.id, req.body, req.auth!);
      await audit(`${moduleName}.update`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        actorRoles: req.auth?.roles ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: req.params.id,
        plantId: typeof (data.plant_id ?? data.plantId) === 'string' ? String(data.plant_id ?? data.plantId) : null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        statusCode: 200,
      });
      res.status(200).json(ok(toCamelCase(data), 'Updated successfully'));
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      await service.remove(req.params.id, req.auth!);
      await audit(`${moduleName}.delete`, {
        module: moduleName.toUpperCase(),
        actorUserId: req.auth?.userId ?? null,
        actorRoles: req.auth?.roles ?? null,
        method: req.method,
        path: req.originalUrl,
        entityId: req.params.id,
        plantId: null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        statusCode: 200,
      });
      res.status(200).json(ok({ id: req.params.id, deleted: true }, 'Deleted successfully'));
    }),
  };
}
