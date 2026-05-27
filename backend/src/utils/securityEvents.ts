import { logger } from '../config/logger';
import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { NotificationEntity, PlantEntity, SecurityEventEntity, UserEntity, UserRoleEntity } from '../database/entities';
import { sendEmail } from './mail';
import { normalizeRoleName } from './rbac';

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SecurityStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

type RecordSecurityEventInput = {
  userId?: string | null;
  organizationId?: string | null;
  plantId?: string | null;
  eventType: string;
  severity?: SecuritySeverity;
  status?: SecurityStatus;
  module?: string | null;
  action?: string | null;
  path?: string | null;
  message: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  notify?: boolean;
};

async function resolveAdminRecipients(input: { organizationId?: string | null; plantId?: string | null }) {
  const explicitIds = env.SECURITY_TEAM_USER_IDS
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const roleRepo = AppDataSource.getRepository(UserRoleEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);

  const adminRoleRows = await roleRepo.find({
    where: [
      { role: 'ROOT_ADMIN' },
      { role: 'SUPER_ADMIN' },
      { role: 'PLANT_ADMIN' },
      { role: 'MAINTENANCE_MANAGER' },
    ],
    select: ['userId', 'plantId', 'role'],
  });

  const plantIds = Array.from(new Set(adminRoleRows.map((row) => row.plantId).filter((value): value is string => Boolean(value))));
  const [plants, users] = await Promise.all([
    plantIds.length > 0
      ? plantRepo.find({
          where: plantIds.map((id) => ({ id })),
          select: ['id', 'organizationId'],
        })
      : Promise.resolve([]),
    adminRoleRows.length > 0
      ? userRepo.find({
          where: Array.from(new Set(adminRoleRows.map((row) => row.userId))).map((id) => ({ id, isActive: true })),
          select: ['id', 'email', 'fullName', 'organizationId'],
        })
      : Promise.resolve([]),
  ]);

  const plantOrganizationMap = new Map(plants.map((plant) => [plant.id, plant.organizationId ?? null]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const targetOrganizationId =
    input.organizationId ??
    (input.plantId ? (plantOrganizationMap.get(input.plantId) ?? null) : null);

  const scopedUserIds = adminRoleRows
    .filter((row) => {
      const role = normalizeRoleName(row.role);
      if (role === 'ROOT_ADMIN') {
        return true;
      }

      const user = userById.get(row.userId);
      const rowOrganizationId = user?.organizationId ?? (row.plantId ? (plantOrganizationMap.get(row.plantId) ?? null) : null);

      if (!targetOrganizationId) {
        return Boolean(input.plantId && row.plantId && row.plantId === input.plantId);
      }

      if (rowOrganizationId !== targetOrganizationId) {
        return false;
      }

      if (role === 'SUPER_ADMIN') {
        return true;
      }

      if (input.plantId && row.plantId) {
        return row.plantId === input.plantId;
      }

      return true;
    })
    .map((row) => row.userId);

  const userIds = Array.from(new Set([...explicitIds, ...scopedUserIds]));
  if (userIds.length === 0) {
    return [];
  }

  return users.filter((user) => userIds.includes(user.id));
}

async function resolveExistingUserId(userId?: string | null) {
  if (!userId) return null;
  const user = await AppDataSource.getRepository(UserEntity).findOne({
    where: { id: userId },
    select: ['id'],
  });
  return user?.id ?? null;
}

async function resolveExistingOrganizationId(organizationId?: string | null) {
  if (!organizationId) return null;
  const row = await AppDataSource.query('SELECT id FROM organizations WHERE id = $1 LIMIT 1', [organizationId]);
  return Array.isArray(row) && row.length > 0 ? organizationId : null;
}

export async function recordSecurityEvent(input: RecordSecurityEventInput) {
  logger.warn(
    {
      securityEvent: input.eventType,
      severity: input.severity ?? 'MEDIUM',
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      plantId: input.plantId ?? null,
      path: input.path ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? null,
    },
    input.message,
  );

  if (!AppDataSource.isInitialized) {
    return null;
  }

  try {
    const eventRepo = AppDataSource.getRepository(SecurityEventEntity);
    const [userId, organizationId] = await Promise.all([
      resolveExistingUserId(input.userId ?? null),
      resolveExistingOrganizationId(input.organizationId ?? null),
    ]);
    const event = eventRepo.create({
      userId,
      organizationId,
      plantId: input.plantId ?? null,
      eventType: input.eventType,
      severity: input.severity ?? 'MEDIUM',
      status: input.status ?? 'OPEN',
      module: input.module ?? 'SECURITY',
      action: input.action ?? null,
      path: input.path ?? null,
      message: input.message,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
    await eventRepo.save(event);

    if (input.notify && ['HIGH', 'CRITICAL'].includes(event.severity)) {
      const recipients = await resolveAdminRecipients({
        organizationId: input.organizationId ?? null,
        plantId: input.plantId ?? null,
      });
      if (recipients.length > 0) {
        const notificationRepo = AppDataSource.getRepository(NotificationEntity);
        await notificationRepo.save(
          recipients.map((recipient) =>
            notificationRepo.create({
              userId: recipient.id,
              title: `Security alert: ${event.eventType}`,
              message: input.message,
              type: 'security',
              isRead: false,
              link: '/security-center',
              woId: null,
            }),
          ),
        );

        const envAlertEmails = env.SECURITY_ALERT_EMAILS
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const emails = Array.from(new Set([...envAlertEmails, ...recipients.map((recipient) => recipient.email).filter(Boolean)]));
        await sendEmail({
          to: emails,
          subject: `[CMMS Security] ${event.severity} ${event.eventType}`,
          text: [
            `Security event detected in CMMS.`,
            `Type: ${event.eventType}`,
            `Severity: ${event.severity}`,
            `Message: ${event.message}`,
            `Path: ${event.path ?? 'n/a'}`,
            `IP: ${event.ipAddress ?? 'n/a'}`,
            `User ID: ${event.userId ?? 'n/a'}`,
          ].join('\n'),
        });
      }
    }

    return event;
  } catch (error) {
    logger.error(
      {
        error,
        securityEvent: input.eventType,
      },
      'Failed to persist security event; continuing without blocking request',
    );
    return null;
  }
}
