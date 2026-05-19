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

    // Real subscription counts from organization data
    const allOrgs = await organizationRepo.find({ where: { isActive: true }, select: ['subscriptionStatus'] });
    const subscriptionStatusCounts = {
      ACTIVE: allOrgs.filter(o => o.subscriptionStatus === 'ACTIVE').length,
      TRIAL: allOrgs.filter(o => o.subscriptionStatus === 'TRIAL').length,
      EXPIRING: allOrgs.filter(o => o.subscriptionStatus === 'EXPIRING' || o.subscriptionStatus === 'DRAFT').length,
      EXPIRED: allOrgs.filter(o => o.subscriptionStatus === 'EXPIRED' || o.subscriptionStatus === 'SUSPENDED').length,
    };

    // Enrich organizations with real plant/user counts
    const orgsWithCounts = await Promise.all(
      recentOrganizations.map(async (org) => {
        const [plantCount, userCount] = await Promise.all([
          plantRepo.count({ where: { organizationId: org.id, isActive: true } }),
          userRepo.count({ where: { organizationId: org.id, isActive: true } }),
        ]);
        return {
          ...org,
          plantsCount: plantCount,
          usersCount: userCount,
        };
      }),
    );

    // Enrich plants with organization names
    const orgMap = new Map(recentOrganizations.map((o) => [o.id, o.name]));
    const plantsWithOrg = recentPlants.map((p) => ({
      ...p,
      organizationName: orgMap.get(p.organizationId) ?? 'Unknown',
    }));

    res.json(
      ok({
        organizationsCount,
        plantsCount,
        usersCount,
        subscriptionStatusCounts,
        recentlyCreatedOrganizations: orgsWithCounts,
        recentlyCreatedPlants: plantsWithOrg,
      }),
    );
  } catch (error) {
    next(error);
  }
});
