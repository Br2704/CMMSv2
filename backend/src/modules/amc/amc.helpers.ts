// @ts-nocheck
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { EntityManager, In } from 'typeorm';
import { env } from '../../config/env';
import { AppDataSource } from '../../database/data-source';
import {
  AmcContractEntity,
  AmcContractMachineEntity,
  AmcServiceReportEntity,
  AmcVisitScheduleEntity,
  AssetEntity,
  NotificationEntity,
  PlantEntity,
  UserEntity,
  UserRoleEntity,
  VendorEntity,
  VendorNotificationSettingEntity,
  VendorUserMappingEntity,
  WorkOrderEntity,
} from '../../database/entities';

const ACTIVE_CONTRACT_STATUSES = new Set(['ACTIVE', 'RENEWAL_DUE']);
const INTERNAL_NOTIFICATION_ROLES = [
  'PLANT_ADMIN',
  'PLANT_ADMIN',
  'MAINTENANCE_MANAGER',
  'MAINTENANCE_USER',
  'CALIBRATION_USER',
  'SCM_USER',
  'PRODUCTION_USER',
  'SUPER_ADMIN',
];

export const DEFAULT_AMC_NOTIFICATION_SETTINGS = {
  notifyEmail: true,
  notifyInApp: true,
  notifyOnVisitScheduled: true,
  notifyOnBreakdown: true,
  notifyOnRenewal: true,
  notifyOnServiceReportSubmitted: true,
  notifyOnServiceReportVerified: true,
  escalationEmails: [] as string[],
  notifyBeforeDays: [30, 15, 7, 0],
} satisfies NonNullable<AmcContractEntity['notificationSettings']>;

export function normalizeAmcMachineGroups(value: AmcContractEntity['machineGroups']) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((group) => ({
      id: String(group?.id ?? '').trim(),
      name: String(group?.name ?? '').trim(),
      groupType: String(group?.groupType ?? 'CUSTOM').toUpperCase() === 'MODULE' ? 'MODULE' : 'CUSTOM',
      moduleIds: Array.isArray(group?.moduleIds) ? group.moduleIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
      assetIds: Array.isArray(group?.assetIds) ? group.assetIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
      description: typeof group?.description === 'string' && group.description.trim().length > 0 ? group.description.trim() : null,
    }))
    .filter((group) => group.id && group.name);
}

export function normalizeAmcNotificationSettings(value: AmcContractEntity['notificationSettings']) {
  const input = value ?? {};
  return {
    ...DEFAULT_AMC_NOTIFICATION_SETTINGS,
    notifyEmail: input.notifyEmail !== false,
    notifyInApp: input.notifyInApp !== false,
    notifyOnVisitScheduled: input.notifyOnVisitScheduled !== false,
    notifyOnBreakdown: input.notifyOnBreakdown !== false,
    notifyOnRenewal: input.notifyOnRenewal !== false,
    notifyOnServiceReportSubmitted: input.notifyOnServiceReportSubmitted !== false,
    notifyOnServiceReportVerified: input.notifyOnServiceReportVerified !== false,
    escalationEmails: Array.isArray(input.escalationEmails)
      ? Array.from(new Set(input.escalationEmails.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().toLowerCase())))
      : [],
    notifyBeforeDays: Array.isArray(input.notifyBeforeDays)
      ? Array.from(new Set(input.notifyBeforeDays.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0))).sort((a, b) => b - a)
      : [...DEFAULT_AMC_NOTIFICATION_SETTINGS.notifyBeforeDays],
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function todayDateString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

export function normalizeDateString(value: string | Date) {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return value;
}

function toUtcDate(value: string | Date) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value: Date, days: number) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function frequencyStep(frequency: string) {
  switch (frequency.trim().toUpperCase()) {
    case 'DAILY':
      return { days: 1 };
    case 'WEEKLY':
      return { days: 7 };
    case 'MONTHLY':
      return { months: 1 };
    case 'QUARTERLY':
      return { months: 3 };
    case 'HALF_YEARLY':
      return { months: 6 };
    case 'YEARLY':
      return { months: 12 };
    default:
      return { months: 1 };
  }
}

export function generateVisitDates(startDate: string, endDate: string, visitFrequency: string) {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  const step = frequencyStep(visitFrequency);

  while (cursor.getTime() <= end.getTime() && guard < 500) {
    dates.push(normalizeDateString(cursor));
    cursor = step.days ? addDays(cursor, step.days) : addMonths(cursor, step.months ?? 1);
    guard += 1;
  }

  return dates;
}

export function generateAmcContractNumber() {
  const now = new Date();
  return `AMC-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generateWorkOrderNumber() {
  const now = new Date();
  return `WO-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function sendMail(to: string[], subject: string, message: string) {
  if (!env.SMTP_HOST || !env.SMTP_FROM || to.length === 0) {
    return { sent: false as const, reason: 'smtp_not_configured_or_no_recipients' };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: to.join(','),
    subject,
    text: message,
  });

  return { sent: true as const };
}

export async function resolveVendorIdsForUser(userId: string, email?: string | null) {
  const mappingRepo = AppDataSource.getRepository(VendorUserMappingEntity);
  const vendorRepo = AppDataSource.getRepository(VendorEntity);

  const mappings = await mappingRepo.find({ where: { userId } });
  const mappedVendorIds = mappings.map((row) => row.vendorId);
  if (mappedVendorIds.length > 0) {
    return Array.from(new Set(mappedVendorIds));
  }

  if (!email) {
    return [];
  }

  const vendors = await vendorRepo.find({
    where: { email: email.trim().toLowerCase() },
    select: ['id'],
  });
  return vendors.map((vendor) => vendor.id);
}

async function buildNotificationBundle(
  vendorId: string,
  plantId: string | null,
  preferences?: Pick<
    ReturnType<typeof normalizeAmcNotificationSettings>,
    'notifyEmail' | 'notifyInApp' | 'escalationEmails'
  >,
) {
  const mappingRepo = AppDataSource.getRepository(VendorUserMappingEntity);
  const settingsRepo = AppDataSource.getRepository(VendorNotificationSettingEntity);
  const vendorRepo = AppDataSource.getRepository(VendorEntity);
  const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);

  const [vendor, settings, vendorMappings, internalRoleRows, notificationPlant] = await Promise.all([
    vendorRepo.findOneBy({ id: vendorId }),
    settingsRepo.findOne({
      where: [{ vendorId, plantId }, { vendorId, plantId: null }],
      order: { plantId: 'DESC' },
    }),
    mappingRepo.find({ where: { vendorId } }),
    userRoleRepo.find({
      where: [
        { role: In(INTERNAL_NOTIFICATION_ROLES.filter((role) => role !== 'SUPER_ADMIN')), plantId: plantId ?? undefined },
        { role: 'SUPER_ADMIN' },
      ],
    }),
    plantId
      ? plantRepo.findOne({
          where: { id: plantId },
          select: ['id', 'organizationId'],
        })
      : Promise.resolve(null),
  ]);

  const notificationOrganizationId = notificationPlant?.organizationId ?? null;
  const candidateInternalUserIds = Array.from(
    new Set(
      internalRoleRows
        .filter((row) => row.role === 'SUPER_ADMIN' || !plantId || row.plantId === plantId || row.plantId === null)
        .map((row) => row.userId),
    ),
  );
  const notifyInApp = preferences?.notifyInApp ?? settings?.notifyInApp !== false;
  const notifyEmail = preferences?.notifyEmail ?? settings?.notifyEmail !== false;
  const vendorUserIds = notifyInApp ? vendorMappings.map((row) => row.userId) : [];
  const allUserIds = Array.from(new Set([...candidateInternalUserIds, ...vendorUserIds]));
  const users = allUserIds.length > 0
    ? await userRepo.find({
        where: { id: In(allUserIds), isActive: true },
        select: ['id', 'email', 'organizationId'],
      })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  const internalUserIds = notifyInApp
    ? candidateInternalUserIds.filter((userId) => {
        if (!notificationOrganizationId) {
          return userById.has(userId);
        }
        const user = userById.get(userId);
        return Boolean(user && user.organizationId === notificationOrganizationId);
      })
    : [];
  const internalEmails = notifyEmail
    ? internalUserIds.map((userId) => userById.get(userId)?.email).filter((value): value is string => Boolean(value))
    : [];
  const vendorEmails = notifyEmail
    ? [vendor?.email ?? null, ...(settings?.contactEmails ?? []), ...(preferences?.escalationEmails ?? [])].filter((value): value is string => Boolean(value))
    : [];

  return {
    userIds: Array.from(new Set([...internalUserIds, ...vendorUserIds])).filter((userId) => userById.has(userId)),
    emailRecipients: Array.from(new Set([...internalEmails, ...vendorEmails])),
  };
}

export async function sendAmcNotification(params: {
  vendorId: string;
  plantId: string | null;
  title: string;
  message: string;
  emailSubject: string;
  emailBody: string;
  link?: string | null;
  woId?: string | null;
  preferences?: Pick<
    ReturnType<typeof normalizeAmcNotificationSettings>,
    'notifyEmail' | 'notifyInApp' | 'escalationEmails'
  >;
}) {
  const notificationRepo = AppDataSource.getRepository(NotificationEntity);
  const bundle = await buildNotificationBundle(params.vendorId, params.plantId, params.preferences);

  if (bundle.userIds.length > 0) {
    const rows = bundle.userIds.map((userId) =>
      notificationRepo.create({
        userId,
        title: params.title,
        message: params.message,
        type: 'info',
        isRead: false,
        link: params.link ?? '/amc',
        woId: params.woId ?? null,
      }),
    );
    await notificationRepo.save(rows);
  }

  if (bundle.emailRecipients.length > 0) {
    await sendMail(bundle.emailRecipients, params.emailSubject, params.emailBody);
  }
}

export async function syncContractSchedules(
  manager: EntityManager,
  input: {
    contractId: string;
    vendorId: string;
    assetIds: string[];
    startDate: string;
    endDate: string;
    visitFrequency: string;
    status: string;
  },
) {
  const contractMachineRepo = manager.getRepository(AmcContractMachineEntity);
  const visitRepo = manager.getRepository(AmcVisitScheduleEntity);
  const uniqueAssetIds = Array.from(new Set(input.assetIds));

  await contractMachineRepo.delete({ contractId: input.contractId });
  if (uniqueAssetIds.length > 0) {
    await contractMachineRepo.save(
      uniqueAssetIds.map((assetId) =>
        contractMachineRepo.create({
          contractId: input.contractId,
          assetId,
        }),
      ),
    );
  }

  const existingVisits = await visitRepo.find({ where: { contractId: input.contractId } });
  const frozenVisitIds = existingVisits
    .filter((row) => ['COMPLETED', 'REPORTED', 'VERIFIED', 'REJECTED'].includes(row.status) || Boolean(row.serviceTaskId))
    .map((row) => row.id);

  const removableVisitIds = existingVisits
    .filter((row) => !frozenVisitIds.includes(row.id))
    .map((row) => row.id);
  if (removableVisitIds.length > 0) {
    await visitRepo.delete(removableVisitIds);
  }

  if (!ACTIVE_CONTRACT_STATUSES.has(input.status.trim().toUpperCase()) || uniqueAssetIds.length === 0) {
    return;
  }

  const visitDates = generateVisitDates(input.startDate, input.endDate, input.visitFrequency);
  const remainingVisits = await visitRepo.find({ where: { contractId: input.contractId } });
  const existingKeys = new Set(remainingVisits.map((row) => `${row.assetId}:${row.visitDate}`));

  const inserts = uniqueAssetIds.flatMap((assetId) =>
    visitDates
      .filter((visitDate) => !existingKeys.has(`${assetId}:${visitDate}`))
      .map((visitDate) =>
        visitRepo.create({
          id: randomUUID(),
          contractId: input.contractId,
          assetId,
          vendorId: input.vendorId,
          visitDate,
          status: 'SCHEDULED',
          serviceTaskId: null,
          notificationSentAt: null,
        }),
      ),
  );

  if (inserts.length > 0) {
    await visitRepo.save(inserts);
  }
}

export async function findActiveAmcContractForAsset(assetId: string, onDate = todayDateString()) {
  const contractMachineRepo = AppDataSource.getRepository(AmcContractMachineEntity);
  const mapping = await contractMachineRepo
    .createQueryBuilder('machine')
    .innerJoinAndSelect('machine.contract', 'contract')
    .where('machine.asset_id = :assetId', { assetId })
    .andWhere('contract.start_date <= :onDate', { onDate })
    .andWhere('contract.end_date >= :onDate', { onDate })
    .andWhere('contract.status IN (:...statuses)', { statuses: Array.from(ACTIVE_CONTRACT_STATUSES) })
    .orderBy('contract.endDate', 'ASC')
    .getOne();

  return mapping?.contract ?? null;
}

export async function ensureVisitServiceTask(scheduleId: string) {
  return AppDataSource.transaction(async (manager) => {
    const visitRepo = manager.getRepository(AmcVisitScheduleEntity);
    const workOrderRepo = manager.getRepository(WorkOrderEntity);
    const assetRepo = manager.getRepository(AssetEntity);
    const contractRepo = manager.getRepository(AmcContractEntity);

    const schedule = await visitRepo.findOneBy({ id: scheduleId });
    if (!schedule) {
      return null;
    }
    if (schedule.serviceTaskId) {
      return schedule.serviceTaskId;
    }

    const [asset, contract] = await Promise.all([
      assetRepo.findOneBy({ id: schedule.assetId }),
      contractRepo.findOneBy({ id: schedule.contractId }),
    ]);
    if (!asset || !contract) {
      return null;
    }

    const workOrder = workOrderRepo.create({
      woNumber: generateWorkOrderNumber(),
      assetId: schedule.assetId,
      category: 'AMC_SERVICE',
      priority: 'MEDIUM',
      status: 'RAISED',
      problemDescription: `Scheduled AMC visit for ${asset.name} under ${contract.contractName ?? contract.contractNumber}.`,
      raisedBy: null,
      assignedTo: null,
      openedAt: new Date(),
      closedAt: null,
      startedAt: null,
      resolvedAt: null,
      downtimeStartAt: null,
      downtimeEndAt: null,
      isFailureEvent: false,
      rootCause: null,
      actionTaken: null,
      downtimeMinutes: 0,
      operatorFault: false,
      remarks: `Auto-generated from AMC visit schedule on ${schedule.visitDate}.`,
      plantId: contract.plantId,
      woType: 'AMC_SERVICE',
      reportedLocation: asset.location,
      failureCode: null,
      subCategory: 'AMC_VISIT',
      laborHours: '0',
      estimatedCost: contract.contractValue ?? contract.amount ?? '0',
      actualCost: '0',
      vendorId: schedule.vendorId,
      warrantyClaim: false,
      safetyRelated: false,
      partsReplaced: null,
      spareConsumption: null,
      followUpRequired: false,
      followUpNotes: null,
      version: 1,
    });
    await workOrderRepo.save(workOrder);

    schedule.serviceTaskId = workOrder.id;
    schedule.status = 'TASK_CREATED';
    await visitRepo.save(schedule);

    return workOrder.id;
  });
}

export async function notifyBreakdownWorkOrderRaised(workOrderId: string) {
  const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const workOrder = await workOrderRepo.findOneBy({ id: workOrderId });
  if (!workOrder) {
    return false;
  }

  const workOrderType = String(workOrder.woType ?? '').toUpperCase();
  const category = String(workOrder.category ?? '').toUpperCase();
  if (workOrderType !== 'BREAKDOWN' && category !== 'BREAKDOWN') {
    return false;
  }

  const contract = await findActiveAmcContractForAsset(workOrder.assetId);
  if (!contract) {
    return false;
  }
  const notificationSettings = normalizeAmcNotificationSettings(contract.notificationSettings);
  if (!notificationSettings.notifyOnBreakdown) {
    return false;
  }

  const asset = await assetRepo.findOneBy({ id: workOrder.assetId });
  const subject = `[CMMS] AMC breakdown request for ${asset?.name ?? workOrder.assetId}`;
  const message = `Breakdown work order ${workOrder.woNumber} has been raised for AMC-covered asset ${asset?.name ?? workOrder.assetId}.`;
  const emailBody = [
    'AMC-covered asset breakdown',
    `Work order: ${workOrder.woNumber}`,
    `Asset: ${asset?.name ?? workOrder.assetId}`,
    `Description: ${workOrder.problemDescription}`,
    `Raised at: ${normalizeDateString(new Date())}`,
  ].join('\n');

  await sendAmcNotification({
    vendorId: contract.vendorId,
    plantId: contract.plantId,
    title: 'AMC Breakdown Service Request',
    message,
    emailSubject: subject,
    emailBody,
    link: '/work-orders',
    woId: workOrder.id,
    preferences: notificationSettings,
  });

  return true;
}

async function notifyUpcomingVisit(
  schedule: AmcVisitScheduleEntity,
  contractInput?: AmcContractEntity | null,
  notificationInput?: ReturnType<typeof normalizeAmcNotificationSettings>,
) {
  const contractRepo = AppDataSource.getRepository(AmcContractEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
  const [contract, asset] = await Promise.all([
    contractInput ? Promise.resolve(contractInput) : contractRepo.findOneBy({ id: schedule.contractId }),
    assetRepo.findOneBy({ id: schedule.assetId }),
  ]);
  if (!contract || !asset) {
    return;
  }
  const notificationSettings = notificationInput ?? normalizeAmcNotificationSettings(contract.notificationSettings);
  if (!notificationSettings.notifyOnVisitScheduled) {
    return;
  }

  const title = `AMC Visit Scheduled - ${asset.name}`;
  const message = `AMC visit is scheduled for ${asset.name} on ${schedule.visitDate}.`;
  const emailSubject = `[CMMS] AMC visit scheduled for ${asset.name}`;
  const emailBody = [
    `Contract: ${contract.contractName ?? contract.contractNumber}`,
    `Asset: ${asset.name}`,
    `Visit date: ${schedule.visitDate}`,
    `Frequency: ${contract.visitFrequency ?? '-'}`,
  ].join('\n');

  await sendAmcNotification({
    vendorId: schedule.vendorId,
    plantId: contract.plantId,
    title,
    message,
    emailSubject,
    emailBody,
    link: '/amc',
    woId: schedule.serviceTaskId,
    preferences: notificationSettings,
  });

  schedule.notificationSentAt = new Date();
  schedule.status = schedule.serviceTaskId ? 'TASK_CREATED' : 'NOTIFIED';
  await visitRepo.save(schedule);
}

export async function runAmcSchedulerTick() {
  const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
  const contractRepo = AppDataSource.getRepository(AmcContractEntity);
  const allVisits = await visitRepo.find();
  const contractIds = Array.from(new Set(allVisits.map((visit) => visit.contractId)));
  const contracts = contractIds.length > 0 ? await contractRepo.find({ where: { id: In(contractIds) } }) : [];
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
  const today = toUtcDate(todayDateString());
  const dayMs = 24 * 60 * 60 * 1000;

  for (const visit of allVisits) {
    if (['COMPLETED', 'CANCELLED'].includes(visit.status)) {
      continue;
    }

    const visitTime = toUtcDate(visit.visitDate).getTime();
    const contract = contractMap.get(visit.contractId) ?? null;
    const notificationSettings = normalizeAmcNotificationSettings(contract?.notificationSettings ?? null);
    const diffDays = Math.floor((visitTime - today.getTime()) / dayMs);
    if (
      !visit.notificationSentAt &&
      notificationSettings.notifyOnVisitScheduled &&
      diffDays >= 0 &&
      notificationSettings.notifyBeforeDays.some((day) => diffDays <= day)
    ) {
      await notifyUpcomingVisit(visit, contract, notificationSettings);
    }

    if (visitTime <= today.getTime() && !visit.serviceTaskId) {
      await ensureVisitServiceTask(visit.id);
    }
  }
}

export function calculateSlaFromWorkOrder(workOrder: WorkOrderEntity | null, serviceDate: string) {
  const serviceAt = new Date(`${serviceDate}T00:00:00.000Z`);
  if (!workOrder) {
    return {
      responseTimeMinutes: null,
      resolutionTimeMinutes: null,
    };
  }

  const startedAt = workOrder.startedAt ?? workOrder.openedAt ?? serviceAt;
  const resolvedAt = workOrder.resolvedAt ?? workOrder.closedAt ?? serviceAt;
  const createdAt = workOrder.createdAt ?? serviceAt;

  return {
    responseTimeMinutes: Math.max(0, Math.round((startedAt.getTime() - createdAt.getTime()) / 60000)),
    resolutionTimeMinutes: Math.max(0, Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000)),
  };
}

export async function updateVisitStatusFromReports(manager: EntityManager, visitScheduleId: string) {
  const reportRepo = manager.getRepository(AmcServiceReportEntity);
  const visitRepo = manager.getRepository(AmcVisitScheduleEntity);
  const [report, visit] = await Promise.all([
    reportRepo.findOne({
      where: { visitScheduleId },
      order: { createdAt: 'DESC' },
    }),
    visitRepo.findOneBy({ id: visitScheduleId }),
  ]);
  if (!report || !visit) {
    return;
  }

  visit.status = report.verificationStatus === 'VERIFIED' ? 'COMPLETED' : 'REPORTED';
  await visitRepo.save(visit);
}
