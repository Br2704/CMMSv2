import cron from 'node-cron';
import { logger } from '../../config/logger';
import { AppDataSource } from '../../database/data-source';
import { NotificationEntity, WorkOrderActivityLogEntity, WorkOrderEntity, SlaConfigEntity } from '../../database/entities';
import { publishNotificationChange } from '../notifications/notification-stream';

const USER_VERIFICATION_STATUS = 'USER_VERIFICATION';
const CLOSED_STATUS = 'CLOSED';
const CANCELLED_STATUS = 'CANCELLED';
const IN_PROGRESS_STATUS = 'IN_PROGRESS';
const ACCEPTED_STATUS = 'ACCEPTED';
const RAISED_STATUS = 'RAISED';
const ASSIGNED_STATUS = 'ASSIGNED';
const OPENED_STATUS = 'OPENED';
const ESCALATION_EVENT = 'WORK_ORDER_ESCALATED';
const ESCALATION_INTERVALS = [30, 60, 90];
const REMINDER_6H_EVENT = 'USER_VERIFICATION_REMINDER_6H';
const REMINDER_24H_EVENT = 'USER_VERIFICATION_REMINDER_24H';
const AUTO_CLOSED_EVENT = 'AUTO_CLOSED_SLA';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let schedulerStarted = false;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uniqueUserIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
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
    const cat = wo.category;
    const categoryConfig = configs.find(c => c.scope === 'CATEGORY' && c.scopeValue?.toUpperCase() === cat.toUpperCase() && c.priority === wo.priority);
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

async function runWorkOrderEscalationScheduler() {
  if (!AppDataSource.isInitialized) {
    return;
  }

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
    .addSelect('wo.asset_id', 'asset_id')
    .addSelect('wo.plant_id', 'plant_id')
    .addSelect('wo.category', 'category')
    .addSelect('wo.priority', 'priority')
    .addSelect('wo.raised_by', 'raised_by')
    .addSelect('wo.assigned_to', 'assigned_to')
    .addSelect('wo.opened_at', 'opened_at')
    .addSelect('wo.accepted_at', 'accepted_at')
    .addSelect('wo.started_at', 'started_at')
    .addSelect('wo.created_at', 'created_at')
    .addSelect('wo.escalation_level', 'escalation_level')
    .addSelect('wo.sla_due_at', 'sla_due_at')
    .from('work_orders', 'wo')
    .where('wo.status IN (:...statuses)', { 
      statuses: [
        RAISED_STATUS, 
        ASSIGNED_STATUS, 
        OPENED_STATUS, 
        ACCEPTED_STATUS, 
        IN_PROGRESS_STATUS
      ] 
    })
    .getRawMany<{
      id: string;
      wo_number: string;
      asset_id: string | null;
      plant_id: string | null;
      category: string | null;
      priority: string;
      raised_by: string | null;
      assigned_to: string | null;
      opened_at: string | Date | null;
      accepted_at: string | Date | null;
      started_at: string | Date | null;
      created_at: string | Date;
      escalation_level: number | null;
      sla_due_at: string | Date | null;
    }>();

  if (candidates.length === 0) {
    return;
  }

  const now = new Date();
  const touchedUsers = new Set<string>();

  for (const workOrder of candidates) {
    const matchedSla = findSlaConfig(workOrder, slaConfigs);
    if (!matchedSla) {
      continue;
    }

    const escalationMin1 = matchedSla?.escalation1Minutes ?? 30;
    const escalationMin2 = matchedSla?.escalation2Minutes ?? 60;
    const escalationMin3 = matchedSla?.escalation3Minutes ?? 120;
    const escalationMin4 = matchedSla?.escalation4Minutes ?? 240;
    const ESCALATION_INTERVALS = [escalationMin1, escalationMin2, escalationMin3, escalationMin4];

    const baseline = toDate(workOrder.opened_at) || toDate(workOrder.started_at) || toDate(workOrder.accepted_at) || toDate(workOrder.created_at) || now;
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - baseline.getTime()) / 60000));
    const currentLevel = Number(workOrder.escalation_level ?? 0) || 0;
    
    const nextLevel = ESCALATION_INTERVALS.findIndex((threshold, index) => elapsedMinutes >= threshold && index + 1 > currentLevel) + 1;

    if (nextLevel <= 0 || nextLevel <= currentLevel) {
      continue;
    }

    const escalationMinutes = ESCALATION_INTERVALS.at(nextLevel - 1) ?? 0;
    const slaDueAt = workOrder.sla_due_at ? toDate(workOrder.sla_due_at) : new Date(baseline.getTime() + (ESCALATION_INTERVALS.at(-1) ?? 0) * 60000);

    await workOrderRepo
      .createQueryBuilder()
      .update(WorkOrderEntity)
      .set({
        escalationLevel: nextLevel,
        slaDueAt: slaDueAt ?? null,
      })
      .where('id = :id', { id: workOrder.id })
      .execute();

    await activityRepo.save(
      activityRepo.create({
        workOrderId: workOrder.id,
        assetId: workOrder.asset_id,
        plantId: workOrder.plant_id,
        actorUserId: null,
        eventType: ESCALATION_EVENT,
        notes: `Escalated to level ${nextLevel} after ${escalationMinutes} minutes without closure.`,
        eventMeta: {
          level: nextLevel,
          elapsedMinutes,
          escalationMinutes,
          slaDueAt: slaDueAt?.toISOString() ?? null,
        },
        occurredAt: now,
      }),
    );

    const recipients = uniqueUserIds([workOrder.assigned_to, workOrder.raised_by]);
    if (recipients.length > 0) {
      const rows = recipients.map((userId) =>
        notificationRepo.create({
          userId,
          title: `Work Order Escalation L${nextLevel}`,
          message: `${workOrder.wo_number} requires attention. Escalation level ${nextLevel} triggered after ${escalationMinutes} minutes.`,
          type: 'critical',
          link: '/work-orders',
          woId: workOrder.id,
        }),
      );
      await notificationRepo.save(rows);
      recipients.forEach((userId) => touchedUsers.add(userId));
    }
  }

  touchedUsers.forEach((userId) => publishNotificationChange(userId));
}

async function runUserVerificationSlaScheduler() {
  if (!AppDataSource.isInitialized) {
    return;
  }

  const manager = AppDataSource.manager;
  const workOrderRepo = manager.getRepository(WorkOrderEntity);
  const activityRepo = manager.getRepository(WorkOrderActivityLogEntity);
  const notificationRepo = manager.getRepository(NotificationEntity);

  const pending = await manager
    .createQueryBuilder()
    .select('wo.id', 'id')
    .addSelect('wo.wo_number', 'wo_number')
    .addSelect('wo.asset_id', 'asset_id')
    .addSelect('wo.plant_id', 'plant_id')
    .addSelect('wo.raised_by', 'raised_by')
    .addSelect('wo.assigned_to', 'assigned_to')
    .addSelect('wo.submitted_for_approval_at', 'submitted_for_approval_at')
    .from('work_orders', 'wo')
    .where('wo.status = :status', { status: USER_VERIFICATION_STATUS })
    .andWhere('wo.submitted_for_approval_at IS NOT NULL')
    .getRawMany<{
      id: string;
      wo_number: string;
      asset_id: string | null;
      plant_id: string | null;
      raised_by: string | null;
      assigned_to: string | null;
      submitted_for_approval_at: string | Date;
    }>();

  if (pending.length === 0) {
    return;
  }

  const workOrderIds = pending.map((row) => row.id);
  const history = await activityRepo
    .createQueryBuilder('log')
    .select(['log.work_order_id AS work_order_id', 'log.event_type AS event_type'])
    .where('log.work_order_id IN (:...workOrderIds)', { workOrderIds })
    .andWhere('log.event_type IN (:...eventTypes)', {
      eventTypes: [REMINDER_6H_EVENT, REMINDER_24H_EVENT, AUTO_CLOSED_EVENT],
    })
    .getRawMany<{ work_order_id: string; event_type: string }>();

  const seenEvents = new Map<string, Set<string>>();
  for (const row of history) {
    const set = seenEvents.get(row.work_order_id) ?? new Set<string>();
    set.add(String(row.event_type));
    seenEvents.set(row.work_order_id, set);
  }

  const touchedUsers = new Set<string>();
  const now = new Date();

  for (const workOrder of pending) {
    const submittedAt = toDate(workOrder.submitted_for_approval_at);
    if (!submittedAt) {
      continue;
    }

    const elapsedMs = now.getTime() - submittedAt.getTime();
    if (elapsedMs < SIX_HOURS_MS) {
      continue;
    }

    const events = seenEvents.get(workOrder.id) ?? new Set<string>();

    if (elapsedMs < TWENTY_FOUR_HOURS_MS && !events.has(REMINDER_6H_EVENT)) {
      const recipients = uniqueUserIds([workOrder.raised_by]);
      if (recipients.length > 0) {
        const rows = recipients.map((userId) =>
          notificationRepo.create({
            userId,
            title: 'Work Order Verification Reminder',
            message: `${workOrder.wo_number} is awaiting your verification. Please confirm closure.`,
            type: 'warning',
            link: '/work-orders',
            woId: workOrder.id,
          }),
        );
        await notificationRepo.save(rows);
        recipients.forEach((userId) => touchedUsers.add(userId));
      }

      await activityRepo.save(
        activityRepo.create({
          workOrderId: workOrder.id,
          assetId: workOrder.asset_id,
          plantId: workOrder.plant_id,
          actorUserId: null,
          eventType: REMINDER_6H_EVENT,
          notes: 'Automated reminder sent 6 hours after completion.',
          eventMeta: {
            elapsedHours: 6,
          },
          occurredAt: now,
        }),
      );
      events.add(REMINDER_6H_EVENT);
    }

    if (elapsedMs < TWENTY_FOUR_HOURS_MS || events.has(AUTO_CLOSED_EVENT)) {
      continue;
    }

    const recipients = uniqueUserIds([workOrder.raised_by]);
    if (!events.has(REMINDER_24H_EVENT) && recipients.length > 0) {
      const rows = recipients.map((userId) =>
        notificationRepo.create({
          userId,
          title: 'Final Verification Reminder',
          message: `${workOrder.wo_number} reached the 24h verification SLA and will be auto-closed.`,
          type: 'critical',
          link: '/work-orders',
          woId: workOrder.id,
        }),
      );
      await notificationRepo.save(rows);
      recipients.forEach((userId) => touchedUsers.add(userId));

      await activityRepo.save(
        activityRepo.create({
          workOrderId: workOrder.id,
          assetId: workOrder.asset_id,
          plantId: workOrder.plant_id,
          actorUserId: null,
          eventType: REMINDER_24H_EVENT,
          notes: 'Automated reminder sent at SLA threshold.',
          eventMeta: {
            elapsedHours: 24,
          },
          occurredAt: now,
        }),
      );
      events.add(REMINDER_24H_EVENT);
    }

    const autoCloseTime = new Date().toISOString();
    const updateResult = await workOrderRepo
      .createQueryBuilder()
      .update(WorkOrderEntity)
      .set({
        status: CLOSED_STATUS,
        closedAt: new Date(autoCloseTime),
        approvedBy: null,
        approvedAt: null,
        approvalComments: 'Auto-closed by SLA after 24 hours without raiser confirmation.',
      })
      .where('id = :id', { id: workOrder.id })
      .andWhere('status = :status', { status: USER_VERIFICATION_STATUS })
      .execute();

    if (!updateResult.affected) {
      continue;
    }

    await activityRepo.save(
      activityRepo.create({
        workOrderId: workOrder.id,
        assetId: workOrder.asset_id,
        plantId: workOrder.plant_id,
        actorUserId: null,
        eventType: AUTO_CLOSED_EVENT,
        notes: 'Work order auto-closed by SLA policy after 24 hours without raiser response.',
        eventMeta: {
          slaHours: 24,
        },
        occurredAt: new Date(autoCloseTime),
      }),
    );

    const autoCloseRecipients = uniqueUserIds([workOrder.raised_by, workOrder.assigned_to]);
    if (autoCloseRecipients.length > 0) {
      const rows = autoCloseRecipients.map((userId) =>
        notificationRepo.create({
          userId,
          title: 'Work Order Auto-Closed',
          message: `${workOrder.wo_number} was auto-closed after the 24h verification SLA elapsed.`,
          type: 'info',
          link: '/work-orders',
          woId: workOrder.id,
        }),
      );
      await notificationRepo.save(rows);
      autoCloseRecipients.forEach((userId) => touchedUsers.add(userId));
    }
  }

  touchedUsers.forEach((userId) => {
    publishNotificationChange(userId);
  });
}

export function startWorkOrdersScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  // Disabled: The default work order escalation and verification schedulers 
  // were sending SLA and escalation notifications unconditionally.
  // Escalations are now strictly managed by the enhanced mail-scheduler 
  // which properly respects configured SLA rules.

  logger.info('Legacy work order verification schedulers have been disabled in favor of rule-based escalation');
}
