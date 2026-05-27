import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { AppDataSource } from '../../database/data-source';
import { NotificationEntity, OrganizationEntity, UserEntity } from '../../database/entities';

const ORGANIZATION_REMINDER_ROLES = ['SUPER_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN'];
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['TRIAL', 'ACTIVE', 'EXPIRING']);
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

let schedulerStarted = false;

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysUntilDate(target: string, now: Date) {
  const targetDay = startOfUtcDay(parseDateOnly(target));
  const nowDay = startOfUtcDay(now);
  return Math.ceil((targetDay.getTime() - nowDay.getTime()) / MILLIS_PER_DAY);
}

function resolveReminderContext(organization: OrganizationEntity, now: Date) {
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(organization.subscriptionStatus)) {
    return null;
  }

  if (organization.hasFreeTrial && organization.subscriptionStatus === 'TRIAL' && organization.trialEndDate) {
    const daysRemaining = daysUntilDate(organization.trialEndDate, now);
    return {
      category: 'free trial',
      dueDate: organization.trialEndDate,
      daysRemaining,
      shouldNotify: daysRemaining >= 0 && daysRemaining <= organization.reminderLeadDays,
    };
  }

  if (organization.subscriptionEndDate) {
    const daysRemaining = daysUntilDate(organization.subscriptionEndDate, now);
    return {
      category: 'subscription',
      dueDate: organization.subscriptionEndDate,
      daysRemaining,
      shouldNotify: daysRemaining >= 0 && daysRemaining <= organization.reminderLeadDays,
    };
  }

  return null;
}

async function loadReminderRecipients(organizationId: string) {
  const repo = AppDataSource.getRepository(UserEntity);
  const rows = await repo
    .createQueryBuilder('user')
    .leftJoin('user.orgRole', 'orgRole')
    .leftJoin('user.userRoles', 'userRole')
    .select('DISTINCT user.id', 'id')
    .addSelect('user.email', 'email')
    .addSelect('user.full_name', 'fullName')
    .where('user.is_active = TRUE')
    .andWhere('user.organization_id = :organizationId', { organizationId })
    .andWhere(
      '(UPPER(COALESCE(orgRole.key, \'\')) IN (:...roles) OR UPPER(COALESCE(userRole.role, \'\')) IN (:...roles))',
      { roles: ORGANIZATION_REMINDER_ROLES },
    )
    .getRawMany<{ id: string; email: string; fullName: string }>();

  return rows.filter((row) => row.id && row.email);
}

async function sendReminderEmail(
  organization: OrganizationEntity,
  recipients: Array<{ id: string; email: string; fullName: string }>,
  details: { category: string; dueDate: string; daysRemaining: number },
) {
  if (!env.SMTP_HOST || !env.SMTP_FROM || recipients.length === 0) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  const dueText =
    details.daysRemaining === 0 ? 'today' : `in ${details.daysRemaining} day${details.daysRemaining === 1 ? '' : 's'}`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: recipients.map((recipient) => recipient.email).join(','),
    subject: `[CMMS] ${organization.name} ${details.category} renewal reminder`,
    text:
      `${organization.name} ${details.category} is due ${dueText}. ` +
      `Due date: ${details.dueDate}. Reminder lead time: ${organization.reminderLeadDays} day(s).`,
  });
}

async function createInAppNotifications(
  recipients: Array<{ id: string; email: string; fullName: string }>,
  organization: OrganizationEntity,
  details: { category: string; dueDate: string; daysRemaining: number },
) {
  if (recipients.length === 0) {
    return;
  }

  const notificationRepo = AppDataSource.getRepository(NotificationEntity);
  const dueText =
    details.daysRemaining === 0 ? 'today' : `in ${details.daysRemaining} day${details.daysRemaining === 1 ? '' : 's'}`;
  const notifications = recipients.map((recipient) =>
    notificationRepo.create({
      userId: recipient.id,
      title: `Organization ${details.category} reminder`,
      message: `${organization.name} ${details.category} is due ${dueText} on ${details.dueDate}.`,
      type: 'warning',
      isRead: false,
      link: '/masters/organization',
      woId: null,
    }),
  );
  await notificationRepo.save(notifications);
}

async function runOrganizationSubscriptionReminders() {
  if (!AppDataSource.isInitialized) {
    return;
  }

  const repo = AppDataSource.getRepository(OrganizationEntity);
  const organizations = await repo.find({
    where: {
      isActive: true,
      reminderEnabled: true,
    },
  });

  const now = new Date();
  for (const organization of organizations) {
    const reminder = resolveReminderContext(organization, now);
    if (!reminder?.shouldNotify) {
      continue;
    }

    const reminderWindowStart = parseDateOnly(reminder.dueDate);
    reminderWindowStart.setUTCDate(reminderWindowStart.getUTCDate() - organization.reminderLeadDays);
    if (organization.lastReminderSentAt && organization.lastReminderSentAt.getTime() >= reminderWindowStart.getTime()) {
      continue;
    }

    const recipients = await loadReminderRecipients(organization.id);
    if (recipients.length === 0) {
      continue;
    }

    try {
      await sendReminderEmail(organization, recipients, reminder);
      await createInAppNotifications(recipients, organization, reminder);
      organization.lastReminderSentAt = now;
      await repo.save(organization);
      logger.info(
        {
          organizationId: organization.id,
          recipientCount: recipients.length,
          dueDate: reminder.dueDate,
          category: reminder.category,
        },
        'Processed organization subscription reminder',
      );
    } catch (error) {
      logger.error(
        {
          error,
          organizationId: organization.id,
        },
        'Failed processing organization subscription reminder',
      );
    }
  }
}

export function startOrganizationSubscriptionScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  cron.schedule('0 * * * *', () => {
    void runOrganizationSubscriptionReminders().catch((error) => {
      logger.error({ error }, 'Failed running organization subscription reminder tick');
    });
  });

  logger.info('Organization subscription reminder scheduler started');
}
