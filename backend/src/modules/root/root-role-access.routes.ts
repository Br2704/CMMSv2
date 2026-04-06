import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { OrganizationEntity, OrganizationFeatureEntity, OrgRoleEntity, OrgRolePermissionEntity, RoleEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRootAdmin } from '../../middlewares/requireRootAdmin';
import { fail, ok } from '../../utils/apiResponse';
import { bumpOrgRbacVersion, getOrgRbacVersion } from '../../utils/orgRbacVersion';
import { ensureRoleCatalogEntry } from '../../utils/roleCatalog';
import { RBAC_ACTIONS, normalizeActions, normalizeModuleKey, normalizeRoleName } from '../../utils/rbac';
import { applySystemRolePermissionPolicy, isSystemManagedOrganizationRole } from '../../utils/systemRolePermissionPolicy';

const orgRoleSchema = z.object({
  key: z.string().min(1).transform((value) => normalizeRoleName(value)),
  name: z.string().min(1),
  isActive: z.boolean().default(true),
});

const orgRolePatchSchema = z.object({
  key: z.string().min(1).transform((value) => normalizeRoleName(value)).optional(),
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const permissionMapSchema = z.record(z.array(z.enum(RBAC_ACTIONS)).default([]));
const featureMapSchema = z.record(z.boolean());

const DEFAULT_FEATURE_KEYS = ['SAFETY', 'ESG', 'GATE_ENTRY', 'ADVANCED_ANALYTICS', 'HR'] as const;
const DEFAULT_ORG_ROLES = [
  { key: 'SUPERADMIN', name: 'SUPERADMIN', isSystem: true },
  { key: 'ADMIN', name: 'ADMIN', isSystem: true },
  { key: 'SECURITY', name: 'SECURITY', isSystem: true },
  { key: 'VENDOR', name: 'VENDOR', isSystem: true },
  { key: 'VISITOR', name: 'VISITOR', isSystem: true },
  { key: 'TEMPORARY_VISITOR', name: 'TEMPORARY_VISITOR', isSystem: true },
  { key: 'USER', name: 'USER', isSystem: true },
] as const;

async function ensureDefaultOrgRoles(organizationId: string) {
  const roleRepo = AppDataSource.getRepository(OrgRoleEntity);
  const catalogRepo = AppDataSource.getRepository(RoleEntity);
  for (const roleDef of DEFAULT_ORG_ROLES) {
    const existing = await roleRepo.findOneBy({ organizationId, key: roleDef.key });
    await ensureRoleCatalogEntry(catalogRepo, roleDef.key, {
      description: `${roleDef.name} role`,
      isSystem: true,
    });
    if (existing) {
      continue;
    }
    await roleRepo.save(
      roleRepo.create({
        organizationId,
        key: roleDef.key,
        name: roleDef.name,
        isSystem: roleDef.isSystem,
        isActive: true,
      }),
    );
  }
}

function toPermissionMap(rows: OrgRolePermissionEntity[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    const moduleKey = normalizeModuleKey(row.moduleKey);
    if (!map[moduleKey]) {
      map[moduleKey] = [];
    }
    const actions = normalizeActions(Array.isArray(row.actions) ? row.actions : []);
    for (const action of actions) {
      if (!map[moduleKey].includes(action)) {
        map[moduleKey].push(action);
      }
    }
  }
  return map;
}

async function ensureOrganization(orgId: string) {
  const organization = await AppDataSource.getRepository(OrganizationEntity).findOneBy({ id: orgId });
  return organization;
}

async function syncOrganizationRoleCatalog(orgId: string, organizationName?: string | null) {
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  const catalogRepo = AppDataSource.getRepository(RoleEntity);
  const roles = await orgRoleRepo.find({
    where: { organizationId: orgId },
    select: ['key', 'name', 'isSystem', 'isActive'],
  });

  for (const role of roles) {
    if (!role.isActive) continue;
    await ensureRoleCatalogEntry(catalogRepo, role.key, {
      description: organizationName ? `${organizationName} role: ${role.name}` : `${role.name} role`,
      isSystem: role.isSystem,
    });
  }
}

export const rootRoleAccessRouter = Router();
rootRoleAccessRouter.use('/orgs/:orgId', requireAuth);
rootRoleAccessRouter.use('/orgs/:orgId/roles', requireRootAdmin);
rootRoleAccessRouter.use('/orgs/:orgId/features', requireRootAdmin);

rootRoleAccessRouter.get('/orgs/:orgId/roles', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid() }).parse(req.params);
    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }
    await ensureDefaultOrgRoles(params.orgId);

    const rows = await AppDataSource.getRepository(OrgRoleEntity).find({
      where: { organizationId: params.orgId },
      order: { isSystem: 'DESC', key: 'ASC' },
    });
    await syncOrganizationRoleCatalog(params.orgId, organization.name);

    res.json(ok(rows, 'Organization roles fetched'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.post('/orgs/:orgId/roles', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid() }).parse(req.params);
    const body = orgRoleSchema.parse(req.body);

    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const repo = AppDataSource.getRepository(OrgRoleEntity);
    const duplicate = await repo.findOneBy({ organizationId: params.orgId, key: body.key });
    if (duplicate) {
      res.status(409).json(fail('Role key already exists in this organization'));
      return;
    }

    const created = repo.create({
      organizationId: params.orgId,
      key: body.key,
      name: body.name.trim(),
      isSystem: false,
      isActive: body.isActive,
    });
    await repo.save(created);
    await ensureRoleCatalogEntry(AppDataSource.getRepository(RoleEntity), created.key, {
      description: `${organization.name} role: ${created.name}`,
      isSystem: created.isSystem,
    });
    await bumpOrgRbacVersion(params.orgId);

    res.status(201).json(ok(created, 'Organization role created'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.patch('/orgs/:orgId/roles/:roleId', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid(), roleId: z.string().uuid() }).parse(req.params);
    const body = orgRolePatchSchema.parse(req.body);

    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const repo = AppDataSource.getRepository(OrgRoleEntity);
    const role = await repo.findOneBy({ id: params.roleId, organizationId: params.orgId });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    if (role.isSystem && body.key && body.key !== role.key) {
      res.status(400).json(fail('System role key cannot be changed'));
      return;
    }

    const previousKey = role.key;
    if (body.key && body.key !== role.key) {
      const duplicate = await repo.findOneBy({ organizationId: params.orgId, key: body.key });
      if (duplicate && duplicate.id !== role.id) {
        res.status(409).json(fail('Role key already exists in this organization'));
        return;
      }
      role.key = body.key;
    }
    if (body.name !== undefined) {
      role.name = body.name.trim();
    }
    if (body.isActive !== undefined) {
      role.isActive = body.isActive;
    }

    await repo.save(role);
    await ensureRoleCatalogEntry(AppDataSource.getRepository(RoleEntity), role.key, {
      description: `${organization.name} role: ${role.name}`,
      isSystem: role.isSystem,
    });
    if (previousKey !== role.key) {
      const scopedUsers = await AppDataSource.getRepository(UserEntity).find({
        where: { orgRoleId: role.id },
        select: ['id'],
      });
      const scopedUserIds = scopedUsers.map((user) => user.id);
      if (scopedUserIds.length > 0) {
        await AppDataSource.getRepository(UserRoleEntity)
          .createQueryBuilder()
          .update(UserRoleEntity)
          .set({ role: role.key })
          .where('user_id IN (:...userIds)', { userIds: scopedUserIds })
          .andWhere('UPPER(role) = :previousKey', { previousKey })
          .execute();
      }
    }
    await bumpOrgRbacVersion(params.orgId);

    res.json(ok(role, 'Organization role updated'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.delete('/orgs/:orgId/roles/:roleId', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid(), roleId: z.string().uuid() }).parse(req.params);
    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const roleRepo = AppDataSource.getRepository(OrgRoleEntity);
    const role = await roleRepo.findOneBy({ id: params.roleId, organizationId: params.orgId });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    if (role.isSystem || isSystemManagedOrganizationRole(role.key)) {
      res.status(409).json(fail('System role cannot be deleted'));
      return;
    }

    const assignedUsers = await AppDataSource.getRepository(UserEntity).count({ where: { orgRoleId: role.id, isActive: true } });
    if (assignedUsers > 0) {
      res.status(409).json(fail('Role is assigned to users'));
      return;
    }

    await roleRepo.delete({ id: role.id });
    await AppDataSource.getRepository(OrgRolePermissionEntity).delete({ roleId: role.id });
    await bumpOrgRbacVersion(params.orgId);

    res.json(ok({ id: role.id, deleted: true }, 'Organization role deleted'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.get('/orgs/:orgId/roles/:roleId/permissions', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid(), roleId: z.string().uuid() }).parse(req.params);
    const role = await AppDataSource.getRepository(OrgRoleEntity).findOneBy({ id: params.roleId, organizationId: params.orgId });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const rows = await AppDataSource.getRepository(OrgRolePermissionEntity).find({
      where: { organizationId: params.orgId, roleId: role.id },
      order: { moduleKey: 'ASC' },
    });
    res.json(ok(toPermissionMap(rows), 'Organization role permissions fetched'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.put('/orgs/:orgId/roles/:roleId/permissions', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid(), roleId: z.string().uuid() }).parse(req.params);
    const payload = permissionMapSchema.parse(req.body ?? {});
    const role = await AppDataSource.getRepository(OrgRoleEntity).findOneBy({ id: params.roleId, organizationId: params.orgId });
    if (!role) {
      res.status(404).json(fail('Role not found'));
      return;
    }

    const normalizedPayload = Object.fromEntries(
      Object.entries(payload).map(([moduleKey, actions]) => [normalizeModuleKey(moduleKey), normalizeActions(actions)]),
    );
    const effectivePayload = applySystemRolePermissionPolicy(role.key, normalizedPayload);

    const repo = AppDataSource.getRepository(OrgRolePermissionEntity);
    await repo.delete({ organizationId: params.orgId, roleId: role.id });

    const rows = Object.entries(effectivePayload)
      .map(([moduleKey, actions]) => ({
        moduleKey: normalizeModuleKey(moduleKey),
        actions: normalizeActions(actions),
      }))
      .filter((entry) => entry.actions.length > 0)
      .map((entry) =>
        repo.create({
          organizationId: params.orgId,
          roleId: role.id,
          moduleKey: entry.moduleKey,
          actions: entry.actions,
        }),
      );
    if (rows.length > 0) {
      await repo.save(rows);
    }

    const version = await bumpOrgRbacVersion(params.orgId);
    const saved = await repo.find({ where: { organizationId: params.orgId, roleId: role.id } });
    res.json(ok({ permissions: toPermissionMap(saved), version }, 'Organization role permissions updated'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.get('/orgs/:orgId/rbac/version', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid() }).parse(req.params);
    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }
    const normalizedRoles = req.auth?.roles.map((role) => normalizeRoleName(role)) ?? [];
    const normalizedRoleKey = normalizeRoleName(req.auth?.roleKey ?? '');
    const isRootAdmin = normalizedRoleKey === 'ROOT_ADMIN' || normalizedRoles.includes('ROOT_ADMIN');
    if (!isRootAdmin && req.auth?.organizationId !== params.orgId) {
      res.status(403).json(fail('Forbidden'));
      return;
    }
    const version = await getOrgRbacVersion(params.orgId);
    res.json(ok({ version }, 'Organization RBAC version fetched'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.get('/orgs/:orgId/features', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid() }).parse(req.params);
    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const rows = await AppDataSource.getRepository(OrganizationFeatureEntity).find({
      where: { organizationId: params.orgId },
      order: { featureKey: 'ASC' },
    });
    const map = Object.fromEntries(rows.map((row) => [row.featureKey, row.enabled]));

    DEFAULT_FEATURE_KEYS.forEach((featureKey) => {
      if (!(featureKey in map)) {
        map[featureKey] = false;
      }
    });

    res.json(ok(map, 'Organization features fetched'));
  } catch (error) {
    next(error);
  }
});

rootRoleAccessRouter.put('/orgs/:orgId/features', async (req, res, next) => {
  try {
    const params = z.object({ orgId: z.string().uuid() }).parse(req.params);
    const payload = featureMapSchema.parse(req.body ?? {});
    const organization = await ensureOrganization(params.orgId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const repo = AppDataSource.getRepository(OrganizationFeatureEntity);
    for (const [featureKeyRaw, enabled] of Object.entries(payload)) {
      const featureKey = featureKeyRaw.trim().toUpperCase();
      let row = await repo.findOneBy({ organizationId: params.orgId, featureKey });
      if (!row) {
        row = repo.create({ organizationId: params.orgId, featureKey, enabled });
      } else {
        row.enabled = enabled;
      }
      await repo.save(row);
    }

    const rows = await repo.find({ where: { organizationId: params.orgId } });
    const map = Object.fromEntries(rows.map((row) => [row.featureKey, row.enabled]));
    res.json(ok(map, 'Organization features updated'));
  } catch (error) {
    next(error);
  }
});
