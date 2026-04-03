import { EventSubscriber, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { NotificationEntity } from '../../database/entities';
import { publishNotificationChange } from './notification-stream';

@EventSubscriber()
export class NotificationSubscriber implements EntitySubscriberInterface<NotificationEntity> {
  listenTo() {
    return NotificationEntity;
  }

  afterInsert(event: InsertEvent<NotificationEntity>) {
    publishNotificationChange(event.entity?.userId ?? null);
  }
}
