import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { logger } from '../config/logger';
import { MailQueueEntity, type MailQueueStatus } from '../database/entities/mail-queue.entity';
import { EmailLogEntity, type EmailStatus } from '../database/entities/email-log.entity';
import { SystemConfigEntity } from '../database/entities/system-config.entity';

let transporter: nodemailer.Transporter | null = null;
let cachedConfig: Record<string, any> | null = null;
let lastConfigFetch = 0;
const CONFIG_CACHE_TTL = 60_000; // 1 minute

async function getSmtpConfig(): Promise<Record<string, any>> {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const repo = AppDataSource.getRepository(SystemConfigEntity);
    const config = await repo.findOneBy({ configKey: 'SMTP_CONFIG', isActive: true });
    
    if (config?.configValue) {
      cachedConfig = config.configValue;
      lastConfigFetch = now;
      return cachedConfig as Record<string, any>;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to fetch SMTP config from database');
  }

  // Fallback to env
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    fromName: env.SMTP_FROM_NAME,
  };
}

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  const config = await getSmtpConfig();
  
  transporter = nodemailer.createTransport({
    host: config.host || env.SMTP_HOST,
    port: config.port || env.SMTP_PORT,
    secure: (config.port || env.SMTP_PORT) === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 10,
  });

  return transporter;
}

export async function isMailConfigured(): Promise<boolean> {
  const config = await getSmtpConfig();
  return Boolean(config.host && config.from && config.user && config.pass);
}

export async function verifyMailConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!(await isMailConfigured())) {
    return { ok: false, error: 'SMTP is not configured' };
  }
  try {
    const t = await getTransporter();
    await t.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'SMTP verification failed' };
  }
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isMailConfigured())) {
    return { ok: false, error: 'SMTP is not configured' };
  }
  try {
    const config = await getSmtpConfig();
    const t = await getTransporter();
    await t.sendMail({
      from: `"${config.fromName || env.SMTP_FROM_NAME}" <${config.from || env.SMTP_FROM}>`,
      to,
      subject: '[CMMS] SMTP Test Email',
      text: 'This is a test email from your CMMS system. If you received this, SMTP is configured correctly.',
      html: '<h2>CMMS Mail Configuration Test</h2><p>If you received this, SMTP is configured correctly.</p>',
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to send test email' };
  }
}

export async function enqueueMail(input: {
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  priority?: number;
  templateName?: string;
  templateData?: Record<string, unknown>;
  woId?: string;
  woNumber?: string;
  eventType?: string;
}): Promise<MailQueueEntity | null> {
  if (!(await isMailConfigured())) return null;

  const repo = AppDataSource.getRepository(MailQueueEntity);
  const entity = repo.create({
    recipient: input.recipient,
    cc: input.cc ?? null,
    bcc: input.bcc ?? null,
    subject: input.subject,
    htmlBody: input.htmlBody,
    textBody: input.textBody ?? null,
    priority: input.priority ?? 0,
    status: 'PENDING',
    retryCount: 0,
    maxRetries: 3,
    templateName: input.templateName ?? null,
    templateData: (input.templateData as Record<string, unknown>) ?? null,
    woId: input.woId ?? null,
    woNumber: input.woNumber ?? null,
    eventType: input.eventType ?? null,
  });
  return repo.save(entity);
}

export async function enqueueBulkMail(
  inputs: Array<{
    recipient: string;
    cc?: string;
    bcc?: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    priority?: number;
    templateName?: string;
    templateData?: Record<string, unknown>;
    woId?: string;
    woNumber?: string;
    eventType?: string;
  }>,
): Promise<number> {
  if (!(await isMailConfigured()) || inputs.length === 0) return 0;

  const repo = AppDataSource.getRepository(MailQueueEntity);
  const entities = inputs.map((input) =>
    repo.create({
      recipient: input.recipient,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      subject: input.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody ?? null,
      priority: input.priority ?? 0,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      templateName: input.templateName ?? null,
      templateData: (input.templateData as Record<string, unknown>) ?? null,
      woId: input.woId ?? null,
      woNumber: input.woNumber ?? null,
      eventType: input.eventType ?? null,
    }),
  );
  await repo.save(entities);
  return entities.length;
}

export async function processMailQueue(batchSize = 10): Promise<{ sent: number; failed: number }> {
  if (!(await isMailConfigured())) return { sent: 0, failed: 0 };

  const queueRepo = AppDataSource.getRepository(MailQueueEntity);
  const logRepo = AppDataSource.getRepository(EmailLogEntity);
  const config = await getSmtpConfig();

  const pending = await queueRepo
    .createQueryBuilder('q')
    .where('q.status = :status', { status: 'PENDING' })
    .andWhere('(q.next_retry_at IS NULL OR q.next_retry_at <= NOW())')
    .orderBy('q.priority', 'DESC')
    .addOrderBy('q.created_at', 'ASC')
    .limit(batchSize)
    .getMany();

  if (pending.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      item.status = 'PROCESSING';
      await queueRepo.save(item);

      const t = await getTransporter();
      await t.sendMail({
        from: `"${config.fromName || env.SMTP_FROM_NAME}" <${config.from || env.SMTP_FROM}>`,
        to: item.recipient,
        cc: item.cc ?? undefined,
        bcc: item.bcc ?? undefined,
        subject: item.subject,
        text: item.textBody ?? undefined,
        html: item.htmlBody,
      });

      item.status = 'SENT';
      item.processedAt = new Date();
      await queueRepo.save(item);

      await logRepo.save(
        logRepo.create({
          recipient: item.recipient,
          subject: item.subject,
          body: item.htmlBody,
          status: 'SENT',
          sentAt: new Date(),
          templateName: item.templateName,
          woId: item.woId,
          woNumber: item.woNumber,
          eventType: item.eventType,
          retryCount: item.retryCount,
          maxRetries: item.maxRetries,
        }),
      );

      sent++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      item.retryCount++;
      item.lastError = errorMessage;

      if (item.retryCount >= item.maxRetries) {
        item.status = 'DEAD_LETTER';
        item.processedAt = new Date();

        await logRepo.save(
          logRepo.create({
            recipient: item.recipient,
            subject: item.subject,
            body: item.htmlBody,
            status: 'FAILED',
            templateName: item.templateName,
            woId: item.woId,
            woNumber: item.woNumber,
            eventType: item.eventType,
            deliveryError: errorMessage,
            retryCount: item.retryCount,
            maxRetries: item.maxRetries,
          }),
        );
      } else {
        item.status = 'PENDING';
        item.nextRetryAt = new Date(Date.now() + Math.min(Math.pow(2, item.retryCount) * 60_000, 3600_000));
      }

      await queueRepo.save(item);
      failed++;
    }
  }

  return { sent, failed };
}

export async function retryDeadLetters(): Promise<number> {
  const queueRepo = AppDataSource.getRepository(MailQueueEntity);
  const deadLetters = await queueRepo.find({ where: { status: 'DEAD_LETTER' as MailQueueStatus } });
  if (deadLetters.length === 0) return 0;

  for (const item of deadLetters) {
    item.status = 'PENDING';
    item.retryCount = 0;
    item.lastError = null;
    item.nextRetryAt = new Date();
  }
  await queueRepo.save(deadLetters);
  return deadLetters.length;
}

export async function getMailQueueStats(): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
}> {
  const queueRepo = AppDataSource.getRepository(MailQueueEntity);

  const pending = await queueRepo.count({ where: { status: 'PENDING' as MailQueueStatus } });
  const processing = await queueRepo.count({ where: { status: 'PROCESSING' as MailQueueStatus } });
  const sent = await queueRepo.count({ where: { status: 'SENT' as MailQueueStatus } });
  const failed = await queueRepo.count({ where: { status: 'FAILED' as MailQueueStatus } });
  const deadLetter = await queueRepo.count({ where: { status: 'DEAD_LETTER' as MailQueueStatus } });

  return { pending, processing, sent, failed, deadLetter };
}

export async function getEmailLogs(
  page = 1,
  limit = 50,
  filters?: { status?: string; woId?: string; userId?: string },
): Promise<{ logs: EmailLogEntity[]; total: number }> {
  const logRepo = AppDataSource.getRepository(EmailLogEntity);
  const query = logRepo.createQueryBuilder('log').orderBy('log.created_at', 'DESC');

  if (filters?.status) {
    query.andWhere('log.status = :status', { status: filters.status });
  }
  if (filters?.woId) {
    query.andWhere('log.wo_id = :woId', { woId: filters.woId });
  }
  if (filters?.userId) {
    query.andWhere('log.user_id = :userId', { userId: filters.userId });
  }

  const total = await query.getCount();
  const logs = await query.skip((page - 1) * limit).take(limit).getMany();
  return { logs, total };
}

export function resetTransporter(): void {
  if (transporter) {
    transporter.close();
    transporter = null;
  }
  cachedConfig = null;
  lastConfigFetch = 0;
}
