import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { PushSubscriptionEntity } from '../../database/entities/push-subscription.entity';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ok } from '../../utils/apiResponse';

export const pushRouter = Router();

function getVapidConfiguration(): { publicKey: string; privateKey: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (publicKey && privateKey) {
    return { publicKey, privateKey };
  }
  const webPush = require('web-push');
  const vapidKeys = webPush.generateVAPIDKeys();
  return { publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey };
}

const vapidConfig = getVapidConfiguration();

pushRouter.get('/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapidConfig.publicKey });
});

pushRouter.post('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    const existing = await repo.findOne({
      where: { userId: req.user!.id, endpoint: subscription.endpoint },
    });
    if (existing) {
      existing.keys = subscription.keys;
      existing.userAgent = req.headers['user-agent'] || null;
      existing.lastUsedAt = new Date();
      await repo.save(existing);
    } else {
      const entity = repo.create({
        userId: req.user!.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.headers['user-agent'] || null,
        lastUsedAt: new Date(),
      });
      await repo.save(entity);
    }
    res.json(ok({ subscribed: true }));
  } catch (error) {
    next(error);
  }
});

pushRouter.post('/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    await repo.delete({ userId: req.user!.id, endpoint });
    res.json(ok({ unsubscribed: true }));
  } catch (error) {
    next(error);
  }
});

export async function sendPushNotification(userId: string, title: string, body: string, url?: string): Promise<void> {
  try {
    const webPush = require('web-push');
    webPush.setVapidDetails(
      'mailto:admin@cmms.local',
      vapidConfig.publicKey,
      vapidConfig.privateKey
    );
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    const subscriptions = await repo.find({ where: { userId } });
    const payload = JSON.stringify({ title, body, url: url || '/' });
    await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        ).catch(async () => {
          await repo.delete({ id: sub.id });
        })
      )
    );
  } catch {
    // silently fail - push is best-effort
  }
}

export async function sendPushNotificationToRole(
  role: string,
  plantId: string | null,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  try {
    const query = `
      SELECT DISTINCT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = $1
    `;
    const params: string[] = [role];
    if (plantId) {
      // users associated with the plant
    }
    const result = await AppDataSource.query(query, params);
    await Promise.allSettled(
      result.map((row: { id: string }) =>
        sendPushNotification(row.id, title, body, url)
      )
    );
  } catch {
    // silently fail
  }
}
