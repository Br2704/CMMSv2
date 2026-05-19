import { EventSubscriber, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { NotificationEntity } from '../../database/entities';
import { publishNotificationChange } from './notification-stream';
import { sendPushNotification } from '../../services/push.service';
import { logger } from '../../config/logger';

@EventSubscriber()
export class NotificationSubscriber implements EntitySubscriberInterface<NotificationEntity> {
  listenTo() {
    return NotificationEntity;
  }

  async afterInsert(event: InsertEvent<NotificationEntity>) {
    const notification = event.entity;
    if (!notification) return;

    // Trigger real-time UI update via SSE
    publishNotificationChange(notification.userId);

    // Trigger Web Push for background delivery
    if (notification.userId) {
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
