import { QueueScheduler, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { AppDataSource } from '../database/data-source';
import { BackupHistoryEntity } from '../database/entities/BackupHistoryEntity';
import { BackupAuditLogEntity } from '../database/entities/BackupAuditLogEntity';
import { unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { logger } from '../config/logger';

const connection = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : new Redis();
const BACKUPS_DIR = resolve(process.cwd(), 'backups');

function isSafeBackupPath(filePath: string): boolean {
  const resolved = resolve(filePath);
  return resolved.startsWith(BACKUPS_DIR + sep) || resolved === BACKUPS_DIR;
}

// Ensure a scheduler is running for delayed jobs and retries
const scheduler = new QueueScheduler('backup-delete', { connection });

const worker = new Worker(
  'backup-delete',
  async (job: Job) => {
    const payload = job.data as any;
    const { scope, organizationId, plantId, requestedBy } = payload;

    if (!['ALL', 'ORGANIZATION', 'PLANT'].includes(scope)) {
      throw new Error(`Invalid delete scope: ${scope}`);
    }

    if (scope === 'ORGANIZATION' && !organizationId) {
      throw new Error('organizationId is required for ORGANIZATION scope');
    }

    if (scope === 'PLANT' && !plantId) {
      throw new Error('plantId is required for PLANT scope');
    }

    const auditRepo = AppDataSource.getRepository(BackupAuditLogEntity);
    const backupRepo = AppDataSource.getRepository(BackupHistoryEntity);

    logger.info({ jobId: job.id, userId: requestedBy, scope }, 'Worker started backup delete job');

    try {
      let backupsToDelete: BackupHistoryEntity[] = [];
      if (scope === 'ALL') {
        backupsToDelete = await backupRepo.find();
      } else if (scope === 'ORGANIZATION') {
        backupsToDelete = await backupRepo.find({ where: { organizationId } });
      } else if (scope === 'PLANT') {
        backupsToDelete = await backupRepo.find({ where: { plantId } });
      }

      const total = backupsToDelete.length;
      let processed = 0;

      for (const b of backupsToDelete) {
        try {
          if (b.storagePath && isSafeBackupPath(b.storagePath)) {
            try { await unlink(b.storagePath); } catch (e) { logger.warn({ err: e, path: b.storagePath }, 'Failed to unlink backup file (may not exist)'); }
          } else if (b.storagePath) {
            logger.warn({ path: b.storagePath, backupId: b.id }, 'Skipping unsafe backup path outside backups dir');
          }
          await backupRepo.delete({ id: b.id });
          processed += 1;
          const progress = Math.floor((processed / Math.max(1, total)) * 100);
          // update job progress and (optionally) other indicators
          await job.updateProgress(progress);
        } catch (inner) {
          logger.error({ err: inner, backupId: b.id }, 'Failed to delete backup record or file');
        }
      }

      await auditRepo.save(auditRepo.create({ action: 'DELETE', status: 'SUCCESS', userId: requestedBy, backupId: null, details: `Deleted ${processed} backup(s) for scope=${scope}` }));
      return { deleted: processed };
    } catch (err: any) {
      await auditRepo.save(auditRepo.create({ action: 'DELETE', status: 'FAILED', userId: requestedBy, backupId: null, details: String(err?.message ?? err) }));
      logger.error({ err }, 'Backup delete worker failed');
      throw err;
    }
  },
  { connection },
);

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Backup delete job completed'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Backup delete job failed'));

process.on('SIGINT', async () => {
  await worker.close();
  await scheduler.close();
  process.exit(0);
});
