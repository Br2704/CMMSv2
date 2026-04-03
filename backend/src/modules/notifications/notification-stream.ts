import type { Response } from 'express';
import { randomUUID } from 'crypto';

type NotificationStreamEvent = 'connected' | 'notifications.changed';

type StreamClient = {
  id: string;
  res: Response;
};

function formatEvent(event: NotificationStreamEvent, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

class NotificationStreamBroker {
  private readonly clientsByUserId = new Map<string, Map<string, StreamClient>>();

  subscribe(userId: string, res: Response) {
    const client: StreamClient = {
      id: randomUUID(),
      res,
    };
    const bucket = this.clientsByUserId.get(userId) ?? new Map<string, StreamClient>();
    bucket.set(client.id, client);
    this.clientsByUserId.set(userId, bucket);

    res.write(
      formatEvent('connected', {
        userId,
        connectedAt: new Date().toISOString(),
      }),
    );

    return () => {
      const currentBucket = this.clientsByUserId.get(userId);
      if (!currentBucket) return;
      currentBucket.delete(client.id);
      if (currentBucket.size === 0) {
        this.clientsByUserId.delete(userId);
      }
    };
  }

  publishChange(userId: string) {
    const bucket = this.clientsByUserId.get(userId);
    if (!bucket || bucket.size === 0) return;

    const payload = formatEvent('notifications.changed', {
      userId,
      changedAt: new Date().toISOString(),
    });

    for (const [clientId, client] of bucket.entries()) {
      try {
        client.res.write(payload);
      } catch {
        bucket.delete(clientId);
      }
    }

    if (bucket.size === 0) {
      this.clientsByUserId.delete(userId);
    }
  }
}

const notificationStreamBroker = new NotificationStreamBroker();

export function subscribeNotificationStream(userId: string, res: Response) {
  return notificationStreamBroker.subscribe(userId, res);
}

export function publishNotificationChange(userId: string | null | undefined) {
  if (!userId) return;
  notificationStreamBroker.publishChange(userId);
}
