import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppDataSource } from '../../database/data-source';
import { PushSubscriptionEntity } from '../../database/entities/push-subscription.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ok } from '../../utils/apiResponse';
import * as webPush from 'web-push';

export const pushRouter = Router();

let devVapidConfig: { publicKey: string; privateKey: string } | null = null;

function resolveVapidConfiguration(): { publicKey: string; privateKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  if (publicKey && privateKey) {
    return { publicKey, privateKey };
  }
  if (!devVapidConfig) {
    devVapidConfig = webPush.generateVAPIDKeys();
  }
  return devVapidConfig;
}

pushRouter.get('/push/vapid-public-key', (_req, res) => {
  const vapidConfig = resolveVapidConfiguration();
  if (!vapidConfig) {
    res.json({ publicKey: null, configured: false });
    return;
  }
  res.json({ publicKey: vapidConfig.publicKey, configured: true });
});

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

pushRouter.post('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const parsed = pushSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    const { subscription } = parsed.data;
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    const existing = await repo.findOne({
      where: { userId: req.auth!.userId, endpoint: subscription.endpoint },
    });
    if (existing) {
      existing.keys = subscription.keys;
      existing.userAgent = req.headers['user-agent'] || null;
      existing.lastUsedAt = new Date();
      await repo.save(existing);
    } else {
      const entity = repo.create({
        userId: req.auth!.userId,
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

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});

pushRouter.post('/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const parsed = pushUnsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }
    const { endpoint } = parsed.data;
    const repo = AppDataSource.getRepository(PushSubscriptionEntity);
    await repo.delete({ userId: req.auth!.userId, endpoint });
    res.json(ok({ unsubscribed: true }));
  } catch (error) {
    next(error);
  }
});

export async function sendPushNotification(userId: string, title: string, body: string, url?: string): Promise<void> {
  try {
    const vapidConfig = resolveVapidConfiguration();
    if (!vapidConfig) {
      return;
    }
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
    const userRepo = AppDataSource.getRepository(UserEntity);
    const qb = userRepo
      .createQueryBuilder('u')
      .select('DISTINCT u.id')
      .innerJoin('user_roles', 'ur', 'ur.user_id = u.id')
      .innerJoin('roles', 'r', 'r.id = ur.role_id')
      .where('r.name = :role', { role });

    if (plantId) {
      qb.andWhere('u.organization_id IN (SELECT p.organization_id FROM plants p WHERE p.id = :plantId)', { plantId });
    }

    const result = await qb.getRawMany<{ id: string }>();
    await Promise.allSettled(
      result.map((row) =>
        sendPushNotification(row.id, title, body, url)
      )
    );
  } catch {
    // silently fail
  }
}
