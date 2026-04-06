import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { OrgRoleEntity, OrganizationEntity, PlantEntity, ProfileEntity, RefreshTokenEntity, RoleEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { getPrimaryRoleKey } from '../../utils/policy';
import { bumpOrgRbacVersion } from '../../utils/orgRbacVersion';
import { ensureRoleCatalogEntry } from '../../utils/roleCatalog';
import { normalizeRoleName } from '../../utils/rbac';
import { isSafeImageValue } from '../../utils/fileValidation';

const profileImageSchema = z
  .string()
  .trim()
  .max(2_500_000)
  .refine((value) => isSafeImageValue(value), 'profileImageUrl must be a valid secure image URL or supported data URL');

const rootUserCreateSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().nullable().optional(),
  profileImageUrl: profileImageSchema.optional().nullable(),
  userCode: z.string().min(1).nullable().optional(),
  roleKey: z.string().min(1),
  organizationId: z.string().uuid(),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

const rootUserPatchSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  phone: z.string().nullable().optional(),
  profileImageUrl: profileImageSchema.optional().nullable(),
  roleKey: z.string().min(1).optional(),
  organizationId: z.string().uuid().optional(),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

function normalizeRoleInput(role: string): 'SUPERADMIN' | 'ADMIN' | 'ROOT_ADMIN' | string {
  return normalizeRoleName(role.trim());
}

const SYSTEM_ORG_ROLE_DEFINITIONS = [
  { key: 'SUPERADMIN', name: 'SUPERADMIN', isSystem: true },
  { key: 'ADMIN', name: 'ADMIN', isSystem: true },
  { key: 'SECURITY', name: 'SECURITY', isSystem: true },
  { key: 'VENDOR', name: 'VENDOR', isSystem: true },
  { key: 'VISITOR', name: 'VISITOR', isSystem: true },
  { key: 'TEMPORARY_VISITOR', name: 'TEMPORARY_VISITOR', isSystem: true },
  { key: 'USER', name: 'USER', isSystem: true },
] as const;

const SYSTEM_CATALOG_ROLE_KEYS = new Set(['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'USER', 'SECURITY', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR']);

function getManagedRoleKey(roles: string[]): 'ROOT_ADMIN' | 'SUPERADMIN' | 'ADMIN' | null {
  const normalized = roles.map((role) => normalizeRoleInput(role));
  if (normalized.includes('ROOT_ADMIN')) return 'ROOT_ADMIN';
  if (normalized.includes('SUPERADMIN')) return 'SUPERADMIN';
  if (normalized.includes('ADMIN')) return 'ADMIN';
  return null;
}

function roleRequiresPlantScope(roleKey: string): boolean {
  const normalized = normalizeRoleInput(roleKey);
  return normalized !== 'ROOT_ADMIN' && normalized !== 'SUPERADMIN';
}

function userCodePrefixForRole(roleKey: string): string {
  const normalized = normalizeRoleInput(roleKey);
  if (normalized === 'ROOT_ADMIN') return 'RTA';
  if (normalized === 'SUPERADMIN') return 'SUP';
  const compact = normalized.replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return (compact || 'USR').padEnd(3, 'U').slice(0, 3);
}

async function generateUserCode(prefix: string): Promise<string> {
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await profileRepo.findOne({ where: { userCode: code }, select: ['id'] });
    if (!exists) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

async function ensureOrganization(organizationId: string) {
  const organization = await AppDataSource.getRepository(OrganizationEntity).findOneBy({ id: organizationId, isActive: true });
  return organization;
}

async function ensurePlantForOrganization(plantId: string | null, organizationId: string) {
  if (!plantId) return null;
  const plant = await AppDataSource.getRepository(PlantEntity).findOneBy({ id: plantId, isActive: true });
  if (!plant) return null;
  if (plant.organizationId !== organizationId) return null;
  return plant;
}

async function ensureSystemOrgRole(organizationId: string, roleKey: string) {
  const normalizedRole = normalizeRoleInput(roleKey);
  const roleDef = SYSTEM_ORG_ROLE_DEFINITIONS.find((item) => item.key === normalizedRole);
  if (!roleDef) {
    return null;
  }

  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  const existing = await orgRoleRepo.findOneBy({ organizationId, key: roleDef.key });
  if (existing) {
    if (!existing.isActive || !existing.isSystem || existing.name !== roleDef.name) {
      existing.name = roleDef.name;
      existing.isSystem = roleDef.isSystem;
      existing.isActive = true;
      return orgRoleRepo.save(existing);
    }
    return existing;
  }

  return orgRoleRepo.save(
    orgRoleRepo.create({
      organizationId,
      key: roleDef.key,
      name: roleDef.name,
      isSystem: roleDef.isSystem,
      isActive: true,
    }),
  );
}

type LegacyScopeRow = {
  userId: string;
  userOrganizationId: string | null;
  userOrgRoleId: string | null;
  orgRoleOrganizationId: string | null;
  orgRoleKey: string | null;
  role: string | null;
  profilePlantOrganizationId: string | null;
  rolePlantOrganizationId: string | null;
};

async function repairLegacyManagedUserScopeAssignments() {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const orgRepo = AppDataSource.getRepository(OrganizationEntity);
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);

  const activeOrganizations = await orgRepo.find({
    where: { isActive: true },
    select: ['id'],
  });
  const singleActiveOrganizationId = activeOrganizations.length === 1 ? activeOrganizations[0].id : null;

  const rows = await userRepo
    .createQueryBuilder('usr')
    .leftJoin(OrgRoleEntity, 'org_role', 'org_role.id = usr.org_role_id')
    .leftJoin(UserRoleEntity, 'ur', 'ur.user_id = usr.id')
    .leftJoin(ProfileEntity, 'profile', 'profile.user_id = usr.id')
    .leftJoin(PlantEntity, 'profile_plant', 'profile_plant.id = profile.plant_id')
    .leftJoin(PlantEntity, 'role_plant', 'role_plant.id = ur.plant_id')
    .where('(usr.organization_id IS NULL OR usr.org_role_id IS NULL)')
    .andWhere('(UPPER(COALESCE(org_role.key, \'\')) IN (:...allowedRoles) OR UPPER(COALESCE(ur.role, \'\')) IN (:...allowedRoles))', {
      allowedRoles: ['ROOT_ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'ADMIN'],
    })
    .select([
      'usr.id AS "userId"',
      'usr.organization_id AS "userOrganizationId"',
      'usr.org_role_id AS "userOrgRoleId"',
      'org_role.organization_id AS "orgRoleOrganizationId"',
      'org_role.key AS "orgRoleKey"',
      'ur.role AS role',
      'profile_plant.organization_id AS "profilePlantOrganizationId"',
      'role_plant.organization_id AS "rolePlantOrganizationId"',
    ])
    .getRawMany<LegacyScopeRow>();

  if (rows.length === 0) {
    return;
  }

  const orgRoles = await orgRoleRepo.find({
    where: [{ key: 'SUPERADMIN', isActive: true }, { key: 'SUPER_ADMIN', isActive: true }, { key: 'ADMIN', isActive: true }],
    select: ['id', 'organizationId', 'key'],
  });
  const orgRoleIdByOrgAndKey = new Map<string, string>();
  for (const role of orgRoles) {
    orgRoleIdByOrgAndKey.set(`${role.organizationId}:${normalizeRoleInput(role.key)}`, role.id);
  }

  const rowsByUser = new Map<string, LegacyScopeRow[]>();
  for (const row of rows) {
    if (!row.userId) continue;
    const bucket = rowsByUser.get(row.userId) ?? [];
    bucket.push(row);
    rowsByUser.set(row.userId, bucket);
  }

  const updates: Promise<unknown>[] = [];
  rowsByUser.forEach((userRows, userId) => {
    const roleCandidates = userRows.flatMap((row) => [row.orgRoleKey ?? '', row.role ?? '']).filter((value) => value.length > 0);
    const managedRole = getManagedRoleKey(roleCandidates);
    if (!managedRole) return;

    const firstRow = userRows[0];
    const inferredOrganizationId =
      firstRow.userOrganizationId ??
      firstRow.orgRoleOrganizationId ??
      userRows.map((row) => row.profilePlantOrganizationId).find((value): value is string => Boolean(value)) ??
      userRows.map((row) => row.rolePlantOrganizationId).find((value): value is string => Boolean(value)) ??
      (managedRole === 'ROOT_ADMIN' || managedRole === 'SUPERADMIN' ? singleActiveOrganizationId : null);

    if (!inferredOrganizationId) {
      return;
    }

    const inferredOrgRoleId =
      firstRow.userOrgRoleId ?? orgRoleIdByOrgAndKey.get(`${inferredOrganizationId}:${managedRole}`) ?? null;

    const patch: { organizationId?: string; orgRoleId?: string } = {};
    if (!firstRow.userOrganizationId) {
      patch.organizationId = inferredOrganizationId;
    }
    if (!firstRow.userOrgRoleId && inferredOrgRoleId) {
      patch.orgRoleId = inferredOrgRoleId;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }

    updates.push(userRepo.update({ id: userId }, patch));
  });

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

async function permanentlyDeleteManagedRootUser(userId: string) {
  await AppDataSource.transaction(async (manager) => {
    await manager.delete(RefreshTokenEntity, { userId });
    await manager.delete(UserRoleEntity, { userId });
    await manager.delete(ProfileEntity, { userId });
    await manager.delete(UserEntity, { id: userId });
  });
}

export const rootUsersRouter = Router();
rootUsersRouter.use('/root/users', requireAuth, requireRole(['ROOT_ADMIN']));

rootUsersRouter.get('/root/users', async (req, res, next) => {
  try {
    await repairLegacyManagedUserScopeAssignments();

    const query = parseListQuery(req.query as Record<string, unknown>);
    const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : null;
    const roleKeyFilterRaw = typeof req.query.roleKey === 'string' ? req.query.roleKey : null;
    const roleKeyFilter = roleKeyFilterRaw ? normalizeRoleInput(roleKeyFilterRaw) : null;
    const userRepo = AppDataSource.getRepository(UserEntity);
    const qb = userRepo
      .createQueryBuilder('usr')
      .leftJoin(ProfileEntity, 'profile', 'profile.user_id = usr.id')
      .leftJoin(OrgRoleEntity, 'org_role', 'org_role.id = usr.org_role_id')
      .leftJoin(UserRoleEntity, 'ur', 'ur.user_id = usr.id')
      .leftJoin(PlantEntity, 'plant', 'plant.id = profile.plant_id')
      .leftJoin(OrganizationEntity, 'org', 'org.id = COALESCE(usr.organization_id, org_role.organization_id, plant.organization_id)')
      .where('1 = 1');

    if (organizationId) {
      qb.andWhere(
        '(usr.organization_id = :organizationId OR org_role.organization_id = :organizationId OR plant.organization_id = :organizationId)',
        { organizationId },
      );
    }

    if (roleKeyFilter) {
      qb.andWhere('(UPPER(COALESCE(org_role.key, \'\')) = :roleKeyFilter OR UPPER(COALESCE(ur.role, \'\')) = :roleKeyFilter)', {
        roleKeyFilter,
      });
    }

    if (!query.includeInactive) {
      qb.andWhere('usr.is_active = :active', { active: true });
    }

    if (query.search) {
      const term = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(usr.full_name) LIKE :term OR LOWER(usr.email) LIKE :term OR LOWER(COALESCE(profile.phone, '')) LIKE :term OR LOWER(COALESCE(profile.user_code, '')) LIKE :term)`,
        { term },
      );
    }

    qb.orderBy('usr.created_at', 'DESC');

    const rows = await qb
      .select([
        'usr.id AS id',
        'usr.full_name AS "fullName"',
        'usr.email AS email',
        'usr.phone AS phone',
        'usr.is_active AS "isActive"',
        'usr.created_at AS "createdAt"',
        'COALESCE(usr.organization_id, org_role.organization_id, plant.organization_id) AS "organizationId"',
        'profile.plant_id AS "plantId"',
        'profile.user_code AS "userCode"',
        'profile.profile_image_url AS "profileImageUrl"',
        'plant.plant_name AS "plantName"',
        'org.name AS "organizationName"',
        'org_role.key AS "orgRoleKey"',
        'ur.role AS role',
      ])
      .getRawMany<Record<string, unknown>>();

    const byUserId = new Map<
      string,
      {
        id: string;
        fullName: string;
        email: string;
        phone: string | null;
        isActive: boolean;
        createdAt: string;
        organizationId: string;
        plantId: string | null;
        plantName: string | null;
        userCode: string | null;
        profileImageUrl: string | null;
        organizationName: string | null;
        lastLoginAt: string | null;
        roles: Set<string>;
      }
    >();
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const current = byUserId.get(id) ?? {
        id,
        fullName: String(row.fullName ?? ''),
        email: String(row.email ?? ''),
        phone: (row.phone as string | null) ?? null,
        isActive: row.isActive === true || row.isActive === 'true' || row.isActive === 1 || row.isActive === '1',
        createdAt: String(row.createdAt ?? ''),
        organizationId: String(row.organizationId ?? ''),
        plantId: (row.plantId as string | null) ?? null,
        plantName: (row.plantName as string | null) ?? null,
        userCode: (row.userCode as string | null) ?? null,
        profileImageUrl: (row.profileImageUrl as string | null) ?? null,
        organizationName: (row.organizationName as string | null) ?? null,
        lastLoginAt: null,
        roles: new Set<string>(),
      };

      const candidateRoles = [row.orgRoleKey, row.role]
        .map((value) => (typeof value === 'string' ? normalizeRoleInput(value) : ''))
        .filter((value) => value.length > 0);
      candidateRoles.forEach((role) => current.roles.add(role));

      if (!current.plantId && row.plantId) {
        current.plantId = row.plantId as string;
        current.plantName = (row.plantName as string | null) ?? null;
      }
      if (!current.organizationId && row.organizationId) {
        current.organizationId = String(row.organizationId);
        current.organizationName = (row.organizationName as string | null) ?? null;
      }
      byUserId.set(id, current);
    }

    const entries = Array.from(byUserId.values())
      .map((entry) => ({
        ...entry,
        roleKey: getPrimaryRoleKey(entry.roles.size > 0 ? Array.from(entry.roles) : ['USER']),
      }))
      .filter((entry) => !roleKeyFilter || normalizeRoleInput(entry.roleKey) === roleKeyFilter);
    const total = entries.length;
    const start = (query.page - 1) * query.limit;
    const data = entries.slice(start, start + query.limit);

    res.json(ok(data, 'Root users fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

rootUsersRouter.post('/root/users', async (req, res, next) => {
  try {
    const body = rootUserCreateSchema.parse(req.body);
    const normalizedRole = normalizeRoleInput(body.roleKey);

    const organization = await ensureOrganization(body.organizationId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const resolvedPlantId = roleRequiresPlantScope(normalizedRole) ? (body.plantId ?? null) : null;
    if (roleRequiresPlantScope(normalizedRole) && !resolvedPlantId) {
      res.status(400).json(fail('plantId is required for scoped roles'));
      return;
    }
    if (resolvedPlantId) {
      const plant = await ensurePlantForOrganization(resolvedPlantId, body.organizationId);
      if (!plant) {
        res.status(400).json(fail('Selected plant does not belong to organization'));
        return;
      }
    }

    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const roleDefRepo = AppDataSource.getRepository(RoleEntity);
    const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
    await ensureSystemOrgRole(body.organizationId, normalizedRole);
    const orgRole = normalizedRole === 'ROOT_ADMIN'
      ? null
      : await orgRoleRepo.findOneBy({ organizationId: body.organizationId, key: normalizedRole, isActive: true });
    if (normalizedRole !== 'ROOT_ADMIN' && !orgRole) {
      res.status(400).json(fail(`Organization role ${normalizedRole} is not configured`));
      return;
    }
    const roleDef = await ensureRoleCatalogEntry(roleDefRepo, normalizedRole, {
      description: `${organization.name} role: ${orgRole?.name ?? normalizedRole}`,
      isSystem: SYSTEM_CATALOG_ROLE_KEYS.has(normalizedRole),
    });

    const existingUser = await userRepo.findOneBy({ email: body.email.toLowerCase() });
    if (existingUser) {
      res.status(409).json(fail('Email already exists'));
      return;
    }

    const userCode = body.userCode?.trim() || (await generateUserCode(userCodePrefixForRole(normalizedRole)));
    const existingProfileByCode = await profileRepo.findOne({ where: { userCode }, select: ['id'] });
    if (existingProfileByCode) {
      res.status(409).json(fail('User code already exists'));
      return;
    }

    const created = await AppDataSource.transaction(async (manager) => {
      const txUserRepo = manager.getRepository(UserEntity);
      const txProfileRepo = manager.getRepository(ProfileEntity);
      const txRoleRepo = manager.getRepository(UserRoleEntity);

      const user = txUserRepo.create({
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        fullName: body.fullName.trim(),
        phone: body.phone ?? null,
        isActive: body.isActive,
        organizationId: body.organizationId,
        orgRoleId: orgRole?.id ?? null,
      });
      await txUserRepo.save(user);

      const profile = txProfileRepo.create({
        userId: user.id,
        userCode,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profileImageUrl: body.profileImageUrl?.trim() || null,
        plantId: resolvedPlantId,
        department: null,
        isActive: body.isActive,
      });
      await txProfileRepo.save(profile);

      const roleRow = txRoleRepo.create({
        userId: user.id,
        roleId: roleDef.id,
        role: normalizedRole,
        plantId: resolvedPlantId,
      });
      await txRoleRepo.save(roleRow);

      return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        roleKey: normalizedRole,
        organizationId: user.organizationId,
        organizationName: organization.name,
        plantId: profile.plantId,
        plantName: resolvedPlantId ? (await ensurePlantForOrganization(resolvedPlantId, body.organizationId))?.plantName ?? null : null,
        userCode: profile.userCode,
        profileImageUrl: profile.profileImageUrl,
        isActive: user.isActive,
        createdAt: user.createdAt,
      };
    });

    await bumpOrgRbacVersion(body.organizationId);

    res.status(201).json(ok(created, 'Root user created'));
  } catch (error) {
    next(error);
  }
});

rootUsersRouter.patch('/root/users/:id', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = rootUserPatchSchema.parse(req.body);

    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const roleDefRepo = AppDataSource.getRepository(RoleEntity);
    const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }

    const existingRoles = await roleRepo.find({ where: { userId: user.id } });
    const existingOrgRole = user.orgRoleId && user.organizationId
      ? await orgRoleRepo.findOneBy({ id: user.orgRoleId, organizationId: user.organizationId })
      : null;
    const normalizedExistingRoles = Array.from(
      new Set([
        ...existingRoles.map((row) => normalizeRoleInput(row.role)),
        ...(existingOrgRole?.key ? [normalizeRoleInput(existingOrgRole.key)] : []),
      ]),
    );
    const currentRole = normalizedExistingRoles.length > 0 ? getPrimaryRoleKey(normalizedExistingRoles) : 'USER';
    const nextRole = body.roleKey ? normalizeRoleInput(body.roleKey) : currentRole;

    const nextOrganizationId = body.organizationId ?? user.organizationId;
    if (!nextOrganizationId) {
      res.status(400).json(fail('organizationId is required'));
      return;
    }
    const organization = await ensureOrganization(nextOrganizationId);
    if (!organization) {
      res.status(404).json(fail('Organization not found'));
      return;
    }

    const profile = await profileRepo.findOneBy({ userId: user.id });
    const nextPlantId = roleRequiresPlantScope(nextRole)
      ? (body.plantId === undefined ? (profile?.plantId ?? null) : body.plantId)
      : null;
    const nextPlant = nextPlantId ? await ensurePlantForOrganization(nextPlantId, nextOrganizationId) : null;
    if (roleRequiresPlantScope(nextRole) && !nextPlantId) {
      res.status(400).json(fail('plantId is required for scoped roles'));
      return;
    }
    if (nextPlantId) {
      if (!nextPlant) {
        res.status(400).json(fail('Selected plant does not belong to organization'));
        return;
      }
    }

    if (body.email !== undefined) {
      const normalizedEmail = body.email.toLowerCase();
      const duplicate = await userRepo.findOneBy({ email: normalizedEmail });
      if (duplicate && duplicate.id !== user.id) {
        res.status(409).json(fail('Email already exists'));
        return;
      }
    }

    const previousOrganizationId = user.organizationId;

    if (body.fullName !== undefined) user.fullName = body.fullName.trim();
    if (body.email !== undefined) user.email = body.email.toLowerCase();
    if (body.phone !== undefined) user.phone = body.phone ?? null;
    if (body.isActive !== undefined) user.isActive = body.isActive;
    user.organizationId = nextOrganizationId;
    await ensureSystemOrgRole(nextOrganizationId, nextRole);
    const nextOrgRole = nextRole === 'ROOT_ADMIN'
      ? null
      : await orgRoleRepo.findOneBy({ organizationId: nextOrganizationId, key: nextRole, isActive: true });
    if (nextRole !== 'ROOT_ADMIN' && !nextOrgRole) {
      res.status(400).json(fail(`Organization role ${nextRole} is not configured`));
      return;
    }
    user.orgRoleId = nextOrgRole?.id ?? null;
    if (body.password) {
      user.passwordHash = await hashPassword(body.password);
    }
    await userRepo.save(user);

    let resolvedProfile = profile;
    if (!resolvedProfile) {
      resolvedProfile = profileRepo.create({
        userId: user.id,
        userCode: await generateUserCode(userCodePrefixForRole(nextRole)),
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profileImageUrl: body.profileImageUrl?.trim() || null,
        plantId: nextPlantId,
        department: null,
        isActive: user.isActive,
      });
    } else {
      resolvedProfile.fullName = user.fullName;
      resolvedProfile.email = user.email;
      resolvedProfile.phone = user.phone;
      if (body.profileImageUrl !== undefined) {
        resolvedProfile.profileImageUrl = body.profileImageUrl?.trim() || null;
      }
      resolvedProfile.plantId = nextPlantId;
      resolvedProfile.isActive = user.isActive;
    }
    await profileRepo.save(resolvedProfile);

    const roleDef = await ensureRoleCatalogEntry(roleDefRepo, nextRole, {
      description: `${organization.name} role: ${nextOrgRole?.name ?? nextRole}`,
      isSystem: SYSTEM_CATALOG_ROLE_KEYS.has(nextRole),
    });
    await roleRepo.delete({ userId: user.id });
    await roleRepo.save(
      roleRepo.create({
        userId: user.id,
        roleId: roleDef.id,
        role: nextRole,
        plantId: nextPlantId,
      }),
    );

    await bumpOrgRbacVersion(nextOrganizationId);
    if (previousOrganizationId && previousOrganizationId !== nextOrganizationId) {
      await bumpOrgRbacVersion(previousOrganizationId);
    }

    res.json(
      ok({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        roleKey: nextRole,
        organizationId: user.organizationId,
        organizationName: organization.name,
        plantId: resolvedProfile.plantId,
        plantName: nextPlant?.plantName ?? null,
        userCode: resolvedProfile.userCode,
        profileImageUrl: resolvedProfile.profileImageUrl,
        isActive: user.isActive,
        createdAt: user.createdAt,
      }, 'Root user updated'),
    );
  } catch (error) {
    next(error);
  }
});

rootUsersRouter.delete('/root/users/:id', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const userRepo = AppDataSource.getRepository(UserEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }

    const organizationId = user.organizationId;

    await permanentlyDeleteManagedRootUser(user.id);

    if (organizationId) {
      await bumpOrgRbacVersion(organizationId);
    }

    res.json(ok({ id: user.id, deleted: true }, 'Root user deleted permanently'));
  } catch (error) {
    next(error);
  }
});
