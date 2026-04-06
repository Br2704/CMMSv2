import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { OrganizationEntity, OrgRoleEntity, PlantEntity, ProfileEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { fail, ok } from '../../utils/apiResponse';
import { toPagination } from '../../utils/pagination';
import { createCrudController } from '../_core/crud.controller';
import { idParamSchema, listQuerySchema } from '../_core/crud.validators';
import { organizationsService } from './organizations.service';
import { createOrganizationSchema, updateOrganizationSchema } from './organizations.validators';

type OrganizationCountRow = {
  organizationId: string;
  plantsCount?: string | number;
  usersCount?: string | number;
  adminsCount?: string | number;
  superadminsCount?: string | number;
};

type EnrichedOrganizationRow = Record<string, unknown> & {
  id: string;
  plantsCount: number;
  usersCount: number;
  adminsCount: number;
  superadminsCount: number;
};

async function loadOrganizationCounts(organizationIds: string[]) {
  const countsByOrganizationId = new Map<string, Required<Omit<OrganizationCountRow, 'organizationId'>>>();
  if (organizationIds.length === 0) {
    return countsByOrganizationId;
  }

  const plantRows = await AppDataSource.getRepository(PlantEntity)
    .createQueryBuilder('plant')
    .select('plant.organization_id', 'organizationId')
    .addSelect('COUNT(*)', 'plantsCount')
    .where('plant.organization_id IN (:...organizationIds)', { organizationIds })
    .andWhere('plant.is_active = :active', { active: true })
    .groupBy('plant.organization_id')
    .getRawMany<OrganizationCountRow>();

  const orgScopeExpression = 'COALESCE(usr.organization_id, org_role.organization_id, plant.organization_id)';
  const userRows = await AppDataSource.getRepository(UserEntity)
    .createQueryBuilder('usr')
    .leftJoin(OrgRoleEntity, 'org_role', 'org_role.id = usr.org_role_id')
    .leftJoin(ProfileEntity, 'profile', 'profile.user_id = usr.id')
    .leftJoin(PlantEntity, 'plant', 'plant.id = profile.plant_id')
    .leftJoin(UserRoleEntity, 'ur', 'ur.user_id = usr.id')
    .select(orgScopeExpression, 'organizationId')
    .addSelect('COUNT(DISTINCT usr.id)', 'usersCount')
    .addSelect("COUNT(DISTINCT CASE WHEN UPPER(COALESCE(org_role.key, ur.role, '')) = 'ADMIN' THEN usr.id END)", 'adminsCount')
    .addSelect(
      "COUNT(DISTINCT CASE WHEN UPPER(COALESCE(org_role.key, ur.role, '')) IN ('SUPERADMIN', 'SUPER_ADMIN') THEN usr.id END)",
      'superadminsCount',
    )
    .where('usr.is_active = :active', { active: true })
    .andWhere(`${orgScopeExpression} IN (:...organizationIds)`, { organizationIds })
    .andWhere("UPPER(COALESCE(org_role.key, ur.role, '')) <> 'ROOT_ADMIN'")
    .groupBy(orgScopeExpression)
    .getRawMany<OrganizationCountRow>();

  for (const row of plantRows) {
    countsByOrganizationId.set(row.organizationId, {
      plantsCount: Number(row.plantsCount ?? 0),
      usersCount: 0,
      adminsCount: 0,
      superadminsCount: 0,
    });
  }

  for (const row of userRows) {
    const current = countsByOrganizationId.get(row.organizationId) ?? {
      plantsCount: 0,
      usersCount: 0,
      adminsCount: 0,
      superadminsCount: 0,
    };
    countsByOrganizationId.set(row.organizationId, {
      plantsCount: current.plantsCount,
      usersCount: Number(row.usersCount ?? 0),
      adminsCount: Number(row.adminsCount ?? 0),
      superadminsCount: Number(row.superadminsCount ?? 0),
    });
  }

  return countsByOrganizationId;
}

async function loadOrganizationsWithCounts(input: {
  ids?: string[];
  includeInactive: boolean;
  page: number;
  limit: number;
  search?: string;
}) {
  const ids = input.ids?.filter(Boolean) ?? [];
  if (input.ids && ids.length === 0) {
    return {
      items: [] as EnrichedOrganizationRow[],
      total: 0,
    };
  }
  const normalizedSearch = input.search?.trim().toLowerCase() ?? '';
  const qb = AppDataSource.getRepository(OrganizationEntity)
    .createQueryBuilder('organization')
    .select('organization');

  if (!input.includeInactive) {
    qb.andWhere('organization.is_active = :active', { active: true });
  }
  if (ids.length > 0) {
    qb.andWhere('organization.id IN (:...ids)', { ids });
  }
  if (normalizedSearch) {
    qb.andWhere('(LOWER(organization.name) LIKE :search OR LOWER(COALESCE(organization.code, \'\')) LIKE :search)', {
      search: `%${normalizedSearch}%`,
    });
  }

  const total = await qb.getCount();
  const organizations = await qb
    .orderBy('organization.created_at', 'DESC')
    .offset((input.page - 1) * input.limit)
    .limit(input.limit)
    .getMany();

  const organizationIds = organizations.map((organization) => organization.id);
  const countsByOrganizationId = await loadOrganizationCounts(organizationIds);

  return {
    items: organizations.map((organization) => {
      const counts = countsByOrganizationId.get(organization.id) ?? {
        plantsCount: 0,
        usersCount: 0,
        adminsCount: 0,
        superadminsCount: 0,
      };

      return {
        ...organization,
        plantsCount: counts.plantsCount,
        usersCount: counts.usersCount,
        adminsCount: counts.adminsCount,
        superadminsCount: counts.superadminsCount,
      } as EnrichedOrganizationRow;
    }),
    total,
  };
}

async function resolveScopedOrganizationIds(auth?: Express.AuthContext) {
  if (!auth) {
    return [] as string[];
  }

  if (auth.scopeType === 'ROOT_ADMIN') {
    return undefined;
  }

  if (auth.scopeType === 'ORGANIZATION') {
    return auth.organizationId ? [auth.organizationId] : [];
  }

  if (auth.scopeType === 'PLANT' && auth.plantIds.length > 0) {
    const plants = await AppDataSource.getRepository(PlantEntity).find({
      where: auth.plantIds.map((id) => ({ id })),
      select: ['organizationId'],
    });
    return Array.from(new Set(plants.map((plant) => plant.organizationId).filter(Boolean)));
  }

  return [] as string[];
}

const organizationsController = createCrudController(organizationsService, 'organizations');

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get(
  '/organizations',
  requirePermission('ORGANIZATIONS', 'READ'),
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1) || 1;
    const limit = Number(req.query.limit ?? 100) || 100;
    const includeInactive = String(req.query.includeInactive ?? 'false').toLowerCase() === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const organizationIds = await resolveScopedOrganizationIds(req.auth);

    const result = await loadOrganizationsWithCounts({
      ids: organizationIds,
      includeInactive,
      page,
      limit,
      search,
    });
    res.status(200).json(ok(result.items, 'Fetched successfully', toPagination(page, limit, result.total)));
  }),
);

organizationsRouter.get(
  '/organizations/:id',
  requirePermission('ORGANIZATIONS', 'READ'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res, next) => {
    const scopedOrganizationIds = await resolveScopedOrganizationIds(req.auth);
    if (Array.isArray(scopedOrganizationIds)) {
      if (scopedOrganizationIds.length === 0 || !scopedOrganizationIds.includes(req.params.id)) {
        res.status(403).json(
          fail('Organization access denied', {
            code: 'ORG_SCOPE_DENIED',
            requestedOrganizationId: req.params.id,
            organizationId: req.auth?.organizationId ?? null,
            scopeType: req.auth?.scopeType ?? null,
          }),
        );
        return;
      }
    }

    await organizationsController.getById(req, res, next);
  }),
);
organizationsRouter.post(
  '/organizations',
  requirePermission('ORGANIZATIONS', 'CREATE'),
  validateRequest({ body: createOrganizationSchema }),
  organizationsController.create,
);
organizationsRouter.patch(
  '/organizations/:id',
  requirePermission('ORGANIZATIONS', 'UPDATE'),
  validateRequest({ params: idParamSchema, body: updateOrganizationSchema }),
  organizationsController.update,
);
organizationsRouter.delete(
  '/organizations/:id',
  requirePermission('ORGANIZATIONS', 'DELETE'),
  validateRequest({ params: idParamSchema }),
  organizationsController.remove,
);
