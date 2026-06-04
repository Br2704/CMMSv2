import { AppDataSource } from '../database/data-source';
import { PendingExecutionEntity, LogEntryEntity, PmScheduleEntity, LogEntryValueEntity } from '../database/entities';
import { notificationService } from './notification.service';
import { badRequest, notFound } from '../utils/httpError';
import type { AuthContext } from '../types/auth';

export class ExecutionApprovalService {
  /**
   * Submit an execution record for Maker-Checker approval.
   */
  async submitExecution(
    executionType: string,
    payload: any,
    referenceId: string | null,
    auth: AuthContext
  ) {
    const repo = AppDataSource.getRepository(PendingExecutionEntity);
    const request = repo.create({
      executionType,
      payload,
      referenceId,
      status: 'PENDING_L1',
      submittedBy: auth.userId,
    });
    await repo.save(request);

    await notificationService.notifyRole(
      'MAINTENANCE_MANAGER',
      'Execution Approval Required',
      `A ${executionType} requires your L1 approval.`,
      'EXECUTION_APPROVAL_PENDING',
      request.id
    );

    return request;
  }

  /**
   * Approve an execution record (L1 or L2)
   */
  async approveExecution(requestId: string, auth: AuthContext, comments?: string) {
    const repo = AppDataSource.getRepository(PendingExecutionEntity);
    const request = await repo.findOne({ where: { id: requestId } });

    if (!request) {
      notFound('Pending execution not found');
    }

    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      badRequest('Execution request is already finalized');
    }

    if (request.status === 'PENDING_L1') {
      request.status = 'PENDING_L2';
      request.level1Approver = auth.userId;
      request.level1ApprovedAt = new Date();
      if (comments) request.comments = (request.comments ? request.comments + '\n' : '') + `L1 [Approved]: ${comments}`;
      await repo.save(request);

      await notificationService.notifyRole(
        'PRODUCTION_MANAGER',
        'Execution Escalated',
        `A ${request.executionType} requires L2 approval.`,
        'EXECUTION_APPROVAL_PENDING',
        request.id
      );
      
      await notificationService.notifyUser(
        request.submittedBy,
        'Execution Progressed',
        `Your ${request.executionType} was approved at Level 1.`,
        'EXECUTION_APPROVAL_PROGRESS',
        request.id
      );
    } else if (request.status === 'PENDING_L2') {
      request.status = 'APPROVED';
      request.level2Approver = auth.userId;
      request.level2ApprovedAt = new Date();
      if (comments) request.comments = (request.comments ? request.comments + '\n' : '') + `L2 [Approved]: ${comments}`;
      
      // Execute the payload upon final approval
      await this.commitExecution(request, auth);
      await repo.save(request);

      await notificationService.notifyUser(
        request.submittedBy,
        'Execution Approved',
        `Your ${request.executionType} was fully approved.`,
        'EXECUTION_APPROVAL_COMPLETED',
        request.id
      );
    }

    return request;
  }

  /**
   * Reject an execution record
   */
  async rejectExecution(requestId: string, auth: AuthContext, comments: string) {
    const repo = AppDataSource.getRepository(PendingExecutionEntity);
    const request = await repo.findOne({ where: { id: requestId } });

    if (!request) {
      notFound('Pending execution not found');
    }

    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      badRequest('Execution request is already finalized');
    }

    const level = request.status === 'PENDING_L1' ? 'L1' : 'L2';
    request.status = 'REJECTED';
    request.comments = (request.comments ? request.comments + '\n' : '') + `${level} [Rejected]: ${comments}`;

    if (level === 'L1') {
      request.level1Approver = auth.userId;
      request.level1ApprovedAt = new Date();
    } else {
      request.level2Approver = auth.userId;
      request.level2ApprovedAt = new Date();
    }

    // If PM Schedule, revert the status back to SCHEDULED
    if (request.executionType === 'PM_EXECUTION' || request.executionType === 'PD_EXECUTION') {
        if (request.referenceId) {
            const pmRepo = AppDataSource.getRepository(PmScheduleEntity);
            const pm = await pmRepo.findOneBy({ id: request.referenceId });
            if (pm && pm.status === 'PENDING_APPROVAL') {
                pm.status = 'SCHEDULED';
                await pmRepo.save(pm);
            }
        }
    }

    await repo.save(request);

    await notificationService.notifyUser(
      request.submittedBy,
      'Execution Rejected',
      `Your ${request.executionType} was rejected by ${level}.`,
      'EXECUTION_APPROVAL_REJECTED',
      request.id
    );

    return request;
  }

  /**
   * Commit the execution into production tables
   */
  private async commitExecution(request: PendingExecutionEntity, auth: AuthContext) {
    return AppDataSource.transaction(async (manager) => {
      if (request.executionType === 'LOG_ENTRY') {
        const repo = manager.getRepository(LogEntryEntity);
        const valueRepo = manager.getRepository(LogEntryValueEntity);
        if (request.referenceId) {
          const entity = await repo.findOneBy({ id: request.referenceId });
          if (entity) {
            Object.assign(entity, request.payload);
            await repo.save(entity);
            // Handle updates to values if necessary (not implementing full diffing here, usually values are append-only or handled separately)
          }
        } else {
          const created = repo.create(request.payload);
          await repo.save(created);
          request.referenceId = (created as any).id;
          
          if (request.payload.values && Array.isArray(request.payload.values) && request.payload.values.length > 0) {
            const rows = request.payload.values.map((v: any) => valueRepo.create({
              entryId: (created as any).id,
              fieldId: v.fieldId,
              value: v.value ?? null
            }));
            await valueRepo.save(rows);
          }
        }
      } else if (request.executionType === 'PM_EXECUTION' || request.executionType === 'PD_EXECUTION') {
        if (request.referenceId) {
          const repo = manager.getRepository(PmScheduleEntity);
          const entity = await repo.findOneBy({ id: request.referenceId });
          if (entity) {
            // Apply the payload modifications (like usage inputs, completion notes)
            Object.assign(entity, request.payload);
            entity.status = 'COMPLETED';
            if (!entity.completedAt) {
                entity.completedAt = new Date();
            }
            await repo.save(entity);
          }
        }
      }
    });
  }
}

export const executionApprovalService = new ExecutionApprovalService();
