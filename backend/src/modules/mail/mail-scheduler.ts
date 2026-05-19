import cron from 'node-cron';
import { logger } from '../../config/logger';
import { AppDataSource } from '../../database/data-source';
import { processMailQueue } from '../../services/mail.service';
import { EscalationHistoryEntity, NotificationEntity, WorkOrderActivityLogEntity, WorkOrderEntity, UserEntity, UserRoleEntity, ProfileEntity, SlaConfigEntity } from '../../database/entities';
import type { EscalationLevel } from '../../database/entities/escalation-history.entity';
import { publishNotificationChange } from '../notifications/notification-stream';
import { isMailConfigured } from '../../services/mail.service';
import { sendWorkOrderEscalationEmails, sendWorkOrderReminderEmails, type WoNotificationData } from '../../services/notification-helper';

const ESCALATION_EVENT = 'WORK_ORDER_ESCALATED';
const REMINDER_EVENT = 'WORK_ORDER_REMINDER';

let schedulerStarted = false;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uniqueUserIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function getEscalationUsers(
  level: number,
  plantId: string | null | undefined,
  slaConfig: SlaConfigEntity | null,
): Promise<{ emails: string[]; userIds: string[] }> {
  const roleKey = slaConfig ? (slaConfig as any)[`escalationRole${level}`] as string | null : null;
  if (!roleKey) return { emails: [], userIds: [] };

  const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);

  const roles = await userRoleRepo.find({ where: { role: roleKey.toUpperCase() } });
  if (roles.length === 0) return { emails: [], userIds: [] };

  let userIds = roles.map((r) => r.userId);
  if (plantId) {
    const profiles = await profileRepo.find({
      where: userIds.map((uid) => ({ userId: uid, plantId })),
      select: ['userId'],
    });
    userIds = profiles.map((p) => p.userId);
  }

  const users = await userRepo.find({
    where: userIds.map((uid) => ({ id: uid, isActive: true })),
    select: ['id', 'email'],
  });
  return {
    emails: users.map((u) => u.email).filter((e): e is string => Boolean(e)),
    userIds: users.map((u) => u.id),
  };
}

async function updateEscalationHistory(
  woId: string,
  woNumber: string,
  level: number,
  triggerType: string,
  notifiedUserIds: string[],
  emails: string[],
): Promise<void> {
  const repo = AppDataSource.getRepository(EscalationHistoryEntity);
  const existing = await repo.findOne({
    where: { woId, level, resolved: false },
  });
  if (existing) {
    existing.reminderCount += 1;
    existing.lastReminderAt = new Date();
    existing.notifiedUsers = Array.from(new Set([...existing.notifiedUsers, ...notifiedUserIds]));
    existing.notifiedEmails = Array.from(new Set([...existing.notifiedEmails, ...emails]));
    await repo.save(existing);
  } else {
    await repo.save(
      repo.create({
        woId,
        woNumber,
        level,
        triggerType: triggerType as any,
        notifiedUsers: notifiedUserIds,
        notifiedEmails: emails,
        escalatedToRole: null,
        status: 'ACTIVE',
        resolved: false,
      }),
    );
  }
}

function findSlaConfig(
  wo: { plant_id: string | null; category: string | null; priority: string },
  configs: SlaConfigEntity[]
): SlaConfigEntity | null {
  // 1. Plant match
  if (wo.plant_id) {
    const plantConfig = configs.find(c => c.scope === 'PLANT' && c.scopeValue === wo.plant_id && c.priority === wo.priority);
    if (plantConfig) return plantConfig;
  }
  // 2. Category match
  if (wo.category) {
    const categoryConfig = configs.find(c => c.scope === 'CATEGORY' && c.scopeValue?.toUpperCase() === (wo.category as string).toUpperCase() && c.priority === wo.priority);
    if (categoryConfig) return categoryConfig;
  }
  // 3. Priority match
  const priorityConfig = configs.find(c => c.scope === 'PRIORITY' && c.priority === wo.priority);
  if (priorityConfig) return priorityConfig;

  // 4. Global Priority match
  const globalPriorityConfig = configs.find(c => c.scope === 'GLOBAL' && c.priority === wo.priority);
  if (globalPriorityConfig) return globalPriorityConfig;

  // 5. Fallback to any active Global config
  const globalConfig = configs.find(c => c.scope === 'GLOBAL');
  return globalConfig || null;
}

export async function runEnhancedEscalationScheduler(): Promise<void> {
  if (!AppDataSource.isInitialized) return;

  const manager = AppDataSource.manager;
  const workOrderRepo = manager.getRepository(WorkOrderEntity);
  const activityRepo = manager.getRepository(WorkOrderActivityLogEntity);
  const notificationRepo = manager.getRepository(NotificationEntity);
  const configRepo = manager.getRepository(SlaConfigEntity);

  const slaConfigs = await configRepo.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });

  const candidates = await manager
    .createQueryBuilder()
    .select('wo.id', 'id')
    .addSelect('wo.wo_number', 'wo_number')
    .addSelect('wo.category', 'category')
    .addSelect('wo.asset_id', 'asset_id')
    .addSelect('wo.plant_id', 'plant_id')
    .addSelect('wo.raised_by', 'raised_by')
    .addSelect('wo.assigned_to', 'assigned_to')
    .addSelect('wo.accepted_at', 'accepted_at')
    .addSelect('wo.started_at', 'started_at')
    .addSelect('wo.created_at', 'created_at')
    .addSelect('wo.escalation_level', 'escalation_level')
    .addSelect('wo.sla_due_at', 'sla_due_at')
    .addSelect('wo.priority', 'priority')
    .addSelect('wo.problem_description', 'problem_description')
    .addSelect('wo.reported_location', 'reported_location')
    .from('work_orders', 'wo')
    .where('wo.status NOT IN (:...closedStatuses)', { closedStatuses: ['CLOSED', 'CANCELLED'] })
    .getRawMany<{
      id: string;
      wo_number: string;
      category: string | null;
      asset_id: string | null;
      plant_id: string | null;
      raised_by: string | null;
      assigned_to: string | null;
      accepted_at: string | Date | null;
      started_at: string | Date | null;
      created_at: string | Date;
      escalation_level: number | null;
      sla_due_at: string | Date | null;
      priority: string;
      problem_description: string | null;
      reported_location: string | null;
    }>();

  if (candidates.length === 0) return;

  const now = new Date();
  const touchedUsers = new Set<string>();

  for (const workOrder of candidates) {
    const matchedSla = findSlaConfig(workOrder, slaConfigs);
    const escalationMin1 = matchedSla?.escalation1Minutes ?? 30;
    const escalationMin2 = matchedSla?.escalation2Minutes ?? 60;
    const escalationMin3 = matchedSla?.escalation3Minutes ?? 120;
    const escalationMin4 = matchedSla?.escalation4Minutes ?? 240;
    const reminderInterval = matchedSla?.reminderIntervalMinutes ?? 60;
    const ESCALATION_INTERVALS = [escalationMin1, escalationMin2, escalationMin3, escalationMin4];

    const baseline = toDate(workOrder.started_at) || toDate(workOrder.accepted_at) || toDate(workOrder.created_at) || now;
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - baseline.getTime()) / 60000));
    const currentLevel = Number(workOrder.escalation_level ?? 0) || 0;

    if (currentLevel === 0 && elapsedMinutes < ESCALATION_INTERVALS[0]) {
      continue;
    }

    const nextLevelIdx = ESCALATION_INTERVALS.findIndex(
      (threshold, index) => elapsedMinutes >= threshold && (index + 1) > currentLevel,
    );

    const isNewEscalation = nextLevelIdx >= 0 && (nextLevelIdx + 1) > currentLevel;
    const isReminder = currentLevel > 0 && !isNewEscalation && (elapsedMinutes % reminderInterval < 5);

    if (!isNewEscalation && !isReminder) {
      continue;
    }

    const nextLevel = isNewEscalation ? nextLevelIdx + 1 : currentLevel;
    const escalationMinutes = ESCALATION_INTERVALS[Math.min(nextLevel - 1, ESCALATION_INTERVALS.length - 1)];

    const slaDueAt = workOrder.sla_due_at
      ? toDate(workOrder.sla_due_at)
      : new Date(baseline.getTime() + ESCALATION_INTERVALS[ESCALATION_INTERVALS.length - 1] * 60000);

    if (isNewEscalation) {
      await workOrderRepo
        .createQueryBuilder()
        .update(WorkOrderEntity)
        .set({ escalationLevel: nextLevel, slaDueAt: slaDueAt ?? null })
        .where('id = :id', { id: workOrder.id })
        .execute();

      await activityRepo.save(
        activityRepo.create({
          workOrderId: workOrder.id,
          assetId: workOrder.asset_id,
          plantId: workOrder.plant_id,
          actorUserId: null,
          eventType: ESCALATION_EVENT,
          notes: `Escalated to level ${nextLevel} after ${elapsedMinutes} minutes without closure.`,
          eventMeta: { level: nextLevel, elapsedMinutes, escalationMinutes },
          occurredAt: now,
        }),
      );

      const recipients = uniqueUserIds([workOrder.assigned_to, workOrder.raised_by]);
      const { emails: escalationEmails, userIds: escalationUserIds } = await getEscalationUsers(nextLevel, workOrder.plant_id, matchedSla);
      const allRecipients = uniqueUserIds([...recipients, ...escalationUserIds]);

      if (allRecipients.length > 0) {
        const rows = allRecipients.map((userId) =>
          notificationRepo.create({
            userId,
            title: `Work Order Escalation L${nextLevel}`,
            message: `${workOrder.wo_number} requires attention. Escalation level ${nextLevel} triggered.`,
            type: 'critical',
            link: '/work-orders',
            woId: workOrder.id,
          }),
        );
        await notificationRepo.save(rows);
        allRecipients.forEach((userId) => touchedUsers.add(userId));
      }

      await updateEscalationHistory(
        workOrder.id,
        workOrder.wo_number,
        nextLevel,
        'NOT_CLOSED',
        allRecipients,
        escalationEmails,
      );

      if ((await isMailConfigured()) && escalationEmails.length > 0) {
        const woData: WoNotificationData = {
          woId: workOrder.id,
          woNumber: workOrder.wo_number,
          category: workOrder.category ?? undefined,
          assetId: workOrder.asset_id ?? undefined,
          plantId: workOrder.plant_id ?? undefined,
          priority: workOrder.priority,
          problemDescription: workOrder.problem_description ?? undefined,
          location: workOrder.reported_location ?? undefined,
          escalationLevel: nextLevel,
        };
        await sendWorkOrderEscalationEmails(woData, nextLevel, escalationEmails);
      }
    }

    if (isReminder && currentLevel > 0) {
      const recipients = uniqueUserIds([workOrder.assigned_to, workOrder.raised_by]);
      const { emails: levelEmails, userIds: levelUserIds } = await getEscalationUsers(currentLevel, workOrder.plant_id, matchedSla);
      const { emails: managerEmails, userIds: managerUserIds } = await getEscalationUsers(Math.min(currentLevel + 2, 4), workOrder.plant_id, matchedSla);
      
      const allRecipients = uniqueUserIds([...recipients, ...levelUserIds, ...managerUserIds]);
      const allEmails = Array.from(new Set([...levelEmails, ...managerEmails]));

      const rows = allRecipients.map((userId) =>
        notificationRepo.create({
          userId,
          title: `Work Order Reminder L${currentLevel}`,
          message: `${workOrder.wo_number} is still pending. Reminder ${Math.floor(elapsedMinutes / reminderInterval)} sent.`,
          type: 'warning',
          link: '/work-orders',
          woId: workOrder.id,
        }),
      );
      if (rows.length > 0) {
        await notificationRepo.save(rows);
        allRecipients.forEach((userId) => touchedUsers.add(userId));
      }

      await activityRepo.save(
        activityRepo.create({
          workOrderId: workOrder.id,
          assetId: workOrder.asset_id,
          plantId: workOrder.plant_id,
          actorUserId: null,
          eventType: REMINDER_EVENT,
          notes: `Recurring reminder sent after ${elapsedMinutes} minutes (level ${currentLevel}).`,
          eventMeta: { level: currentLevel, elapsedMinutes, reminderInterval },
          occurredAt: now,
        }),
      );

      if ((await isMailConfigured()) && allEmails.length > 0) {
        const woData: WoNotificationData = {
          woId: workOrder.id,
          woNumber: workOrder.wo_number,
          category: workOrder.category ?? undefined,
          assetId: workOrder.asset_id ?? undefined,
          plantId: workOrder.plant_id ?? undefined,
          priority: workOrder.priority,
          problemDescription: workOrder.problem_description ?? undefined,
          location: workOrder.reported_location ?? undefined,
          escalationLevel: currentLevel,
        };
        await sendWorkOrderReminderEmails(woData, allEmails);
      }
    }
  }

  touchedUsers.forEach((userId) => publishNotificationChange(userId));
}

export async function runMailQueueProcessor(): Promise<void> {
  if (!AppDataSource.isInitialized) return;
  try {
    const result = await processMailQueue(10);
    if (result.sent > 0 || result.failed > 0) {
      logger.info({ sent: result.sent, failed: result.failed }, 'Mail queue processed');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to process mail queue');
  }
}

export function startMailScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('*/1 * * * *', () => {
    void runMailQueueProcessor().catch((error) => {
      logger.error({ error }, 'Mail queue processor failed');
    });
  });

  cron.schedule('*/5 * * * *', () => {
    void runEnhancedEscalationScheduler().catch((error) => {
      logger.error({ error }, 'Enhanced escalation scheduler failed');
    });
  });

  logger.info('Mail and enhanced escalation scheduler started');
}
