import { Router } from 'express';
import { createCrudRouter } from '../_core/crud.routes';
import { idParamSchema, listQuerySchema } from '../_core/crud.validators';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { ok } from '../../utils/apiResponse';
import { toPagination } from '../../utils/pagination';
import type { ListQuery } from '../../utils/pagination';
import { workordersService } from './workorders.service';
import {
  createWorkOrderSchema,
  reviewWorkOrderSchema,
  startWorkOrderSchema,
  submitWorkOrderForApprovalSchema,
  triageWorkOrderSchema,
  updateWorkOrderSchema,
  workOrdersListQuerySchema,
  workOrdersSummaryQuerySchema,
} from './workorders.validators';

const crudRouter = createCrudRouter(
  {
    moduleName: 'workorders',
    moduleId: 'WORK_ORDERS',
    basePath: '/api/work-orders',
    tableName: 'work_orders',
    plantColumn: 'plant_id',
  },
  workordersService,
  {
    createSchema: createWorkOrderSchema,
    updateSchema: updateWorkOrderSchema,
  },
);

export const workordersRouter = Router();
workordersRouter.use(requireAuth);

workordersRouter.get(
  '/work-orders',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ query: workOrdersListQuerySchema }),
  async (req, res, next) => {
    try {
      const result = await workordersService.list(req.query as unknown as ListQuery, req.auth!);
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 100) || 100;
      res.json(ok(result.items, 'Fetched work orders', toPagination(page, limit, result.total)));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.get(
  '/work-orders/summary',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ query: workOrdersSummaryQuerySchema }),
  async (req, res, next) => {
    try {
      const summary = await workordersService.getQueueSummary(req.query as unknown as ListQuery, req.auth!);
      res.json(ok(summary, 'Fetched work order queue summary'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.get(
  '/work-orders/:id/activity',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ params: idParamSchema, query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const result = await workordersService.getActivityTimeline(req.params.id, req.query as unknown as ListQuery, req.auth!);
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 50) || 50;
      res.json(ok(result.items, 'Fetched work order activity timeline', toPagination(page, limit, result.total)));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/triage',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: triageWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.triageWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order triaged'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/start',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: startWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.startWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order started'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.use(crudRouter);

workordersRouter.post(
  '/work-orders/:id/submit-for-approval',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: submitWorkOrderForApprovalSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.submitForApproval(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order completed and sent for user verification'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/approve',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ params: idParamSchema, body: reviewWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.approveWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order closed'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/reject',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ params: idParamSchema, body: reviewWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.rejectWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order reopened'));
    } catch (error) {
      next(error);
    }
  },
);
