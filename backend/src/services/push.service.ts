import webpush from 'web-push';
import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { PushSubscriptionEntity } from '../database/entities/push-subscription.entity';
import { logger } from '../config/logger';

// VAPID keys should be in env or generated once and stored
// For now, we'll try to use env, and if not found, we'll log a warning
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.SMTP_FROM || 'admin@tamoptix.tech';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    `mailto:${vapidEmail}`,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  logger.warn('VAPID keys not configured for Web Push notifications');
}

export async function sendPushNotification(userId: string, payload: {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: any;
}) {
  const repo = AppDataSource.getRepository(PushSubscriptionEntity);
  const subscriptions = await repo.findBy({ userId });

  if (subscriptions.length === 0) return;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload)
        );
        
        // Update last used
        sub.lastUsedAt = new Date();
        await repo.save(sub);
      } catch (error: any) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          // Subscription expired or no longer valid
          await repo.remove(sub);
          logger.info({ endpoint: sub.endpoint }, 'Removed expired push subscription');
        } else {
          logger.error({ error, endpoint: sub.endpoint }, 'Failed to send push notification');
          throw error;
        }
      }
    })
  );

  return results;
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}
