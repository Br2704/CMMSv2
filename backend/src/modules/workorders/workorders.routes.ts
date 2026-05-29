import { z } from 'zod';
import { Router } from 'express';
import { createCrudRouter } from '../_core/crud.routes';
import { idParamSchema, listQuerySchema } from '../_core/crud.validators';
import { AppDataSource } from '../../database/data-source';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { validateRequest } from '../../middlewares/validate';
import { authorizePermission } from '../../utils/authorization';
import { ok } from '../../utils/apiResponse';
import { toPagination } from '../../utils/pagination';
import { fail } from '../../utils/apiResponse';
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
  acceptWorkOrderSchema,
  workOrderActivitySchema,
  bulkUpdateSchema,
  verifyWorkOrderSchema,
  handoverWorkOrderSchema,
  acknowledgeHandoverSchema,
  holdWorkOrderSchema,
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
  '/work-orders/:id/accept',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: acceptWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.acceptWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order accepted'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/activity',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: workOrderActivitySchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.addActivity(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order activity recorded'));
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

workordersRouter.post(
  '/work-orders/:id/hold',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: holdWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.holdWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order placed on hold'));
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

async function requireApprovalOrRaiser(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (!req.auth) {
    res.status(401).json(fail('Unauthorized'));
    return;
  }
  const decision = authorizePermission(req.auth, 'WORK_ORDERS', 'APPROVE');
  if (decision.allowed) {
    next();
    return;
  }
  try {
    const existing = await AppDataSource.manager
      .createQueryBuilder()
      .select('raised_by')
      .from('work_orders', 't')
      .where('t.id = :id', { id: req.params.id })
      .getRawOne<{ raised_by: string | null }>();
    if (existing && existing.raised_by === req.auth.userId) {
      next();
      return;
    }
  } catch {}
  res.status(403).json(fail('Access denied. You do not have permission to view this resource.'));
}

workordersRouter.post(
  '/work-orders/:id/approve',
  requireApprovalOrRaiser,
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
  '/work-orders/bulk-update',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ body: bulkUpdateSchema }),
  async (req, res, next) => {
    try {
      const { ids, ...payload } = req.body as { ids: string[]; [key: string]: unknown };
      const result = await workordersService.bulkUpdate(ids, payload as Record<string, unknown>, req.auth!);
      res.json(ok(result, 'Bulk update completed'));
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.get(
  '/work-orders/export',
  requirePermission('WORK_ORDERS', 'READ'),
  validateRequest({ query: workOrdersListQuerySchema }),
  async (req, res, next) => {
    try {
      const csv = await workordersService.exportCSV(req.query as unknown as ListQuery, req.auth!);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="work-orders-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (error) {
      next(error);
    }
  },
);

workordersRouter.post(
  '/work-orders/:id/reject',
  requireApprovalOrRaiser,
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

workordersRouter.post(
  '/work-orders/:id/verify',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: verifyWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.verifyWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order verification processed'));
    } catch (error) {
      next(error);
    }
  }
);

workordersRouter.post(
  '/work-orders/:id/handover',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: handoverWorkOrderSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.handoverWorkOrder(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order handed over'));
    } catch (error) {
      next(error);
    }
  }
);

workordersRouter.post(
  '/work-orders/:id/handover/acknowledge',
  requirePermission('WORK_ORDERS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: acknowledgeHandoverSchema }),
  async (req, res, next) => {
    try {
      const record = await workordersService.acknowledgeHandover(req.params.id, req.body as Record<string, unknown>, req.auth!);
      res.json(ok(record, 'Work order handover acknowledged'));
    } catch (error) {
      next(error);
    }
  }
);


