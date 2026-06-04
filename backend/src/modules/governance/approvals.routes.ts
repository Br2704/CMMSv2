import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { ChangeRequestEntity, RecordRevisionEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { parseListQuery, buildPagination } from '../../utils/pagination';
import { approvalEngineService } from '../../services/approval-engine.service';
import { badRequest } from '../../utils/httpError';

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

const listApprovalsQuerySchema = z.object({
  status: z.string().optional(),
  moduleType: z.string().optional(),
});

// List pending or historical change requests
approvalsRouter.get('/governance/approvals', async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = listApprovalsQuerySchema.parse(req.query);

    const repo = AppDataSource.getRepository(ChangeRequestEntity);
    const qb = repo.createQueryBuilder('cr')
      .leftJoinAndSelect('cr.submitter', 'submitter')
      .leftJoinAndSelect('cr.approverL1', 'approverL1')
      .leftJoinAndSelect('cr.approverL2', 'approverL2');

    if (filters.status) {
      qb.andWhere('cr.status = :status', { status: filters.status });
    }
    if (filters.moduleType) {
      qb.andWhere('cr.moduleType = :moduleType', { moduleType: filters.moduleType });
    }

    if (query.search) {
      qb.andWhere('cr.moduleType ILIKE :search', { search: `%${query.search}%` });
    }

    qb.orderBy('cr.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();

    const data = rows.map(r => ({
      id: r.id,
      moduleType: r.moduleType,
      actionType: r.actionType,
      referenceId: r.referenceId,
      payload: r.payload,
      status: r.status,
      comments: r.comments,
      submittedBy: {
        id: r.submitter?.id,
        fullName: r.submitter?.fullName,
      },
      level1Approver: r.approverL1 ? {
        id: r.approverL1.id,
        fullName: r.approverL1.fullName,
      } : null,
      level2Approver: r.approverL2 ? {
        id: r.approverL2.id,
        fullName: r.approverL2.fullName,
      } : null,
      level1ApprovedAt: r.level1ApprovedAt,
      level2ApprovedAt: r.level2ApprovedAt,
      createdAt: r.createdAt,
    }));

    res.json(ok(data, 'Approvals fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

// Approve a change request
approvalsRouter.post('/governance/approvals/:id/approve', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { comments } = z.object({ comments: z.string().optional() }).parse(req.body);
    
    const request = await approvalEngineService.approveChangeRequest(id, req.auth!, comments);
    res.json(ok(request, 'Change request approved'));
  } catch (error) {
    next(error);
  }
});

// Reject a change request
approvalsRouter.post('/governance/approvals/:id/reject', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { comments } = z.object({ comments: z.string() }).parse(req.body);

    const request = await approvalEngineService.rejectChangeRequest(id, req.auth!, comments);
    res.json(ok(request, 'Change request rejected'));
  } catch (error) {
    next(error);
  }
});

// List Revisions for a given record
approvalsRouter.get('/governance/revisions/:moduleType/:referenceId', async (req, res, next) => {
  try {
    const { moduleType, referenceId } = z.object({
      moduleType: z.string(),
      referenceId: z.string().uuid(),
    }).parse(req.params);

    const repo = AppDataSource.getRepository(RecordRevisionEntity);
    const revisions = await repo.find({
      where: { moduleType, referenceId },
      relations: ['changedByUser'],
      order: { versionNumber: 'DESC' },
    });

    const data = revisions.map(r => ({
      id: r.id,
      moduleType: r.moduleType,
      referenceId: r.referenceId,
      versionNumber: r.versionNumber,
      payload: r.payload,
      changedBy: r.changedByUser ? {
        id: r.changedByUser.id,
        fullName: r.changedByUser.fullName,
      } : null,
      createdAt: r.createdAt,
    }));

    res.json(ok(data, 'Revisions fetched'));
  } catch (error) {
    next(error);
  }
});

// Rollback to a specific revision
approvalsRouter.post('/governance/revisions/:id/rollback', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(RecordRevisionEntity);
    
    const revision = await repo.findOne({ where: { id } });
    if (!revision) {
      throw badRequest('Revision not found');
    }

    // Submit the old payload as an UPDATE change request
    const request = await approvalEngineService.submitChangeRequest(
      revision.moduleType,
      'UPDATE',
      revision.payload,
      revision.referenceId,
      req.auth!
    );

    res.json(ok(request, 'Rollback change request submitted'));
  } catch (error) {
    next(error);
  }
});
