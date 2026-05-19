import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { NotificationEntity, PlantEntity, ProfileEntity, UserEntity, UserRoleEntity, WorkOrderEntity, PushSubscriptionEntity, NotificationSettingsEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission, requireRole } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { ok } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { normalizeRoleName } from '../../utils/rbac';
import { publishNotificationChange, subscribeNotificationStream } from './notification-stream';
import { sendPushNotification, getVapidPublicKey } from '../../services/push.service';

const notificationSchema = z.object({
  userId: z.string().uuid().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default('info'),
  link: z.string().nullable().optional(),
  woId: z.string().uuid().nullable().optional(),
});

const byRoleSchema = z.object({
  role: z.string().min(1),
  plantId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default('info'),
  link: z.string().nullable().optional(),
  woId: z.string().uuid().nullable().optional(),
});

const broadcastSchema = z.object({
  roles: z.array(z.string().min(1)).optional(),
  plantId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  userIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default('info'),
  link: z.string().nullable().optional(),
  woId: z.string().uuid().nullable().optional(),
  category: z.string().optional(),
  groupKey: z.string().optional(),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/notifications/vapid-key', async (_req, res) => {
  res.json(ok({ publicKey: getVapidPublicKey() }));
});

notificationsRouter.post('/notifications/push-subscribe', validateRequest({ body: pushSubscriptionSchema }), async (req, res, next) => {
  try {
    const body = req.body;
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    
    let sub = await repo.findOneBy({ userId: req.auth!.userId, endpoint: body.endpoint });
    if (!sub) {
      sub = repo.create({
        userId: req.auth!.userId,
        endpoint: body.endpoint,
        keys: body.keys,
        userAgent: req.headers['user-agent'] || null,
      });
    } else {
      sub.keys = body.keys;
      sub.lastUsedAt = new Date();
    }
    
    await repo.save(sub);
    res.json(ok({ subscribed: true }, 'Push subscription saved'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/notifications/push-unsubscribe', validateRequest({ body: z.object({ endpoint: z.string().url() }) }), async (req, res, next) => {
  try {
    const body = req.body as { endpoint: string };
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    await repo.delete({ userId: req.auth!.userId, endpoint: body.endpoint });
    res.json(ok({ unsubscribed: true }, 'Push subscription removed'));
  } catch (error) {
    next(error);
  }
});

function normalizeNotificationText(value: string | null | undefined) {
  return String(value ?? '').toLowerCase();
}

notificationsRouter.get('/notifications/stream', requirePermission('NOTIFICATIONS', 'READ'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const unsubscribe = subscribeNotificationStream(req.auth!.userId, res);
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

notificationsRouter.get('/notifications', requirePermission('NOTIFICATIONS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const unreadOnly = String(req.query.unreadOnly ?? 'false').toLowerCase() === 'true';
    const repo = AppDataSource.getRepository(NotificationEntity);
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const profile = await profileRepo.findOneBy({ userId: req.auth!.userId });
    const actorPlantIds = Array.from(new Set([profile?.plantId, ...(req.auth?.plantIds ?? [])].filter((value): value is string => Boolean(value))));
    const actorOrganizationId = req.auth?.organizationId ?? null;
    const isRootAdmin = normalizeRoleName(req.auth?.roleKey ?? '') === 'ROOT_ADMIN';
    const notifications = await repo.find({
      where: { userId: req.auth!.userId },
      order: { createdAt: 'DESC' },
    });
    const workOrderIds = Array.from(new Set(notifications.map((notification) => notification.woId).filter((value): value is string => Boolean(value))));
    const workOrderPlantMap = new Map<string, string | null>();
    if (workOrderIds.length > 0) {
      const workOrders = await workOrderRepo.find({
        where: workOrderIds.map((id) => ({ id })),
        select: ['id', 'plantId'],
      });
      for (const workOrder of workOrders) {
        workOrderPlantMap.set(workOrder.id, workOrder.plantId ?? null);
      }
    }
    const workOrderPlantIds = Array.from(new Set(Array.from(workOrderPlantMap.values()).filter((value): value is string => Boolean(value))));
    const workOrderPlants = workOrderPlantIds.length > 0
      ? await plantRepo.find({
          where: workOrderPlantIds.map((id) => ({ id })),
          select: ['id', 'organizationId'],
        })
      : [];
    const plantOrganizationMap = new Map(workOrderPlants.map((plant) => [plant.id, plant.organizationId ?? null]));

    const roleScopedNotifications = notifications.filter((notification) => {
      const type = normalizeNotificationText(notification.type);
      const link = normalizeNotificationText(notification.link);
      const isSecurityCenterNotification = type === 'security' || link.includes('/security-center');
      if (isSecurityCenterNotification) {
        return false;
      }

      const workOrderPlantId = notification.woId ? (workOrderPlantMap.get(notification.woId) ?? null) : null;
      if (!workOrderPlantId || isRootAdmin) {
        return true;
      }

      const workOrderOrganizationId = plantOrganizationMap.get(workOrderPlantId) ?? null;
      if (actorOrganizationId && workOrderOrganizationId && workOrderOrganizationId !== actorOrganizationId) {
        return false;
      }

      if (req.auth?.accessAllPlants || req.auth?.scopeType === 'ORGANIZATION') {
        return true;
      }

      return actorPlantIds.includes(workOrderPlantId);
    });

    const unreadCount = roleScopedNotifications.filter((notification) => !notification.isRead).length;
    const searchTerm = normalizeNotificationText(query.search);
    const filteredNotifications = roleScopedNotifications.filter((notification) => {
      if (unreadOnly && notification.isRead) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }
      return [notification.title, notification.message, notification.type].some((value) => normalizeNotificationText(value).includes(searchTerm));
    });

    const total = filteredNotifications.length;
    const data = filteredNotifications.slice((query.page - 1) * query.limit, query.page * query.limit);

    res.json(
      ok(
        {
          notifications: data,
          userPlantId: profile?.plantId ?? null,
          unreadCount,
        },
        'Notifications fetched',
        buildPagination(query.page, query.limit, total),
      ),
    );
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/notifications/read-all', requirePermission('NOTIFICATIONS', 'READ'), async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(NotificationEntity);
    await repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true })
      .where('user_id = :userId', { userId: req.auth!.userId })
      .andWhere('is_read = :isRead', { isRead: false })
      .execute();
    publishNotificationChange(req.auth!.userId);
    res.json(ok({ updated: true }, 'Notifications marked as read'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/notifications/:id/read', requirePermission('NOTIFICATIONS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(NotificationEntity);
    const row = await repo.findOneBy({ id: params.id });
    if (!row) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    if (row.userId !== req.auth!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    row.isRead = true;
    await repo.save(row);
    publishNotificationChange(req.auth!.userId);
    res.json(ok(row, 'Notification marked as read'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.get('/notifications/:id', requirePermission('NOTIFICATIONS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(NotificationEntity);
    const row = await repo.findOneBy({ id: params.id });
    if (!row) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    if (row.userId !== req.auth!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    res.json(ok(row, 'Notification fetched'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/notifications/:id', requirePermission('NOTIFICATIONS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        message: z.string().min(1).optional(),
        type: z.string().optional(),
        isRead: z.boolean().optional(),
        link: z.string().nullable().optional(),
      })
      .parse(req.body);
    const repo = AppDataSource.getRepository(NotificationEntity);
    const row = await repo.findOneBy({ id: params.id });
    if (!row) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    if (row.userId !== req.auth!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    Object.assign(row, body);
    await repo.save(row);
    publishNotificationChange(req.auth!.userId);
    res.json(ok(row, 'Notification updated'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/notifications', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('NOTIFICATIONS', 'CREATE'), async (req, res, next) => {
  try {
    const body = notificationSchema.parse(req.body);
    if (body.userId) {
      if (req.auth?.scopeType === 'ORGANIZATION') {
        const userRepo = AppDataSource.getRepository(UserEntity);
        const targetUser = await userRepo.findOneBy({ id: body.userId });
        if (!targetUser || targetUser.organizationId !== req.auth.organizationId) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
      } else if (req.auth?.scopeType === 'PLANT' && body.userId !== req.auth.userId) {
        const profileRepo = AppDataSource.getRepository(ProfileEntity);
        const targetProfile = await profileRepo.findOneBy({ userId: body.userId });
        if (!targetProfile || !targetProfile.plantId || !req.auth.plantIds.includes(targetProfile.plantId)) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
      }
    }

    const repo = AppDataSource.getRepository(NotificationEntity);
    const created = repo.create({
      userId: body.userId ?? req.auth!.userId,
      title: body.title,
      message: body.message,
      type: body.type,
      isRead: false,
      link: body.link ?? null,
      woId: body.woId ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Notification created'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/notifications/by-role', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('NOTIFICATIONS', 'CREATE'), async (req, res, next) => {
  try {
    const body = byRoleSchema.parse(req.body);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const notificationRepo = AppDataSource.getRepository(NotificationEntity);

    let userRoles = await roleRepo.find({ where: { role: body.role.toUpperCase() } });
    const userIds = userRoles.map((row) => row.userId);
    if (userIds.length === 0) {
      res.status(200).json(ok({ inserted: 0 }, 'No target users found'));
      return;
    }

    if (req.auth?.scopeType === 'ORGANIZATION') {
      const organizationId = req.auth.organizationId;
      if (!organizationId) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      const scopedUsers = await userRepo.find({
        where: userIds.map((userId) => ({ id: userId, organizationId })),
        select: ['id'],
      });
      const allowedUserIds = new Set(scopedUsers.map((user) => user.id));
      userRoles = userRoles.filter((row) => allowedUserIds.has(row.userId));
    } else if (req.auth?.scopeType === 'PLANT') {
      const actorPlantIds = req.auth.plantIds;
      const scopedProfiles = await profileRepo.find({
        where: userIds.map((userId) => ({ userId })),
        select: ['userId', 'plantId'],
      });
      const allowedUserIds = new Set(
        scopedProfiles.filter((profile) => profile.plantId && actorPlantIds.includes(profile.plantId)).map((profile) => profile.userId),
      );
      userRoles = userRoles.filter((row) => allowedUserIds.has(row.userId));
    }

    if (userRoles.length === 0) {
      res.status(200).json(ok({ inserted: 0 }, 'No target users found'));
      return;
    }

    if (body.plantId) {
      const plantId = body.plantId;
      const scopedUserIds = userRoles.map((row) => row.userId);
      const profiles = await profileRepo.find({ where: scopedUserIds.map((userId) => ({ userId, plantId })) });
      const allowedUserIds = new Set(profiles.map((profile) => profile.userId));
      userRoles = userRoles.filter((row) => allowedUserIds.has(row.userId));
    }

    const inserts = userRoles.map((row) =>
      notificationRepo.create({
        userId: row.userId,
        title: body.title,
        message: body.message,
        type: body.type,
        isRead: false,
        link: body.link ?? null,
        woId: body.woId ?? null,
      }),
    );
    if (inserts.length > 0) {
      await notificationRepo.save(inserts);
    }
    res.status(201).json(ok({ inserted: inserts.length }, 'Notifications created'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.delete('/notifications/:id', requirePermission('NOTIFICATIONS', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(NotificationEntity);
    const row = await repo.findOneBy({ id: params.id });
    if (!row) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    if (row.userId !== req.auth!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    await repo.remove(row);
    publishNotificationChange(req.auth!.userId);
    res.json(ok({ id: params.id, deleted: true }, 'Notification deleted'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.get('/notifications/settings', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(NotificationSettingsEntity);
    let settings = await repo.findOneBy({ userId: req.auth!.userId });
    if (!settings) {
      settings = repo.create({
        userId: req.auth!.userId,
        emailNotifications: true,
        pushNotifications: true,
        inAppNotifications: true,
        dailyDigest: false,
        newWoEmail: true,
        woAssignedEmail: true,
        woEscalationEmail: true,
        woReminderEmail: true,
        woCompletedEmail: true,
        slaBreachEmail: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        emailDigestFrequency: 'REALTIME',
      });
      await repo.save(settings);
    }
    res.json(ok(settings, 'Notification settings fetched'));
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/notifications/settings', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(NotificationSettingsEntity);
    let settings = await repo.findOneBy({ userId: req.auth!.userId });
    if (!settings) {
      settings = repo.create({
        userId: req.auth!.userId,
        emailNotifications: true,
        pushNotifications: true,
        inAppNotifications: true,
        dailyDigest: false,
        newWoEmail: true,
        woAssignedEmail: true,
        woEscalationEmail: true,
        woReminderEmail: true,
        woCompletedEmail: true,
        slaBreachEmail: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        emailDigestFrequency: 'REALTIME',
      });
    }
    const body = z.object({
      emailNotifications: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      inAppNotifications: z.boolean().optional(),
      dailyDigest: z.boolean().optional(),
      newWoEmail: z.boolean().optional(),
      woAssignedEmail: z.boolean().optional(),
      woEscalationEmail: z.boolean().optional(),
      woReminderEmail: z.boolean().optional(),
      woCompletedEmail: z.boolean().optional(),
      slaBreachEmail: z.boolean().optional(),
      quietHoursStart: z.string().nullable().optional(),
      quietHoursEnd: z.string().nullable().optional(),
      emailDigestFrequency: z.string().optional(),
    }).parse(req.body);

    Object.assign(settings, body);
    await repo.save(settings);
    res.json(ok(settings, 'Notification settings updated'));
  } catch (error) {
    next(error);
  }
});
