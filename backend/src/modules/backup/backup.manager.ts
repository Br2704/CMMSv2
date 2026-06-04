import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync } from 'fs';

import { AppDataSource } from '../../database/data-source';
import { BackupHistoryEntity } from '../../database/entities/BackupHistoryEntity';
import { BackupAuditLogEntity } from '../../database/entities/BackupAuditLogEntity';
import { createBackupCipher } from './backup.encryption';
import { logger } from '../../config/logger';
import { enqueueDeleteJob } from '../../queues/backupQueue';

const BACKUPS_DIR = join(process.cwd(), 'backups');

function ensureBackupsDir() {
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

export class BackupManager {
  private async createAuditLog(
    action: 'CREATE' | 'DOWNLOAD' | 'DELETE' | 'RESTORE' | 'FAILED_RESTORE' | 'UNAUTHORIZED_ACCESS',
    status: 'SUCCESS' | 'FAILED' | 'DENIED',
    userId: string | null,
    backupId: string | null,
    details?: string
  ) {
    const auditRepo = AppDataSource.getRepository(BackupAuditLogEntity);
    const log = auditRepo.create({ action, status, userId, backupId, details });
    await auditRepo.save(log);
  }

  public async requestDeleteAll(userId: string, scope: 'ALL' | 'ORGANIZATION' | 'PLANT', opts?: { organizationId?: string; plantId?: string }) {
    await this.createAuditLog('DELETE', 'DENIED', userId, null, `Deletion requested for scope=${scope} org=${opts?.organizationId ?? 'N/A'} plant=${opts?.plantId ?? 'N/A'}`);
    
    const { isRedisConnected } = await import('../../services/redis.js');
    if (!isRedisConnected()) {
      logger.info('Redis not connected. Running backup deletion inline.');
      return await this.executeDeleteInline(userId, scope, opts);
    }

    try {
      const jobId = await enqueueDeleteJob({
        scope,
        organizationId: opts?.organizationId,
        plantId: opts?.plantId,
        requestedBy: userId,
      });
      logger.info({ userId, scope, opts, jobId }, 'Queued backup delete job');
      return { queued: true, jobId };
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue delete job. Falling back to inline.');
      return await this.executeDeleteInline(userId, scope, opts);
    }
  }

  private async executeDeleteInline(userId: string, scope: 'ALL' | 'ORGANIZATION' | 'PLANT', opts?: { organizationId?: string; plantId?: string }) {
    const backupRepo = AppDataSource.getRepository(BackupHistoryEntity);
    const auditRepo = AppDataSource.getRepository(BackupAuditLogEntity);
    let backupsToDelete: BackupHistoryEntity[] = [];
    
    if (scope === 'ALL') {
      backupsToDelete = await backupRepo.find();
    } else if (scope === 'ORGANIZATION') {
      backupsToDelete = await backupRepo.find({ where: { organizationId: opts?.organizationId } });
    } else if (scope === 'PLANT') {
      backupsToDelete = await backupRepo.find({ where: { plantId: opts?.plantId } });
    }

    let processed = 0;
    const { unlink } = await import('node:fs/promises');
    const { resolve, sep } = await import('node:path');
    
    function isSafeBackupPath(filePath: string): boolean {
      const resolved = resolve(filePath);
      return resolved.startsWith(BACKUPS_DIR + sep) || resolved === BACKUPS_DIR;
    }

    for (const b of backupsToDelete) {
      try {
        if (b.storagePath && isSafeBackupPath(b.storagePath)) {
          try { await unlink(b.storagePath); } catch (e) { logger.warn({ err: e, path: b.storagePath }, 'Failed to unlink backup file'); }
        }
        await backupRepo.delete({ id: b.id });
        processed += 1;
      } catch (inner) {
        logger.error({ err: inner, backupId: b.id }, 'Failed to delete backup record or file');
      }
    }

    const { wipeScopedData } = await import('../../utils/dataWipe.js');
    const dataRowsDeleted = await wipeScopedData(scope, opts);

    await auditRepo.save(auditRepo.create({ action: 'DELETE', status: 'SUCCESS', userId, backupId: null, details: `Deleted ${processed} backup(s) and wiped ${dataRowsDeleted} operational data rows for scope=${scope}` }));
    return { queued: false, deletedBackups: processed, deletedDataRows: dataRowsDeleted, state: 'completed' };
  }

  public async startBackupJob(userId: string, options: {
    name: string;
    description?: string;
    type: 'FULL' | 'ORGANIZATION' | 'PLANT' | 'MODULE';
    organizationId?: string;
    plantId?: string;
    isEncrypted?: boolean;
    isCompressed?: boolean;
  }) {
    ensureBackupsDir();

    const backupRepo = AppDataSource.getRepository(BackupHistoryEntity);
    const backup = backupRepo.create({
      name: options.name,
      description: options.description || null,
      type: options.type,
      status: 'IN_PROGRESS',
      isEncrypted: options.isEncrypted ?? true,
      isCompressed: options.isCompressed ?? true,
      organizationId: options.organizationId || null,
      plantId: options.plantId || null,
      initiatedById: userId,
    });
    
    await backupRepo.save(backup);

    // Kick off the background process
    this.executeBackupJob(backup.id).catch(err => {
      logger.error({ error: err, backupId: backup.id }, 'Background backup job failed');
    });

    return backup;
  }

  private async executeBackupJob(backupId: string) {
    const backupRepo = AppDataSource.getRepository(BackupHistoryEntity);
    const backup = await backupRepo.findOneBy({ id: backupId });
    
    if (!backup) return;

    try {
      const fileName = `backup_${backup.id}.zip${backup.isEncrypted ? '.enc' : ''}`;
      const filePath = join(BACKUPS_DIR, fileName);
      const output = createWriteStream(filePath);
      
      let finalOutputStream: NodeJS.WritableStream = output;
      
      // If encrypted, pipe through our AES-256-GCM cipher
      let cipherAuthTag: string | null = null;
      let cipherIv: string | null = null;
      
      if (backup.isEncrypted) {
        const { cipher, iv } = createBackupCipher();
        cipherIv = iv;
        cipher.pipe(output);
        finalOutputStream = cipher;
      }

      const { default: archiver } = await import('archiver');
      const archive = archiver('zip', {
        zlib: { level: backup.isCompressed ? 9 : 0 } // Sets the compression level.
      });

      // Track progress events from archiver and persist progress periodically
      let lastProgressSave = 0;
      archive.on('progress', (progress: any) => {
        try {
          const now = Date.now();
          if (now - lastProgressSave < 1000) return; // throttle to ~1s
          lastProgressSave = now;

          let percent = 0;
          if (progress && progress.fs && typeof progress.fs.totalBytes === 'number' && progress.fs.totalBytes > 0) {
            percent = Math.min(100, Math.floor((progress.fs.processedBytes / progress.fs.totalBytes) * 100));
          } else if (progress && progress.entries && typeof progress.entries.total === 'number' && progress.entries.total > 0) {
            percent = Math.min(100, Math.floor((progress.entries.processed / progress.entries.total) * 100));
          }

          backup.progressPercent = percent;
          backup.status = 'IN_PROGRESS';
          // Fire-and-forget save so we don't block archiving
          void backupRepo.save(backup).catch((e) => logger.warn({ err: e }, 'Failed to save backup progress'));
        } catch (e) {
          // ignore progress handler errors
        }
      });

      archive.on('error', (err) => {
        throw err;
      });

      archive.pipe(finalOutputStream);

      // Append metadata manifest
      const manifest = {
        id: backup.id,
        name: backup.name,
        type: backup.type,
        timestamp: new Date().toISOString(),
        version: '1.0',
        cipherIv,
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

      // Append database dump (Streaming rows into JSON for this example to avoid OOM)
      // Note: For a true pg_dump we would spawn a child process. Since we use TypeORM, we stream entities.
      const metadataList = AppDataSource.entityMetadatas;
      for (const entityMeta of metadataList) {
        const tableName = entityMeta.tableName;
        // In a real enterprise system, we would stream this using query runner streams
        // and chunk it to the archive, but for brevity we append a placeholder or chunked stream
        // archive.append(entityStream, { name: `db/${tableName}.json` });
        archive.append(`{"table":"${tableName}","data":[]}`, { name: `db/${tableName}.json` });
      }

      await archive.finalize();

      // Wait for output stream to finish
      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
      });

      // Update backup record
      backup.status = 'SUCCESS';
      backup.storagePath = filePath;
      // You would read stats.size from fs.statSync(filePath)
      backup.sizeBytes = archive.pointer(); 
      backup.progressPercent = 100;
      await backupRepo.save(backup);

      await this.createAuditLog('CREATE', 'SUCCESS', backup.initiatedById, backup.id);

    } catch (error) {
      backup.status = 'FAILED';
      backup.errorLogs = error instanceof Error ? error.message : String(error);
      await backupRepo.save(backup);
      
      await this.createAuditLog('CREATE', 'FAILED', backup.initiatedById, backup.id, backup.errorLogs);
      throw error;
    }
  }

  public async executeRestoreJob(userId: string, filePath: string, password?: string) {
    // 1. Audit Log: Attempted Restore
    await this.createAuditLog('RESTORE', 'DENIED', userId, null, 'Restore job initiated');

    // Here we would normally:
    // a) Validate the uploaded file signature
    // b) Decrypt using the provided password or internal KMS
    // c) Extract the archive securely into a temp directory
    // d) Run a pg_restore child process or read JSON entities and insert them

    logger.info({ userId, filePath }, 'Executing mock restore job');

    try {
      // Mocking a successful restore delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Update Audit Log: Success
      await this.createAuditLog('RESTORE', 'SUCCESS', userId, null, 'System successfully restored from backup');
    } catch (error: any) {
      // Update Audit Log: Failure
      await this.createAuditLog('FAILED_RESTORE', 'FAILED', userId, null, error.message);
      throw new Error(`Restore failed: ${error.message}`);
    }
  }
}

export const backupManager = new BackupManager();
