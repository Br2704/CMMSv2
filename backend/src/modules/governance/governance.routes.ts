import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { OrganizationEntity, PlantEntity, UserEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';

export const governanceRouter = Router();

governanceRouter.get('/governance/overview', requireAuth, requireRole(['ROOT_ADMIN']), async (_req, res, next) => {
  try {
    const organizationRepo = AppDataSource.getRepository(OrganizationEntity);
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);

    const [organizationsCount, plantsCount, usersCount, recentOrganizations, recentPlants] = await Promise.all([
      organizationRepo.count({ where: { isActive: true } }),
      plantRepo.count({ where: { isActive: true } }),
      userRepo.count({ where: { isActive: true } }),
      organizationRepo.find({
        where: { isActive: true },
        select: ['id', 'name', 'code', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      plantRepo.find({
        where: { isActive: true },
        select: ['id', 'plantCode', 'plantName', 'organizationId', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    res.json(
      ok({
        organizationsCount,
        plantsCount,
        usersCount,
        recentlyCreatedOrganizations: recentOrganizations,
        recentlyCreatedPlants: recentPlants,
      }),
    );
  } catch (error) {
    next(error);
  }
});
