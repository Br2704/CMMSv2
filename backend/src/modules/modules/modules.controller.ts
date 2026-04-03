import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { modulesService } from './modules.service';

export const modulesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await modulesService.list(req.query as never, req.auth!);
    res.status(200).json(result);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const result = await modulesService.create(req.body, req.auth!);
    res.status(201).json(result);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const result = await modulesService.update(req.params.id, req.body, req.auth!);
    res.status(200).json(result);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await modulesService.remove(req.params.id, req.auth!);
    res.status(200).json(result);
  }),
};
