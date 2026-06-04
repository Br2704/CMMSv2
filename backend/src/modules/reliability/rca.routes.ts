import { z } from 'zod';
import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { RcaEntity } from '../../database/entities/rca.entity';
import { WorkOrderEntity } from '../../database/entities/work-order.entity';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { validateRequest } from '../../middlewares/validate';
import { ok, fail } from '../../utils/apiResponse';
import { idParamSchema, listQuerySchema } from '../_core/crud.validators';
import { toPagination, type ListQuery } from '../../utils/pagination';

export const rcaRouter = Router();
rcaRouter.use(requireAuth);

const rcaSubmitSchema = z.object({
  woId: z.string().uuid(),
  assetId: z.string().uuid(),
  problemStatement: z.string().min(1),
  why1: z.string().min(1),
  why2: z.string().nullable().optional(),
  why3: z.string().nullable().optional(),
  why4: z.string().nullable().optional(),
  why5: z.string().nullable().optional(),
  rootCause: z.string().min(1),
  correctiveAction: z.string().min(1),
  preventiveAction: z.string().min(1),
  evidenceUrls: z.array(z.string().url()).nullable().optional(),
});

rcaRouter.get(
  '/rcas',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const repo = AppDataSource.getRepository(RcaEntity);
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 50) || 50;

      const query = repo.createQueryBuilder('rca')
        .leftJoinAndSelect('rca.workOrder', 'wo')
        .leftJoinAndSelect('rca.asset', 'asset')
        .leftJoinAndSelect('rca.submitter', 'submitter')
        .orderBy('rca.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await query.getManyAndCount();
      res.json(ok(items, 'Fetched RCAs', toPagination(page, limit, total)));
    } catch (error) {
      next(error);
    }
  }
);

rcaRouter.post(
  '/rcas',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ body: rcaSubmitSchema }),
  async (req, res, next) => {
    try {
      const repo = AppDataSource.getRepository(RcaEntity);
      const woRepo = AppDataSource.getRepository(WorkOrderEntity);

      const wo = await woRepo.findOneBy({ id: req.body.woId });
      if (!wo) return res.status(404).json(fail('Work order not found'));

      const rca = repo.create({
        ...req.body,
        status: 'PENDING_APPROVAL',
        submittedBy: req.auth!.userId,
      });

      await repo.save(rca);

      res.json(ok(rca, 'RCA submitted for approval'));
    } catch (error) {
      next(error);
    }
  }
);

const rcaApproveSchema = z.object({
  comments: z.string().nullable().optional(),
  status: z.enum(['APPROVED', 'REJECTED'])
});

rcaRouter.post(
  '/rcas/:id/review',
  requirePermission('WORK_ORDERS', 'APPROVE'),
  validateRequest({ params: idParamSchema, body: rcaApproveSchema }),
  async (req, res, next) => {
    try {
      const repo = AppDataSource.getRepository(RcaEntity);
      const rca = await repo.findOneBy({ id: req.params.id });
      if (!rca) return res.status(404).json(fail('RCA not found'));

      if (rca.status !== 'PENDING_APPROVAL') {
        return res.status(400).json(fail('RCA is not pending approval'));
      }

      rca.status = req.body.status;
      rca.approvedBy = req.auth!.userId;
      rca.approvalComments = req.body.comments;

      await repo.save(rca);

      res.json(ok(rca, `RCA ${req.body.status.toLowerCase()} successfully`));
    } catch (error) {
      next(error);
    }
  }
);
