import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { ProfileEntity, RoleDashboardKpiEntity, RolePermissionEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissionGuard';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { getOrgRbacVersion } from '../../utils/orgRbacVersion';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { allowedRoleTargetsForCreate, allowedRoleTargetsForEdit, rolePrecedence } from '../../utils/policy';
import { applySearch } from '../../utils/query';
import { DASHBOARD_KPI_KEYS, isRootAdminRole, isSuperAdminRole, normalizeRoleName, permissionKeysFromMap } from '../../utils/rbac';
import { bumpRbacVersion, getRbacVersion } from '../../utils/rbacVersion';

const permissionSchema = z.object({
  role: z.string().min(1),
  moduleId: z.string().min(1),
  actions: z.array(z.string()).default([]),
});

export const permissionsRouter = Router();
permissionsRouter.use(requireAuth);

permissionsRouter.get('/permissions/me', async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json(fail('Unauthorized'));
      return;
    }

    let kpis: RoleDashboardKpiEntity[] = [];
    let profilePlantId: string | null = null;
    let organizationId: string | null = null;
    let orgRoleId: string | null = null;
    try {
      const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
      const kpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);
      const profileRepo = AppDataSource.getRepository(ProfileEntity);
      const userRepo = AppDataSource.getRepository(UserEntity);

      const roleIds = (
        await userRoleRepo.find({
          where: { userId: auth.userId },
          select: ['roleId'],
        })
      )
        .map((item) => item.roleId)
        .filter((value): value is string => Boolean(value));

      kpis = roleIds.length
        ? await kpiRepo.find({
            where: { roleId: In(roleIds) },
            order: { displayOrder: 'ASC', createdAt: 'ASC' },
          })
        : [];

      const profile = await profileRepo.findOneBy({ userId: auth.userId });
      profilePlantId = profile?.plantId ?? null;
      const user = await userRepo.findOneBy({ id: auth.userId });
      organizationId = user?.organizationId ?? auth.organizationId ?? null;
      orgRoleId = user?.orgRoleId ?? auth.orgRoleId ?? null;
    } catch {
      kpis = [];
    }

    const kpiVisibilityMap = new Map<string, { kpiKey: string; isVisible: boolean; displayOrder: number }>();
    for (const item of kpis) {
      const existing = kpiVisibilityMap.get(item.kpiKey);
      if (!existing || item.displayOrder < existing.displayOrder) {
        kpiVisibilityMap.set(item.kpiKey, {
          kpiKey: item.kpiKey,
          isVisible: item.isVisible,
          displayOrder: item.displayOrder,
        });
      }
    }

    const roleKey = auth.roleKey || normalizeRoleName(auth.roles[0] ?? 'MAINTENANCE_USER');
    const normalizedRoles = auth.roles.map((role) => normalizeRoleName(role));
    const isRootAdmin = normalizedRoles.some((role) => isRootAdminRole(role));
    const isSuperAdmin = normalizedRoles.some((role) => isSuperAdminRole(role));
    const permissions = auth.permissions;
    const permissionKeys = permissionKeysFromMap(permissions);
    if (isRootAdmin || isSuperAdmin) {
      kpiVisibilityMap.clear();
      DASHBOARD_KPI_KEYS.forEach((kpiKey, index) => {
        kpiVisibilityMap.set(kpiKey, {
          kpiKey,
          isVisible: true,
          displayOrder: index,
        });
      });
    }

    const kpiVisibility = Array.from(kpiVisibilityMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
    const resolvedOrganizationId = organizationId ?? auth.organizationId ?? null;
    const resolvedPlantId = profilePlantId ?? auth.activePlantId ?? auth.plantIds[0] ?? null;
    let rbacVersion = await getRbacVersion();
    if (resolvedOrganizationId) {
      try {
        rbacVersion = await getOrgRbacVersion(resolvedOrganizationId);
      } catch {
        rbacVersion = await getRbacVersion();
      }
    }

    res.json(
      ok(
        {
          roleNames: normalizedRoles,
          roles: auth.roles,
          roleKey,
          scopeType: auth.scopeType ?? null,
          rolePrecedence: rolePrecedence(roleKey),
          isRootAdmin,
          isGlobal: isSuperAdmin || isRootAdmin,
          organizationId: resolvedOrganizationId,
          orgRoleId: orgRoleId ?? auth.orgRoleId ?? null,
          plantId: resolvedPlantId,
          permissions,
          permissionKeys,
          allowedModules: Object.keys(permissions),
          allowedActionsByModule: permissions,
          allowedRoleTargetsForCreate: allowedRoleTargetsForCreate(roleKey),
          allowedRoleTargetsForEdit: allowedRoleTargetsForEdit(roleKey),
          kpis: kpiVisibility,
          kpiVisibility,
          plantIds: auth.plantIds,
          accessAllPlants: auth.accessAllPlants,
          rbacVersion,
        },
        'Permissions fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

permissionsRouter.get('/permissions', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const moduleId = typeof req.query.moduleId === 'string' ? req.query.moduleId : undefined;

    const repo = AppDataSource.getRepository(RolePermissionEntity);
    const qb = repo.createQueryBuilder('permission');
    applySearch(qb, 'permission', query.search, ['role', 'module_id']);
    if (role) qb.andWhere('permission.role = :role', { role });
    if (moduleId) qb.andWhere('permission.module_id = :moduleId', { moduleId });
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('permission.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Permissions fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.get('/role-permissions', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(RolePermissionEntity);
    const qb = repo.createQueryBuilder('rp');
    applySearch(qb, 'rp', query.search, ['role', 'module_id']);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('rp.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Role permissions fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.post('/role-permissions', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const body = permissionSchema.parse(req.body);
    const repo = AppDataSource.getRepository(RolePermissionEntity);
    const created = repo.create({
      role: body.role.toUpperCase(),
      moduleId: body.moduleId.toUpperCase(),
      actions: body.actions.map((action) => action.toUpperCase()),
    });
    await repo.save(created);
    await bumpRbacVersion();
    await audit('role_permissions.create', {
      module: 'PERMISSIONS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_permissions',
      entityId: created.id,
      statusCode: 201,
    });
    res.status(201).json(ok(created, 'Role permission created'));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.patch('/role-permissions/:id', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = permissionSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(RolePermissionEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json(fail('Role permission not found'));
      return;
    }
    Object.assign(entity, {
      ...body,
      role: body.role?.toUpperCase(),
      moduleId: body.moduleId?.toUpperCase(),
      actions: body.actions?.map((action) => action.toUpperCase()),
    });
    await repo.save(entity);
    await bumpRbacVersion();
    await audit('role_permissions.update', {
      module: 'PERMISSIONS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_permissions',
      entityId: entity.id,
      statusCode: 200,
    });
    res.json(ok(entity, 'Role permission updated'));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.delete('/role-permissions/:id', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(RolePermissionEntity);
    await repo.delete({ id: params.id });
    await bumpRbacVersion();
    await audit('role_permissions.delete', {
      module: 'PERMISSIONS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_permissions',
      entityId: params.id,
      statusCode: 200,
    });
    res.json(ok({ id: params.id }, 'Role permission deleted'));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.delete('/role-permissions/by-role/:role', requireRole(['ROOT_ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ role: z.string().min(1) }).parse(req.params);
    const repo = AppDataSource.getRepository(RolePermissionEntity);
    await repo.delete({ role: params.role });
    await bumpRbacVersion();
    await audit('role_permissions.delete_by_role', {
      module: 'PERMISSIONS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_permissions',
      statusCode: 200,
      metadata: { role: params.role },
    });
    res.json(ok({ role: params.role }, 'Role permissions deleted'));
  } catch (error) {
    next(error);
  }
});
