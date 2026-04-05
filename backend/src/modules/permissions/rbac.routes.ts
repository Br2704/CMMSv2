import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { OrgRoleEntity, ProfileEntity, RoleDashboardKpiEntity, RoleEntity, RolePermissionEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { allowedRoleTargetsForCreate, allowedRoleTargetsForEdit, canAssignRole, canDeleteRoleByPolicy, rolePrecedence } from '../../utils/policy';
import { ensureRoleCatalogEntry } from '../../utils/roleCatalog';
import { bumpRbacVersion, getRbacVersion } from '../../utils/rbacVersion';
import { applySystemRolePermissionPolicy } from '../../utils/systemRolePermissionPolicy';
import {
  DASHBOARD_KPI_KEYS,
  RBAC_ACTIONS,
  RBAC_MODULE_KEYS,
  isRootAdminRole,
  isSuperAdminRole,
  normalizeActions,
  normalizeModuleKey,
  permissionKeysFromMap,
  normalizeRoleName,
} from '../../utils/rbac';

const ADMIN_GOVERNANCE_BLOCKED_MODULES = new Set(['ORGANIZATIONS', 'PLANTS', 'ROLE_ACCESS', 'MODULES', 'MASTERS']);

const roleCreateSchema = z.object({
  name: z.string().min(1).transform((value) => normalizeRoleName(value)),
  description: z.string().optional().nullable(),
});

const rolePatchSchema = z.object({
  name: z.string().min(1).transform((value) => normalizeRoleName(value)).optional(),
  description: z.string().optional().nullable(),
});

const rolePermissionsSchema = z.record(z.array(z.enum(RBAC_ACTIONS)).default([]));

const roleKpiSchema = z.array(
  z.object({
    kpiKey: z.string().min(1),
    isVisible: z.boolean(),
    displayOrder: z.coerce.number().int().default(0),
  }),
);

function getAllModulePermissions() {
  return Object.fromEntries(RBAC_MODULE_KEYS.map((moduleKey) => [moduleKey, [...RBAC_ACTIONS]])) as Record<string, string[]>;
}

function sanitizeRolePermissionPayload(roleName: string, payload: Record<string, string[]>) {
  if (isRootAdminRole(roleName)) {
    return getAllModulePermissions();
  }

  const normalized: Record<string, string[]> = {};
  for (const [moduleKey, actions] of Object.entries(payload)) {
    const normalizedModule = normalizeModuleKey(moduleKey);
    normalized[normalizedModule] = normalizeActions(actions);
  }
  return applySystemRolePermissionPolicy(roleName, normalized);
}

function sanitizeRoleKpisPayload(roleName: string, payload: Array<{ kpiKey: string; isVisible: boolean; displayOrder: number }>) {
  const normalized = payload.map((item, index) => ({
    kpiKey: item.kpiKey.trim().toUpperCase(),
    isVisible: item.isVisible,
    displayOrder: item.displayOrder ?? index,
  }));

  if (isRootAdminRole(roleName)) {
    const byKey = new Map(normalized.map((item) => [item.kpiKey, item]));
    DASHBOARD_KPI_KEYS.forEach((kpiKey, index) => {
      byKey.set(kpiKey, {
        kpiKey,
        isVisible: true,
        displayOrder: byKey.get(kpiKey)?.displayOrder ?? index,
      });
    });
    return Array.from(byKey.values());
  }

  return normalized;
}

function getRoleNamesFromAuth(req: Express.Request) {
  return req.auth?.roles.map((role) => normalizeRoleName(role)) ?? [];
}

function mergePermissions(rows: RolePermissionEntity[]) {
  const permissionMap: Record<string, string[]> = {};

  for (const row of rows) {
    const moduleKey = normalizeModuleKey(row.moduleKey ?? row.moduleId);
    if (!permissionMap[moduleKey]) {
      permissionMap[moduleKey] = [];
    }

    const normalized = normalizeActions(Array.isArray(row.actions) ? row.actions : []);
    normalized.forEach((action) => {
      if (!permissionMap[moduleKey].includes(action)) {
        permissionMap[moduleKey].push(action);
      }
    });
  }

  return permissionMap;
}

function isRootRoleName(roleName: string) {
  return normalizeRoleName(roleName) === 'ROOT_ADMIN';
}

function getActorRoleKey(req: Express.Request): string {
  const fromRoleKey = normalizeRoleName(req.auth?.roleKey ?? '');
  if (fromRoleKey) return fromRoleKey;
  const roles = getRoleNamesFromAuth(req);
  return roles[0] ?? 'USER';
}

function canActorManageRole(actorRoleKey: string, targetRoleName: string): boolean {
  const normalizedActor = normalizeRoleName(actorRoleKey);
  const normalizedTarget = normalizeRoleName(targetRoleName);
  if (isRootAdminRole(normalizedActor) || isSuperAdminRole(normalizedActor)) {
    return true;
  }
  if (normalizedActor === 'ADMIN') {
    return canAssignRole(normalizedActor, normalizedTarget);
  }
  return false;
}

function stripGovernanceModulesForAdmin(permissionMap: Record<string, string[]>): Record<string, string[]> {
  const filtered = { ...permissionMap };
  for (const moduleKey of ADMIN_GOVERNANCE_BLOCKED_MODULES) {
    delete filtered[moduleKey];
  }
  return filtered;
}

async function syncCatalogRolesForOrganization(organizationId: string | null) {
  if (!organizationId) return;
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  const roleRepo = AppDataSource.getRepository(RoleEntity);
  const orgRoles = await orgRoleRepo.find({
    where: { organizationId, isActive: true },
    select: ['key', 'name', 'isSystem'],
  });
  for (const role of orgRoles) {
    await ensureRoleCatalogEntry(roleRepo, role.key, {
      description: role.name,
      isSystem: role.isSystem,
    });
  }
}

export const rbacRouter = Router();
rbacRouter.use(requireAuth);

rbacRouter.get('/rbac/permissions/me', async (req, res, next) => {
  try {
    const roleNames = getRoleNamesFromAuth(req);
    const isRootAdmin = roleNames.some((role) => isRootAdminRole(role));
    const isSuperAdmin = roleNames.some((role) => isSuperAdminRole(role));

    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const permissionRepo = AppDataSource.getRepository(RolePermissionEntity);
    const kpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);

    const roles = roleNames.length
      ? await roleRepo.find({ where: roleNames.map((name) => ({ name, isActive: true })) })
      : [];

    const permissions = mergePermissions(
      await permissionRepo.find({
        where: [
          ...(roles.length > 0 ? [{ roleId: In(roles.map((role) => role.id)) }] : []),
          ...(roleNames.length > 0 ? roleNames.map((role) => ({ role })) : []),
        ],
      }),
    );

    const roleKey = req.auth?.roleKey ?? roleNames[0] ?? 'USER';
    const effectivePermissionMap = applySystemRolePermissionPolicy(roleKey, permissions);

    const roleKpis = roles.length
      ? await kpiRepo.find({ where: { roleId: In(roles.map((role) => role.id)) }, order: { displayOrder: 'ASC', createdAt: 'ASC' } })
      : [];

    const kpiVisibilityMap = new Map<string, { kpiKey: string; isVisible: boolean; displayOrder: number }>();
    roleKpis.forEach((item) => {
      const existing = kpiVisibilityMap.get(item.kpiKey);
      if (!existing || item.displayOrder < existing.displayOrder) {
        kpiVisibilityMap.set(item.kpiKey, {
          kpiKey: item.kpiKey,
          isVisible: item.isVisible,
          displayOrder: item.displayOrder,
        });
      }
    });

    if (isRootAdmin) {
      // ROOT_ADMIN is restricted to governance-only dashboards.
      kpiVisibilityMap.clear();
    }

    const kpis = Array.from(kpiVisibilityMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
    const profile = req.auth?.userId ? await profileRepo.findOneBy({ userId: req.auth.userId }) : null;
    const rbacVersion = await getRbacVersion();
    const permissionKeys = permissionKeysFromMap(effectivePermissionMap);

    res.json(
      ok({
        roleNames,
        roles: roleNames,
        roleKey,
        scopeType: req.auth?.scopeType ?? null,
        rolePrecedence: rolePrecedence(roleKey),
        isRootAdmin: roleNames.some((role) => normalizeRoleName(role) === 'ROOT_ADMIN'),
        isGlobal: isSuperAdmin,
        plantId: profile?.plantId ?? null,
        permissions: effectivePermissionMap,
        permissionKeys,
        allowedModules: Object.keys(effectivePermissionMap),
        allowedActionsByModule: effectivePermissionMap,
        allowedRoleTargetsForCreate: allowedRoleTargetsForCreate(roleKey),
        allowedRoleTargetsForEdit: allowedRoleTargetsForEdit(roleKey),
        kpis,
        kpiVisibility: kpis,
        plantIds: req.auth?.plantIds ?? [],
        accessAllPlants: req.auth?.accessAllPlants ?? false,
        rbacVersion,
      }),
    );
  } catch (error) {
    next(error);
  }
});

rbacRouter.get('/rbac/version', async (_req, res, next) => {
  try {
    const version = await getRbacVersion();
    res.json(ok({ version }));
  } catch (error) {
    next(error);
  }
});

rbacRouter.get('/roles', requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    await syncCatalogRolesForOrganization(req.auth?.organizationId ?? null);
    const repo = AppDataSource.getRepository(RoleEntity);
    const roles = await repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    const actorRoleKey = getActorRoleKey(req);
    const data = actorRoleKey === 'ADMIN' ? roles.filter((role) => canActorManageRole(actorRoleKey, role.name)) : roles;
    res.json(ok(data));
  } catch (error) {
    next(error);
  }
});

rbacRouter.post('/roles', requireRole(['ROOT_ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const body = roleCreateSchema.parse(req.body);
    const repo = AppDataSource.getRepository(RoleEntity);

    const existing = await repo.findOne({ where: { name: body.name } });
    if (existing) {
      res.status(409).json(fail('Role already exists'));
      return;
    }

    const created = repo.create({
      name: body.name,
      description: body.description ?? null,
      isSystem: false,
      isActive: true,
    });
    await repo.save(created);
    await bumpRbacVersion();

    await audit('roles.create', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'roles',
      entityId: created.id,
      statusCode: 201,
    });

    res.status(201).json(ok(created, 'Role created'));
  } catch (error) {
    next(error);
  }
});

rbacRouter.patch('/roles/:id', requireRole(['ROOT_ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = rolePatchSchema.parse(req.body);

    const repo = AppDataSource.getRepository(RoleEntity);
    const role = await repo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    if (role.isSystem && body.name && body.name !== role.name) {
      res.status(400).json(fail('System role name cannot be changed'));
      return;
    }

    if (body.name && body.name !== role.name) {
      const duplicate = await repo.findOneBy({ name: body.name });
      if (duplicate && duplicate.id !== role.id) {
        res.status(409).json(fail('Role name already exists'));
        return;
      }
      role.name = body.name;
    }

    if (body.description !== undefined) {
      role.description = body.description;
    }

    await repo.save(role);
    await bumpRbacVersion();

    await audit('roles.update', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'roles',
      entityId: role.id,
      statusCode: 200,
    });

    res.json(ok(role, 'Role updated'));
  } catch (error) {
    next(error);
  }
});

rbacRouter.delete('/roles/:id', requireRole(['ROOT_ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);

    const role = await roleRepo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const assignedCount = await userRoleRepo.count({ where: [{ roleId: role.id }, { role: role.name }] });
    const deletionCheck = canDeleteRoleByPolicy({ isSystem: role.isSystem, assignedUsers: assignedCount });
    if (!deletionCheck.allowed) {
      if (deletionCheck.reason === 'SYSTEM_ROLE') {
        res.status(409).json(fail('System role cannot be deleted'));
        return;
      }
      if (deletionCheck.reason === 'ROLE_ASSIGNED') {
        res.status(409).json(fail('Role is assigned to users and cannot be deleted'));
        return;
      }
      return;
    }

    role.isActive = false;
    await roleRepo.save(role);
    await bumpRbacVersion();

    await audit('roles.delete', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'roles',
      entityId: role.id,
      statusCode: 200,
    });

    res.json(ok({ id: role.id }, 'Role deleted'));
  } catch (error) {
    next(error);
  }
});

rbacRouter.get('/roles/:id/permissions', requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const permissionRepo = AppDataSource.getRepository(RolePermissionEntity);

    const role = await roleRepo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const actorRoleKey = getActorRoleKey(req);
    if (!canActorManageRole(actorRoleKey, role.name)) {
      res.status(403).json(fail('No permission to manage this role'));
      return;
    }

    if (isRootRoleName(role.name)) {
      res.json(ok(getAllModulePermissions()));
      return;
    }

    const rows = await permissionRepo.find({ where: [{ roleId: role.id }, { role: role.name }] });
    const permissions = mergePermissions(rows);
    const effectivePermissions = applySystemRolePermissionPolicy(role.name, permissions);

    res.json(ok(effectivePermissions));
  } catch (error) {
    next(error);
  }
});

rbacRouter.put('/roles/:id/permissions', requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = rolePermissionsSchema.parse(req.body ?? {});

    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const permissionRepo = AppDataSource.getRepository(RolePermissionEntity);

    const role = await roleRepo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const actorRoleKey = getActorRoleKey(req);
    if (!canActorManageRole(actorRoleKey, role.name)) {
      res.status(403).json(fail('No permission to manage this role'));
      return;
    }

    const sanitized = sanitizeRolePermissionPayload(role.name, body);
    const effectiveSanitized = normalizeRoleName(actorRoleKey) === 'ADMIN' ? stripGovernanceModulesForAdmin(sanitized) : sanitized;

    await permissionRepo.delete([{ roleId: role.id }, { role: role.name }]);

    const entries = Object.entries(effectiveSanitized)
      .filter(([, actions]) => actions.length > 0)
      .map(([moduleKey, actions]) =>
        permissionRepo.create({
          roleId: role.id,
          role: role.name,
          moduleKey,
          moduleId: moduleKey,
          actions,
        }),
      );

    if (entries.length > 0) {
      await permissionRepo.save(entries);
    }
    await bumpRbacVersion();

    await audit('roles.permissions.update', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_permissions',
      entityId: role.id,
      statusCode: 200,
    });

    res.json(ok(effectiveSanitized, 'Role permissions updated'));
  } catch (error) {
    next(error);
  }
});

rbacRouter.get('/roles/:id/kpis', requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const kpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);

    const role = await roleRepo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const actorRoleKey = getActorRoleKey(req);
    if (!canActorManageRole(actorRoleKey, role.name)) {
      res.status(403).json(fail('No permission to manage this role'));
      return;
    }

    const rows = await kpiRepo.find({ where: { roleId: role.id }, order: { displayOrder: 'ASC', createdAt: 'ASC' } });

    const data = isRootRoleName(role.name)
      ? DASHBOARD_KPI_KEYS.map((kpiKey, index) => ({ kpiKey, isVisible: true, displayOrder: index }))
      : rows.map((row) => ({ kpiKey: row.kpiKey, isVisible: row.isVisible, displayOrder: row.displayOrder }));

    res.json(ok(data));
  } catch (error) {
    next(error);
  }
});

rbacRouter.put('/roles/:id/kpis', requireRole(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const payload = roleKpiSchema.parse(req.body ?? []);

    const roleRepo = AppDataSource.getRepository(RoleEntity);
    const kpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);

    const role = await roleRepo.findOneBy({ id: params.id, isActive: true });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const actorRoleKey = getActorRoleKey(req);
    if (!canActorManageRole(actorRoleKey, role.name)) {
      res.status(403).json(fail('No permission to manage this role'));
      return;
    }

    const sanitized = sanitizeRoleKpisPayload(role.name, payload);

    await kpiRepo.delete({ roleId: role.id });

    const rows = sanitized.map((item) =>
      kpiRepo.create({
        roleId: role.id,
        kpiKey: item.kpiKey,
        isVisible: item.isVisible,
        displayOrder: item.displayOrder,
      }),
    );

    if (rows.length > 0) {
      await kpiRepo.save(rows);
    }
    await bumpRbacVersion();

    await audit('roles.kpis.update', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'role_dashboard_kpis',
      entityId: role.id,
      statusCode: 200,
    });

    res.json(ok(sanitized, 'Role KPI visibility updated'));
  } catch (error) {
    next(error);
  }
});
