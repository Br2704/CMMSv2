import { Router } from 'express';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataSource } from '../../database/data-source';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { logger } from '../../config/logger';
import {
  verifyMailConnection,
  sendTestEmail,
  getMailQueueStats,
  retryDeadLetters,
  getEmailLogs,
  isMailConfigured,
  resetTransporter,
} from '../../services/mail.service';
import { MailQueueEntity } from '../../database/entities/mail-queue.entity';
import { EmailLogEntity } from '../../database/entities/email-log.entity';
import { EscalationHistoryEntity } from '../../database/entities/escalation-history.entity';
import { SlaConfigEntity } from '../../database/entities/sla-config.entity';

export const mailRouter = Router();
mailRouter.use(requireAuth);

mailRouter.get('/mail/config', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    res.json(ok({
      configured: isMailConfigured(),
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      from: process.env.SMTP_FROM || '',
      fromName: process.env.SMTP_FROM_NAME || 'CMMS Notification',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS ? '********' : '',
    }, 'Mail config fetched'));
  } catch (error) {
    next(error);
  }
});

mailRouter.put('/mail/config', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = z.object({
      host: z.string().min(1),
      port: z.number().int().positive().default(587),
      user: z.string().min(1),
      pass: z.string().min(1),
      from: z.string().min(1),
      fromName: z.string().optional().default('CMMS Notification'),
    }).parse(req.body);

    const envPath = resolve(process.cwd(), '.env');
    const fallbackPaths = [
      resolve(process.cwd(), 'backend/.env'),
      resolve('/opt/cmmsv2/backend/.env'),
    ];

    let targetPath: string | null = null;
    if (existsSync(envPath)) {
      targetPath = envPath;
    } else {
      for (const fp of fallbackPaths) {
        if (existsSync(fp)) { targetPath = fp; break; }
      }
    }

    if (targetPath) {
      let content = readFileSync(targetPath, 'utf-8');

      const vars: Array<{ key: string; val: string }> = [
        { key: 'SMTP_HOST', val: body.host },
        { key: 'SMTP_PORT', val: String(body.port) },
        { key: 'SMTP_USER', val: body.user },
        { key: 'SMTP_PASS', val: body.pass },
        { key: 'SMTP_FROM', val: body.from },
        { key: 'SMTP_FROM_NAME', val: body.fromName },
      ];

      for (const { key, val } of vars) {
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (re.test(content)) {
          content = content.replace(re, `${key}=${val}`);
        } else {
          content += `\n${key}=${val}`;
        }
      }

      writeFileSync(targetPath, content, 'utf-8');
    }

    Object.assign(process.env, {
      SMTP_HOST: body.host,
      SMTP_PORT: String(body.port),
      SMTP_USER: body.user,
      SMTP_PASS: body.pass,
      SMTP_FROM: body.from,
      SMTP_FROM_NAME: body.fromName,
    });

    resetTransporter();

    res.json(ok({
      configured: true,
      host: body.host,
      port: body.port,
      from: body.from,
    }, 'Mail configuration saved'));
  } catch (error) {
    next(error);
  }
});

mailRouter.post('/mail/test', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = z.object({ to: z.string().email() }).parse(req.body);
    const result = await sendTestEmail(body.to);
    if (result.ok) {
      res.json(ok({ sent: true }, 'Test email sent'));
    } else {
      res.status(500).json(ok({ sent: false, error: result.error }, 'Test email failed'));
    }
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/mail/verify', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const result = await verifyMailConnection();
    if (result.ok) {
      res.json(ok({ connected: true }, 'SMTP connection verified'));
    } else {
      res.status(500).json(ok({ connected: false, error: result.error }, 'SMTP verification failed'));
    }
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/mail/stats', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const stats = await getMailQueueStats();
    res.json(ok(stats, 'Mail queue stats'));
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/mail/logs', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
      status: z.string().optional(),
      woId: z.string().uuid().optional(),
    }).parse(req.query);

    const result = await getEmailLogs(query.page, query.limit, {
      status: query.status,
      woId: query.woId,
    });
    res.json(ok(result, 'Email logs fetched'));
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/mail/queue', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
      status: z.string().optional(),
    }).parse(req.query);

    const repo = AppDataSource.getRepository(MailQueueEntity);
    const qb = repo.createQueryBuilder('q').orderBy('q.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('q.status = :status', { status: query.status });
    }

    const total = await qb.getCount();
    const items = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
    res.json(ok({ items, total }, 'Mail queue fetched'));
  } catch (error) {
    next(error);
  }
});

mailRouter.post('/mail/retry-dead-letters', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const count = await retryDeadLetters();
    res.json(ok({ retried: count }, `Retried ${count} dead letter emails`));
  } catch (error) {
    next(error);
  }
});

mailRouter.post('/mail/retry-one', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = z.object({ id: z.string().uuid() }).parse(req.body);
    const repo = AppDataSource.getRepository(MailQueueEntity);
    const item = await repo.findOneBy({ id: body.id });
    if (!item) {
      res.status(404).json(ok(null, 'Mail not found'));
      return;
    }
    item.status = 'PENDING' as any;
    item.retryCount = 0;
    item.lastError = null;
    item.nextRetryAt = new Date();
    await repo.save(item);
    res.json(ok({ retried: true }, 'Mail requeued for retry'));
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/mail/templates', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const templates = [
      { name: 'newWorkOrder', label: 'New Work Order' },
      { name: 'workOrderAssigned', label: 'Work Order Assigned' },
      { name: 'workOrderEscalated', label: 'Work Order Escalated' },
      { name: 'workOrderPending', label: 'Work Order Pending' },
      { name: 'workOrderOverdue', label: 'Work Order Overdue' },
      { name: 'workOrderReminder', label: 'Work Order Reminder' },
      { name: 'workOrderCompleted', label: 'Work Order Completed' },
      { name: 'workOrderRejected', label: 'Work Order Rejected' },
      { name: 'approvalRequired', label: 'Approval Required' },
      { name: 'slaBreached', label: 'SLA Breached' },
    ];
    res.json(ok({ templates }, 'Mail templates list'));
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/escalation/history', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
      woId: z.string().uuid().optional(),
      resolved: z.string().optional(),
    }).parse(req.query);

    const repo = AppDataSource.getRepository(EscalationHistoryEntity);
    const qb = repo.createQueryBuilder('e').orderBy('e.triggered_at', 'DESC');

    if (query.woId) {
      qb.andWhere('e.wo_id = :woId', { woId: query.woId });
    }
    if (query.resolved !== undefined) {
      qb.andWhere('e.resolved = :resolved', { resolved: query.resolved === 'true' });
    }

    const total = await qb.getCount();
    const items = await qb.skip((query.page - 1) * query.limit).take(query.limit).getMany();
    res.json(ok({ items, total }, 'Escalation history'));
  } catch (error) {
    next(error);
  }
});

mailRouter.get('/sla/config', requireRole(['SUPERADMIN', 'ADMIN']), async (_req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(SlaConfigEntity);
    const configs = await repo.find({ where: { isActive: true }, order: { priority: 'ASC' } });
    res.json(ok(configs, 'SLA configs'));
  } catch (error) {
    next(error);
  }
});

mailRouter.post('/sla/config', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = z.object({
      scope: z.string().default('GLOBAL'),
      scopeValue: z.string().nullable().optional(),
      priority: z.string().default('MEDIUM'),
      responseTimeMinutes: z.number().int().positive().default(30),
      acknowledgementTimeMinutes: z.number().int().positive().default(15),
      closureTimeMinutes: z.number().int().positive().default(480),
      escalation1Minutes: z.number().int().positive().default(30),
      escalation2Minutes: z.number().int().positive().default(60),
      escalation3Minutes: z.number().int().positive().default(120),
      escalation4Minutes: z.number().int().positive().default(240),
      reminderIntervalMinutes: z.number().int().positive().default(60),
      escalationRole1: z.string().nullable().optional(),
      escalationRole2: z.string().nullable().optional(),
      escalationRole3: z.string().nullable().optional(),
      escalationRole4: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    }).parse(req.body);

    const repo = AppDataSource.getRepository(SlaConfigEntity);
    const entity = repo.create({ ...body, createdBy: req.auth!.userId });
    await repo.save(entity);
    res.status(201).json(ok(entity, 'SLA config created'));
  } catch (error) {
    next(error);
  }
});

mailRouter.put('/sla/config/:id', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      scope: z.string().optional(),
      scopeValue: z.string().nullable().optional(),
      priority: z.string().optional(),
      responseTimeMinutes: z.number().int().positive().optional(),
      acknowledgementTimeMinutes: z.number().int().positive().optional(),
      closureTimeMinutes: z.number().int().positive().optional(),
      escalation1Minutes: z.number().int().positive().optional(),
      escalation2Minutes: z.number().int().positive().optional(),
      escalation3Minutes: z.number().int().positive().optional(),
      escalation4Minutes: z.number().int().positive().optional(),
      reminderIntervalMinutes: z.number().int().positive().optional(),
      escalationRole1: z.string().nullable().optional(),
      escalationRole2: z.string().nullable().optional(),
      escalationRole3: z.string().nullable().optional(),
      escalationRole4: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      description: z.string().nullable().optional(),
    }).parse(req.body);

    const repo = AppDataSource.getRepository(SlaConfigEntity);
    const existing = await repo.findOneBy({ id: params.id });
    if (!existing) {
      res.status(404).json(ok(null, 'SLA config not found'));
      return;
    }
    Object.assign(existing, body);
    await repo.save(existing);
    res.json(ok(existing, 'SLA config updated'));
  } catch (error) {
    next(error);
  }
});
