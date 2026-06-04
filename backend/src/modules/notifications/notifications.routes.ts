import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { NotificationEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { notFound } from '../../utils/httpError';
import { ok } from '../../utils/apiResponse';
import { subscribeNotificationStream } from './notification-stream';

const router = Router();

router.use(requireAuth);

router.get('/stream', (req, res) => {
  const userId = req.auth!.userId;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const unsubscribe = subscribeNotificationStream(userId, res);

  // Keep-alive ping every 25 seconds
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAliveInterval);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    unsubscribe();
    res.end();
  });
});

router.get('/', async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const repo = AppDataSource.getRepository(NotificationEntity);
    const notifications = await repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const unreadCount = await repo.count({ where: { userId, isRead: false } });

    res.json(ok(notifications, 'Notifications fetched', undefined, { unreadCount }));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.auth!.userId;
    const repo = AppDataSource.getRepository(NotificationEntity);
    const notification = await repo.findOne({ where: { id, userId } });
    
    if (!notification) {
      throw notFound('Notification not found');
    }
    
    notification.isRead = true;
    await repo.save(notification);

    res.json({ data: notification });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/close', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.auth!.userId;
    const repo = AppDataSource.getRepository(NotificationEntity);
    const notification = await repo.findOne({ where: { id, userId } });
    
    if (!notification) {
      throw notFound('Notification not found');
    }
    
    notification.status = 'CLOSED';
    notification.remarks = req.body.remarks || null;
    notification.isRead = true; // Mark as read when closed
    await repo.save(notification);

    res.json({ data: notification });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const repo = AppDataSource.getRepository(NotificationEntity);
    await repo.update({ userId, isRead: false }, { isRead: true });
    res.json({ success: true, data: { updated: true } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.auth!.userId;
    const repo = AppDataSource.getRepository(NotificationEntity);
    const result = await repo.delete({ id, userId });
    res.json({ success: true, data: { id, deleted: result.affected ? result.affected > 0 : false } });
  } catch (error) {
    next(error);
  }
});

export const notificationsRouter = router;

