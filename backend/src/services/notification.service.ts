import { AppDataSource } from '../database/data-source';
import { NotificationEntity, UserEntity, UserRoleEntity } from '../database/entities';

export class NotificationService {
  async notifyUser(userId: string, title: string, message: string, type: string, referenceId?: string | null, plantId?: string | null) {
    const repo = AppDataSource.getRepository(NotificationEntity);
    const notification = repo.create({
      userId,
      title,
      message,
      type,
      referenceId: referenceId ?? null,
      plantId: plantId ?? null,
    });
    await repo.save(notification);
    return notification;
  }

  async notifyRole(roleCode: string, title: string, message: string, type: string, referenceId?: string | null, plantId?: string | null) {
    // Find users with the given role
    const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
    const qb = userRoleRepo.createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .innerJoinAndSelect('ur.user', 'user')
      .where('role.roleCode = :roleCode', { roleCode })
      .andWhere('user.isActive = true');

    if (plantId) {
      qb.andWhere('ur.plantId = :plantId', { plantId });
    }

    const userRoles = await qb.getMany();
    
    if (userRoles.length === 0) return [];

    const repo = AppDataSource.getRepository(NotificationEntity);
    const notifications = userRoles.map(ur => repo.create({
      userId: ur.userId,
      plantId: ur.plantId ?? plantId ?? null,
      title,
      message,
      type,
      referenceId: referenceId ?? null,
    }));

    await repo.save(notifications);
    return notifications;
  }
}

export const notificationService = new NotificationService();
