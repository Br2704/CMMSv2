import { readFileSync, existsSync } from 'node:fs';
import { Router } from 'express';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRootAdmin } from '../../middlewares/permissionGuard';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, fail } from '../../utils/apiResponse';
import { backupManager } from './backup.manager';
import { AppDataSource } from '../../database/data-source';
import { BackupHistoryEntity } from '../../database/entities/BackupHistoryEntity';
import { createReadStream } from 'fs';
import multer from 'multer';

const upload = multer({ dest: 'uploads/backups/' });

export const backupRouter = Router();

// Get Paginated Backup History
backupRouter.get(
  '/backup',
  requireAuth,
  requireRootAdmin(),
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '10', 10);

    const repo = AppDataSource.getRepository(BackupHistoryEntity);
    const [backups, total] = await repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['initiatedBy'],
    });

    res.status(200).json(ok({ backups, total, page, limit }, 'Backup history retrieved'));
  }),
);

// Create New Backup
backupRouter.post(
  '/backup',
  requireAuth,
  requireRootAdmin(),
  asyncHandler(async (req, res) => {
    const { name, description, type, organizationId, plantId, isEncrypted, isCompressed } = req.body;
    
    if (!name || !type) {
      res.status(400).json(fail('Name and Type are required'));
      return;
    }

    const backup = await backupManager.startBackupJob(req.auth!.userId, {
      name,
      description,
      type,
      organizationId,
      plantId,
      isEncrypted,
      isCompressed,
    });

    res.status(202).json(ok(backup, 'Backup job started successfully'));
  }),
);

// Download Backup File
backupRouter.get(
  '/backup/:id/download',
  requireAuth,
  requireRootAdmin(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(BackupHistoryEntity);
    const backup = await repo.findOneBy({ id });

    if (!backup || !backup.storagePath || backup.status !== 'SUCCESS') {
      res.status(404).json(fail('Backup file not found or not ready'));
      return;
    }

    if (!existsSync(backup.storagePath)) {
      res.status(404).json(fail('Physical backup file missing from storage'));
      return;
    }

    const filename = `backup_${backup.id}.zip${backup.isEncrypted ? '.enc' : ''}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const readStream = createReadStream(backup.storagePath);
    readStream.pipe(res);
  }),
);

// We'll also need a restore endpoint, which will be implemented in backup.restore.ts/manager later.
backupRouter.post(
  '/backup/restore',
  requireAuth,
  requireRootAdmin(),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json(fail('Backup file is required'));
      return;
    }
    
    const password = req.body.password;
    if (!password) {
      res.status(400).json(fail('Decryption passphrase/password is required'));
      return;
    }

    try {
      await backupManager.executeRestoreJob(req.auth!.userId, req.file.path, password);
      res.status(200).json(ok(null, 'Restore completed successfully'));
    } catch (err: any) {
      res.status(500).json(fail(err.message || 'Failed to restore backup'));
    }
  }),
);
