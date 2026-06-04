import { AppDataSource } from '../database/data-source';
import { ChangeRequestEntity, RecordRevisionEntity, UserEntity, PmTemplateEntity, LogTemplateEntity, CalibrationTemplateEntity, FailureCodeEntity } from '../database/entities';
import { badRequest, notFound, forbidden } from '../utils/httpError';
import type { AuthContext } from '../types/auth';
import { notificationService } from './notification.service';

export class ApprovalEngineService {
  /**
   * Submit a new change request for approval.
   */
  async submitChangeRequest(
    moduleType: string,
    actionType: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: any,
    referenceId: string | null,
    auth: AuthContext
  ) {
    // If actionType is UPDATE or DELETE, referenceId is mandatory
    if ((actionType === 'UPDATE' || actionType === 'DELETE') && !referenceId) {
      badRequest('Reference ID is required for UPDATE or DELETE actions');
    }

    const repo = AppDataSource.getRepository(ChangeRequestEntity);
    const request = repo.create({
      moduleType,
      actionType,
      payload,
      referenceId,
      status: 'PENDING_L1',
      submittedBy: auth.userId,
    });
    await repo.save(request);

    await notificationService.notifyRole(
      'MAINTENANCE_MANAGER',
      'New Change Request',
      `A new ${moduleType} request requires your approval.`,
      'APPROVAL_PENDING',
      request.id
    );

    return request;
  }

  /**
   * Approve a change request.
   */
  async approveChangeRequest(requestId: string, auth: AuthContext, comments?: string) {
    const repo = AppDataSource.getRepository(ChangeRequestEntity);
    const request = await repo.findOne({ where: { id: requestId } });

    if (!request) {
      notFound('Change request not found');
    }

    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      badRequest('Change request is already finalized');
    }

    // Role verification would typically happen at the route level, but we can verify status progression here.
    if (request.status === 'PENDING_L1') {
      request.status = 'PENDING_L2';
      request.level1Approver = auth.userId;
      request.level1ApprovedAt = new Date();
      if (comments) request.comments = (request.comments ? request.comments + '\n' : '') + `L1 [Approved]: ${comments}`;
      
      await notificationService.notifyRole(
        'PRODUCTION_MANAGER',
        'Request Escalated',
        `A ${request.moduleType} request requires L2 approval.`,
        'APPROVAL_PENDING',
        request.id
      );
    } else if (request.status === 'PENDING_L2') {
      request.status = 'APPROVED';
      request.level2Approver = auth.userId;
      request.level2ApprovedAt = new Date();
      if (comments) request.comments = (request.comments ? request.comments + '\n' : '') + `L2 [Approved]: ${comments}`;
      
      // Execute the payload upon final approval
      await this.executeApprovedChange(request, auth);

      await notificationService.notifyUser(
        request.submittedBy,
        'Request Approved',
        `Your change request for ${request.moduleType} was fully approved.`,
        'APPROVAL_COMPLETED',
        request.id
      );
    }

    await repo.save(request);
    return request;
  }

  /**
   * Reject a change request.
   */
  async rejectChangeRequest(requestId: string, auth: AuthContext, comments: string) {
    const repo = AppDataSource.getRepository(ChangeRequestEntity);
    const request = await repo.findOne({ where: { id: requestId } });

    if (!request) {
      notFound('Change request not found');
    }

    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      badRequest('Change request is already finalized');
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

    await repo.save(request);

    await notificationService.notifyUser(
      request.submittedBy,
      'Request Rejected',
      `Your change request for ${request.moduleType} was rejected by ${level}.`,
      'APPROVAL_REJECTED',
      request.id
    );

    return request;
  }

  /**
   * Execute the payload into the actual entities
   */
  private async executeApprovedChange(request: ChangeRequestEntity, auth: AuthContext) {
    return AppDataSource.transaction(async (manager) => {
      let currentVersionNumber = 1;
      let finalReferenceId = request.referenceId;
      const revisionRepo = manager.getRepository(RecordRevisionEntity);

      if (request.moduleType === 'PM_TEMPLATE' || request.moduleType === 'PD_TEMPLATE') {
        const repo = manager.getRepository(PmTemplateEntity);
        if (request.actionType === 'CREATE') {
          const created = repo.create({ ...request.payload, versionNumber: 1 });
          await repo.save(created);
          finalReferenceId = (created as any).id;
        } else if (request.actionType === 'UPDATE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = entity.versionNumber + 1;
            Object.assign(entity, request.payload);
            entity.versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        } else if (request.actionType === 'DELETE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = entity.versionNumber + 1;
            entity.isActive = false;
            entity.versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        }
      } else if (request.moduleType === 'CALIBRATION_TEMPLATE') {
        const repo = manager.getRepository(CalibrationTemplateEntity);
        if (request.actionType === 'CREATE') {
          const created = repo.create({ ...request.payload, versionNumber: 1 });
          await repo.save(created);
          finalReferenceId = (created as any).id;
        } else if (request.actionType === 'UPDATE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = (entity as any).versionNumber ? (entity as any).versionNumber + 1 : 2;
            Object.assign(entity, request.payload);
            (entity as any).versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        } else if (request.actionType === 'DELETE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = (entity as any).versionNumber ? (entity as any).versionNumber + 1 : 2;
            entity.isActive = false;
            (entity as any).versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        }
      } else if (request.moduleType === 'LOG_TEMPLATE') {
        const repo = manager.getRepository(LogTemplateEntity);
        if (request.actionType === 'CREATE') {
          const created = repo.create({ ...request.payload, versionNumber: 1 });
          await repo.save(created);
          finalReferenceId = (created as any).id;
        } else if (request.actionType === 'UPDATE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = entity.versionNumber + 1;
            Object.assign(entity, request.payload);
            entity.versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        } else if (request.actionType === 'DELETE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            currentVersionNumber = entity.versionNumber + 1;
            entity.isActive = false;
            entity.versionNumber = currentVersionNumber;
            await repo.save(entity);
          }
        }
      } else if (request.moduleType === 'FailureCode') {
        const repo = manager.getRepository(FailureCodeEntity);
        if (request.actionType === 'CREATE') {
          const created = repo.create({ ...request.payload });
          await repo.save(created);
          finalReferenceId = (created as any).id;
        } else if (request.actionType === 'UPDATE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            Object.assign(entity, request.payload);
            await repo.save(entity);
          }
        } else if (request.actionType === 'DELETE') {
          const entity = await repo.findOneBy({ id: request.referenceId! });
          if (entity) {
            (entity as any).isActive = false; // Note: if FailureCode doesn't have isActive, you'd use softRemove instead
            await repo.softRemove(entity);
          }
        }
      }

      // If CREATE, update the referenceId of the original request
      if (request.actionType === 'CREATE' && finalReferenceId) {
        request.referenceId = finalReferenceId;
      }

      // Save a revision
      if (finalReferenceId) {
        const revision = revisionRepo.create({
          moduleType: request.moduleType,
          referenceId: finalReferenceId,
          versionNumber: currentVersionNumber,
          payload: request.payload,
          changedBy: auth.userId,
          changeRequestId: request.id,
        });
        await revisionRepo.save(revision);
      }
    });
  }
}

export const approvalEngineService = new ApprovalEngineService();
