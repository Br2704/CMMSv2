import { EventSubscriber, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { NotificationEntity } from '../../database/entities';
import { publishNotificationChange, publishNewNotification } from './notification-stream';
import { sendPushNotification } from '../../services/push.service';
import { logger } from '../../config/logger';
import { AppDataSource } from '../../database/data-source';
import { NotificationSettingsEntity } from '../../database/entities';
import { isCurrentTimeInQuietHours } from '../../utils/date';

@EventSubscriber()
export class NotificationSubscriber implements EntitySubscriberInterface<NotificationEntity> {
  listenTo() {
    return NotificationEntity;
  }

  async afterInsert(event: InsertEvent<NotificationEntity>) {
    const notification = event.entity;
    if (!notification) return;

    // Fetch user settings
    const settingsRepo = AppDataSource.getRepository(NotificationSettingsEntity);
    const settings = await settingsRepo.findOne({ where: { userId: notification.userId } });

    let inQuietHours = false;
    if (settings?.quietHoursStart && settings?.quietHoursEnd) {
      inQuietHours = isCurrentTimeInQuietHours(settings.quietHoursStart, settings.quietHoursEnd);
    }

    const showInApp = settings?.inAppNotifications !== false && !inQuietHours;
    const allowPush = settings?.pushNotifications !== false && !inQuietHours;

    // Trigger real-time UI update via SSE
    // If showInApp is false, we send it as 'silent' so the frontend can update badge/list without interrupting the user.
    publishNewNotification(notification.userId, notification, !showInApp);

    // Trigger Web Push for background delivery
    if (notification.userId && allowPush) {
      try {
        await sendPushNotification(notification.userId, {
          title: notification.title,
          body: notification.message,
          data: {
            url: notification.link || '/',
            woId: notification.woId,
            notificationId: notification.id,
          },
          tag: notification.woId ? `wo-${notification.woId}` : undefined,
        });
      } catch (error) {
        logger.error({ error, userId: notification.userId }, 'Failed to trigger push notification from subscriber');
      }
    }
  }
}
