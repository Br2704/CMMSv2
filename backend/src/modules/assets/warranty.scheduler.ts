import cron from 'node-cron';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, NotificationEntity, UserEntity, WarrantyAlertEntity } from '../../database/entities';
import { logger } from '../../config/logger';
import { publishNotificationChange } from '../notifications/notification-stream';

let warrantySchedulerStarted = false;

async function runWarrantyScheduler() {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const notificationRepo = AppDataSource.getRepository(NotificationEntity);

  const assets = await assetRepo
    .createQueryBuilder('asset')
    .where('asset.warrantyExpiry IS NOT NULL')
    .andWhere('asset.isActive = true')
    .getMany();

  if (assets.length === 0) return;

  const usersToNotify = await userRepo
    .createQueryBuilder('user')
    .innerJoin('user.roles', 'role')
    .where('role.roleName IN (:...roles)', { roles: ['PLANT_ADMIN', 'SCM_MANAGER', 'SCM_USER'] })
    .andWhere('user.isActive = true')
    .select(['user.id'])
    .getMany();

  if (usersToNotify.length === 0) return;

  const alertRepo = AppDataSource.getRepository(WarrantyAlertEntity);
  const now = new Date();
  const inserts: NotificationEntity[] = [];

  for (const asset of assets) {
    if (!asset.warrantyExpiry) continue;
    const expiryDate = new Date(asset.warrantyExpiry);
    const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

    let title = '';
    let message = '';
    let type = '';

    if (diffDays === 90) {
      title = 'Warranty Expiring in 90 Days';
      message = `Asset ${asset.name} (${asset.code}) warranty expires in 90 days.`;
      type = 'warranty_alert_90';
    } else if (diffDays === 60) {
      title = 'Warranty Expiring in 60 Days';
      message = `Asset ${asset.name} (${asset.code}) warranty expires in 60 days.`;
      type = 'warranty_alert_60';
    } else if (diffDays === 30) {
      title = 'Warranty Expiring in 30 Days';
      message = `Asset ${asset.name} (${asset.code}) warranty expires in 30 days. Action required.`;
      type = 'warranty_alert_30';
    } else if (diffDays === 0 || (diffDays < 0 && diffDays >= -1)) { // exactly today or just expired
      title = 'Warranty Expired';
      message = `Asset ${asset.name} (${asset.code}) warranty has expired.`;
      type = 'warranty_alert_expired';
    }

    if (!type) continue;

    // Create Warranty Alert Entity if not exists
    const existingAlert = await alertRepo.findOne({
      where: { machineId: asset.id, status: 'OPEN' }
    });

    if (!existingAlert && diffDays <= 30) {
      await alertRepo.save(alertRepo.create({
        machineId: asset.id,
        plantId: asset.plantId,
        status: 'OPEN'
      }));
    }

    // Notify all targeted users
    const targets = usersToNotify;

    for (const user of targets) {
      // De-duplication check could be added here
      const notification = notificationRepo.create({
        userId: user.id,
        title,
        message,
        type,
        isRead: false,
        link: `/warranty-alerts`,
      });
      inserts.push(notification);
    }
  }

  if (inserts.length > 0) {
    await notificationRepo.save(inserts);
    const uniqueUserIds = Array.from(new Set(inserts.map(i => i.userId)));
    uniqueUserIds.forEach(id => publishNotificationChange(id));
    logger.info({ count: inserts.length }, 'Warranty notifications generated');
  }
}

export function startWarrantyScheduler() {
  if (warrantySchedulerStarted) return;
  warrantySchedulerStarted = true;

  // Run daily at midnight
  cron.schedule('0 0 * * *', () => {
    void runWarrantyScheduler().catch((error) => {
      logger.error({ error }, 'Failed running warranty scheduler');
    });
  });

  logger.info('Warranty scheduler started');
}

export const executeWarrantyCheckNow = runWarrantyScheduler;
