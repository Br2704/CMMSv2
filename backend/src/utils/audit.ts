import { logger } from '../config/logger';
import { AppDataSource } from '../database/data-source';
import { AuditLogEntity } from '../database/entities';

export async function audit(event: string, payload: Record<string, unknown>) {
  logger.info({ auditEvent: event, ...payload }, 'AUDIT');

  if (process.env.NODE_ENV === 'test' || !AppDataSource.isInitialized) {
    return;
  }

  try {
    const repo = AppDataSource.getRepository(AuditLogEntity);
    const record = repo.create({
      action: event,
      module: typeof payload.module === 'string' ? payload.module : null,
      entityName: typeof payload.entityName === 'string' ? payload.entityName : null,
      entityId: typeof payload.entityId === 'string' ? payload.entityId : null,
      userId: typeof payload.userId === 'string' ? payload.userId : typeof payload.actorUserId === 'string' ? payload.actorUserId : null,
      method: typeof payload.method === 'string' ? payload.method : null,
      path: typeof payload.path === 'string' ? payload.path : null,
      plantId: typeof payload.plantId === 'string' ? payload.plantId : null,
      statusCode: typeof payload.statusCode === 'number' ? payload.statusCode : null,
      ipAddress: typeof payload.ipAddress === 'string' ? payload.ipAddress : null,
      userAgent: typeof payload.userAgent === 'string' ? payload.userAgent : null,
      metadata: payload,
    });
    await repo.save(record);
  } catch (error) {
    logger.error({ error }, 'Failed to persist audit log');
  }
}
