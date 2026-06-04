import { z } from 'zod';
import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { FailureCodeEntity } from '../../database/entities/failure-code.entity';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { validateRequest } from '../../middlewares/validate';
import { ok } from '../../utils/apiResponse';
import { approvalEngineService } from '../../services/approval-engine.service';
import { idParamSchema } from '../_core/crud.validators';
import { In } from 'typeorm';

export const failureCodesRouter = Router();
failureCodesRouter.use(requireAuth);

const failureCodeSchema = z.object({
  plantId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
  moduleId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  category: z.string().min(1),
  code: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

failureCodesRouter.get(
  '/failure-codes',
  requirePermission('MASTERS', 'READ'),
  async (req, res, next) => {
    try {
      const repo = AppDataSource.getRepository(FailureCodeEntity);
      const query = repo.createQueryBuilder('fc')
        .where('fc.isActive = true');

      if (req.query.plantId) query.andWhere('fc.plantId = :plantId', { plantId: req.query.plantId });
      if (req.query.assetId) query.andWhere('fc.assetId = :assetId', { assetId: req.query.assetId });
      if (req.query.category) query.andWhere('fc.category = :category', { category: req.query.category });

      const items = await query.getMany();
      res.json(ok(items, 'Fetched failure codes'));
    } catch (error) {
      next(error);
    }
  }
);

failureCodesRouter.post(
  '/failure-codes',
  requirePermission('MASTERS', 'UPDATE'),
  validateRequest({ body: failureCodeSchema }),
  async (req, res, next) => {
    try {
      const changeRequest = await approvalEngineService.submitChangeRequest(
        'FailureCode',
        'CREATE',
        req.body,
        null,
        req.auth!
      );
      res.json(ok(changeRequest, 'Failure code submitted for approval'));
    } catch (error) {
      next(error);
    }
  }
);

failureCodesRouter.put(
  '/failure-codes/:id',
  requirePermission('MASTERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: failureCodeSchema.partial() }),
  async (req, res, next) => {
    try {
      const changeRequest = await approvalEngineService.submitChangeRequest(
        'FailureCode',
        'UPDATE',
        req.body,
        req.params.id,
        req.auth!
      );
      res.json(ok(changeRequest, 'Failure code update submitted for approval'));
    } catch (error) {
      next(error);
    }
  }
);

failureCodesRouter.delete(
  '/failure-codes/:id',
  requirePermission('MASTERS', 'UPDATE'),
  validateRequest({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const changeRequest = await approvalEngineService.submitChangeRequest(
        'FailureCode',
        'DELETE',
        null,
        req.params.id,
        req.auth!
      );
      res.json(ok(changeRequest, 'Failure code deletion submitted for approval'));
    } catch (error) {
      next(error);
    }
  }
);
