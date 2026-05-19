import { createServer } from 'http';
import cron from 'node-cron';
import { app } from './app';
import { startAmcScheduler } from './modules/amc/amc.scheduler';
import { env } from './config/env';
import { logger } from './config/logger';
import { AppDataSource } from './database/data-source';
import { ensureSelectedDatabaseExists } from './database/ensure-database';
import { ensureProtectedRootAdminBootstrap } from './bootstrap/protected-root-admin.bootstrap';
import {
  LogEntryEntity,
  LogTemplateAssignmentEntity,
  LogTemplateEntity,
  NotificationEntity,
  UserEntity,
} from './database/entities';
import { startCalibrationScheduler } from './modules/calibration/calibration.scheduler';
import { publishNotificationChange } from './modules/notifications/notification-stream';
import { startOrganizationSubscriptionScheduler } from './modules/organizations/organizations.scheduler';
import { startPmSchedulesScheduler } from './modules/pmSchedules/pmschedules.scheduler';
import { startReportsScheduler } from './modules/reports/reports.scheduler';
import { startWorkOrdersScheduler } from './modules/workorders/workorders.scheduler';
import { startMailScheduler } from './modules/mail/mail-scheduler';
import { startDashboardSocketServer, stopDashboardSocketServer } from './realtime/dashboard-socket';
import { initializeSecretRotation } from './utils/secretRotation';

let logSchedulerStarted = false;

function resolveLogFrequencyMinutes(frequency: string) {
  const normalized = String(frequency || '').trim().toUpperCase();
  if (normalized === 'HOURLY') return 60;
  if (normalized === 'DAILY') return 24 * 60;
  if (normalized === 'WEEKLY') return 7 * 24 * 60;
  if (normalized === 'SHIFT' || normalized === 'PER_SHIFT') return 8 * 60;
  return 24 * 60;
}

function extractTemplateIdFromLink(link: string | null | undefined) {
  if (!link) return null;
  try {
    const parsed = new URL(link, 'http://localhost');
    return parsed.searchParams.get('templateId');
  } catch {
    return null;
  }
}

async function runLogTemplateNotificationScheduler() {
  const templateRepo = AppDataSource.getRepository(LogTemplateEntity);
  const assignmentRepo = AppDataSource.getRepository(LogTemplateAssignmentEntity);
  const entryRepo = AppDataSource.getRepository(LogEntryEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const notificationRepo = AppDataSource.getRepository(NotificationEntity);

  const templates = await templateRepo.find({
    where: { isActive: true },
    select: [
      'id',
      'templateName',
      'frequency',
      'reminderMinutesBefore',
      'overdueAlertMinutes',
      'notifyAtShiftStart',
      'createdAt',
    ],
  });
  if (templates.length === 0) {
    return;
  }

  const templateIds = templates.map((template) => template.id);
  const assignments = await assignmentRepo.find({
    where: templateIds.map((templateId) => ({ templateId })),
    select: ['templateId', 'userId'],
  });
  if (assignments.length === 0) {
    return;
  }

  const assignmentMap = new Map<string, string[]>();
  assignments.forEach((assignment) => {
    const current = assignmentMap.get(assignment.templateId) ?? [];
    current.push(assignment.userId);
    assignmentMap.set(assignment.templateId, current);
  });

  const assignedUserIds = Array.from(new Set(assignments.map((assignment) => assignment.userId)));
  const activeUsers = await userRepo.find({
    where: assignedUserIds.map((id) => ({ id, isActive: true })),
    select: ['id'],
  });
  const activeUserSet = new Set(activeUsers.map((user) => user.id));
  if (activeUserSet.size === 0) {
    return;
  }

  const lookbackStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentNotifications = await notificationRepo
    .createQueryBuilder('notification')
    .where('notification.user_id IN (:...userIds)', { userIds: Array.from(activeUserSet) })
    .andWhere('notification.type IN (:...types)', {
      types: ['log_schedule_reminder', 'log_schedule_overdue'],
    })
    .andWhere('notification.created_at >= :lookbackStart', { lookbackStart })
    .getMany();

  const existingKeys = new Set<string>();
  recentNotifications.forEach((notification) => {
    const templateId = extractTemplateIdFromLink(notification.link);
    if (!templateId) return;
    existingKeys.add(`${notification.userId}|${notification.type}|${templateId}`);
  });

  const now = new Date();
  const inserts: NotificationEntity[] = [];

  for (const template of templates) {
    const assignedUsers = (assignmentMap.get(template.id) ?? []).filter((userId) => activeUserSet.has(userId));
    if (assignedUsers.length === 0) continue;

    const latestEntry = await entryRepo
      .createQueryBuilder('entry')
      .where('entry.template_id = :templateId', { templateId: template.id })
      .andWhere('entry.status IN (:...statuses)', { statuses: ['SUBMITTED', 'APPROVED', 'COMPLETED'] })
      .orderBy('entry.submitted_at', 'DESC')
      .addOrderBy('entry.created_at', 'DESC')
      .getOne();

    const referenceTime = latestEntry?.submittedAt ?? latestEntry?.createdAt ?? template.createdAt;
    const intervalMinutes = resolveLogFrequencyMinutes(template.frequency);
    const dueAt = new Date(referenceTime.getTime() + intervalMinutes * 60_000);
    const reminderAt = new Date(dueAt.getTime() - Math.max(0, template.reminderMinutesBefore || 0) * 60_000);
    const overdueAt = new Date(dueAt.getTime() + Math.max(0, template.overdueAlertMinutes || 0) * 60_000);

    let notificationType: 'log_schedule_reminder' | 'log_schedule_overdue' | null = null;
    let title = '';
    let message = '';

    if (now >= overdueAt) {
      const overdueMinutes = Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / 60_000));
      notificationType = 'log_schedule_overdue';
      title = 'Log Template Overdue';
      message = `${template.templateName} is overdue by ${overdueMinutes} minute(s). Please submit the pending log.`;
    } else if ((template.notifyAtShiftStart || (template.reminderMinutesBefore || 0) > 0) && now >= reminderAt) {
      notificationType = 'log_schedule_reminder';
      title = 'Log Template Due Reminder';
      message = `${template.templateName} is due at ${dueAt.toLocaleString()}. Please complete the scheduled log.`;
    }

    if (!notificationType) continue;

    const link = `/logs?templateId=${template.id}`;
    for (const userId of assignedUsers) {
      const dedupeKey = `${userId}|${notificationType}|${template.id}`;
      if (existingKeys.has(dedupeKey)) {
        continue;
      }

      inserts.push(
        notificationRepo.create({
          userId,
          title,
          message,
          type: notificationType,
          isRead: false,
          link,
          woId: null,
        }),
      );
      existingKeys.add(dedupeKey);
    }
  }

  if (inserts.length === 0) {
    return;
  }

  await notificationRepo.save(inserts);

  const touchedUsers = Array.from(new Set(inserts.map((row) => row.userId)));
  touchedUsers.forEach((userId) => {
    publishNotificationChange(userId);
  });

  logger.info({ notificationsCreated: inserts.length }, 'Log template scheduler pushed notifications');
}

function startLogTemplateScheduler() {
  if (logSchedulerStarted) return;
  logSchedulerStarted = true;

  cron.schedule('*/5 * * * *', () => {
    void runLogTemplateNotificationScheduler().catch((error) => {
      logger.error({ error }, 'Failed running log template notification scheduler');
    });
  });

  logger.info('Log template notification scheduler started');
}

async function bootstrap() {
  initializeSecretRotation();
  await ensureSelectedDatabaseExists();
  await AppDataSource.initialize();
  logger.info('Database connection initialized');

  if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATIONS === 'true') {
    logger.info('Running pending migrations...');
    await AppDataSource.runMigrations();
    logger.info('Migrations completed');
  }
  await ensureProtectedRootAdminBootstrap();
  startReportsScheduler();
  startPmSchedulesScheduler();
  startCalibrationScheduler();
  startLogTemplateScheduler();
  startAmcScheduler();
  startOrganizationSubscriptionScheduler();
  startWorkOrdersScheduler();
  startMailScheduler();

  const server = createServer(app);
  startDashboardSocketServer(server);
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server');
    server.close(async () => {
      await stopDashboardSocketServer();
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
