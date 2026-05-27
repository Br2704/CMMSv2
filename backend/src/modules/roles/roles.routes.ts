import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { OrgRoleEntity, RoleEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requireRole } from '../../middlewares/permissionGuard';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { canAssignRole, getPrimaryRoleKey, visibleRolesForActor } from '../../utils/policy';
import { resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import { applySearch } from '../../utils/query';
import { normalizeRoleName } from '../../utils/rbac';

const userRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().min(1),
  plantId: z.string().uuid().nullable().optional(),
});

const SYSTEM_ORG_ROLE_DEFINITIONS = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', isSystem: true },
  { key: 'PLANT_ADMIN', name: 'Plant Admin', isSystem: true },
  { key: 'ESG_ADMIN', name: 'ESG Admin', isSystem: true },
  { key: 'HR_ADMIN', name: 'HR Admin', isSystem: true },
  { key: 'MAINTENANCE_MANAGER', name: 'Maintenance Manager', isSystem: true },
  { key: 'PRODUCTION_MANAGER', name: 'Production Manager', isSystem: true },
  { key: 'SCM_MANAGER', name: 'SCM Manager', isSystem: true },
  { key: 'HR_MANAGER', name: 'HR Manager', isSystem: true },
  { key: 'CALIBRATION_MANAGER', name: 'Calibration Manager', isSystem: true },
  { key: 'ACCOUNTS_MANAGER', name: 'Accounts Manager', isSystem: true },
  { key: 'SAFETY_MANAGER', name: 'Safety Manager', isSystem: true },
  { key: 'ESG_MANAGER', name: 'ESG Manager', isSystem: true },
  { key: 'MAINTENANCE_USER', name: 'Maintenance User', isSystem: true },
  { key: 'PRODUCTION_USER', name: 'Production User', isSystem: true },
  { key: 'SCM_USER', name: 'SCM User', isSystem: true },
  { key: 'HR_USER', name: 'HR User', isSystem: true },
  { key: 'CALIBRATION_USER', name: 'Calibration User', isSystem: true },
  { key: 'ACCOUNTS_USER', name: 'Accounts User', isSystem: true },
  { key: 'SAFETY_USER', name: 'Safety User', isSystem: true },
  { key: 'ESG_USER', name: 'ESG User', isSystem: true },
  { key: 'SECURITY', name: 'Security', isSystem: true },
  { key: 'VENDOR', name: 'Vendor', isSystem: true },
  { key: 'VISITOR', name: 'Visitor', isSystem: true },
] as const;

async function ensureSystemOrgRoles(organizationId: string) {
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  for (const roleDef of SYSTEM_ORG_ROLE_DEFINITIONS) {
    const existing = await orgRoleRepo.findOneBy({ organizationId, key: roleDef.key });
    if (existing) {
      if (!existing.isActive || !existing.isSystem || existing.name !== roleDef.name) {
        existing.name = roleDef.name;
        existing.isSystem = roleDef.isSystem;
        existing.isActive = true;
        await orgRoleRepo.save(existing);
      }
      continue;
    }

    await orgRoleRepo.save(
      orgRoleRepo.create({
        organizationId,
        key: roleDef.key,
        name: roleDef.name,
        isSystem: roleDef.isSystem,
        isActive: true,
      }),
    );
  }
}

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

rolesRouter.get('/roles/catalog', requireRole(['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const actorRoles = req.auth?.roles.map((role) => normalizeRoleName(role)) ?? [];
    const actorRoleKey = getPrimaryRoleKey(actorRoles);
    const visibleRoles = new Set(visibleRolesForActor(actorRoleKey));
    const organizationId = req.auth?.organizationId ?? null;

    if (organizationId) {
      const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
      await ensureSystemOrgRoles(organizationId);
      const data = await orgRoleRepo.find({
        where: { organizationId, isActive: true },
        order: { isSystem: 'DESC', key: 'ASC' },
      });
      res.json(
        ok(
          data.map((role) => ({
            id: role.id,
            name: role.key,
            description: role.name,
            isSystem: role.isSystem,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt,
          })),
        ),
      );
      return;
    }

    const repo = AppDataSource.getRepository(RoleEntity);
    const data = await repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    const filtered = data.filter((role) => visibleRoles.has(normalizeRoleName(role.name)));
    res.json(ok(filtered));
  } catch (error) {
    next(error);
  }
});

rolesRouter.get('/user-roles', requireRole(['SUPER_ADMIN', 'ROOT_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const roleFilter = typeof req.query.role === 'string' ? req.query.role : undefined;

    const repo = AppDataSource.getRepository(UserRoleEntity);
    const qb = repo.createQueryBuilder('ur');
    applySearch(qb, 'ur', query.search, ['role']);
    if (roleFilter) {
      qb.andWhere('ur.role = :role', { role: roleFilter });
    }
    const scopedPlantIds = resolvePlantFilter(req.auth!, query.plantId);
    if (scopedPlantIds === null) {
      // SUPERADMIN can optionally filter by plant via query.plantId.
    } else if (scopedPlantIds.length === 0) {
      qb.andWhere('1=0');
    } else {
      qb.andWhere('ur.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('ur.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'User roles fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

rolesRouter.post('/user-roles', requireRole(['SUPER_ADMIN', 'ROOT_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const body = userRoleSchema.parse(req.body);
    const requestedRole = normalizeRoleName(body.role);
    const actorRoles = req.auth?.roles.map((role) => normalizeRoleName(role)) ?? [];
    const actorRoleKey = getPrimaryRoleKey(actorRoles);
    const roleEntityRepo = AppDataSource.getRepository(RoleEntity);
    const roleDef = await roleEntityRepo.findOneBy({ name: requestedRole, isActive: true });
    if (!roleDef) {
      res.status(400).json(fail(`Role ${requestedRole} is invalid or inactive`));
      return;
    }

    if (!canAssignRole(actorRoleKey, requestedRole)) {
      res.status(403).json(fail(`No permission to assign role: ${requestedRole}`));
      return;
    }

    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const repo = AppDataSource.getRepository(UserRoleEntity);
    const created = repo.create({ ...body, role: requestedRole, plantId: resolvedPlantId });
    await repo.save(created);
    await audit('user.roles.create', {
      module: 'USERS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'user_roles',
      entityId: created.id,
      plantId: created.plantId,
      statusCode: 201,
    });
    res.status(201).json(ok(created, 'User role created'));
  } catch (error) {
    next(error);
  }
});

rolesRouter.delete('/user-roles/:userId', requireRole(['SUPER_ADMIN', 'ROOT_ADMIN', 'PLANT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ userId: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(UserRoleEntity);
    const existing = await repo.find({ where: { userId: params.userId } });
    if (existing.length === 0) {
      res.status(404).json(fail('User roles not found'));
      return;
    }
    for (const row of existing) {
      ensurePlantAccess(req, row.plantId ?? null);
    }
    await repo.delete({ userId: params.userId });
    await audit('user.roles.delete', {
      module: 'USERS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'user_roles',
      entityId: params.userId,
      statusCode: 200,
    });
    res.json(ok({ userId: params.userId }, 'User roles deleted'));
  } catch (error) {
    next(error);
  }
});
