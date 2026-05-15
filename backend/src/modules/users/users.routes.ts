import { Router } from 'express';
import { In } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { OrgRoleEntity, PlantEntity, ProfileEntity, RefreshTokenEntity, RoleEntity, UserEntity, UserRoleEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { forbidFieldsByRole } from '../../middlewares/fieldAuthorization';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { isProtectedRootAdminEmail } from '../../config/protectedRootAdmin';
import {
  canAssignRole,
  canCreateUser,
  canEditUser,
  canViewUser,
  enforcePlantScope,
  getPrimaryRoleKey,
  type PolicyActor,
  type PolicyTargetUser,
} from '../../utils/policy';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { isStrongPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE } from '../../utils/passwordPolicy';
import { applyPlantScope, applySearch } from '../../utils/query';
import { ensureRoleCatalogEntry } from '../../utils/roleCatalog';
import { normalizeRoleName } from '../../utils/rbac';
import { conflict } from '../../utils/httpError';
import { isSafeImageValue } from '../../utils/fileValidation';

const profileImageSchema = z
  .string()
  .trim()
  .max(2_500_000)
  .refine((value) => isSafeImageValue(value), 'profileImageUrl must be a valid secure image URL or supported data URL');

const createUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .refine((value) => isStrongPassword(value), PASSWORD_POLICY_MESSAGE),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  profileImageUrl: profileImageSchema.optional().nullable(),
  userCode: z.string().min(1),
  department: z.string().optional().nullable(),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  roles: z.array(z.string().min(1)).min(1).default(['USER']),
});

const patchUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  profileImageUrl: profileImageSchema.optional().nullable(),
  department: z.string().nullable().optional(),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const patchRolesSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
  plantId: z.string().uuid().nullable().optional(),
});

const patchPasswordSchema = z.object({
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .refine((value) => isStrongPassword(value), PASSWORD_POLICY_MESSAGE),
});

export const usersRouter = Router();
usersRouter.use(requireAuth);

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

function normalizeRoleInput(role: string) {
  return normalizeRoleName(role.trim());
}

function isSystemGlobalRole(role: string) {
  const normalized = normalizeRoleInput(role);
  return normalized === 'ROOT_ADMIN' || normalized === 'SUPERADMIN';
}

async function resolveOrganizationIdForPlant(plantId: string | null): Promise<string | null> {
  if (!plantId) return null;
  const plant = await AppDataSource.getRepository(PlantEntity).findOneBy({ id: plantId, isActive: true });
  return plant?.organizationId ?? null;
}

async function ensureSystemOrgRoles(organizationId: string | null, roleKeys: string[]) {
  if (!organizationId) return;
  const requestedKeys = new Set(roleKeys.map((role) => normalizeRoleInput(role)));
  const requiredRoles = SYSTEM_ORG_ROLE_DEFINITIONS.filter((roleDef) => requestedKeys.has(roleDef.key));
  if (requiredRoles.length === 0) return;

  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  for (const roleDef of requiredRoles) {
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

async function resolveOrgRoleIdForOrganization(organizationId: string | null, roleKeys: string[]): Promise<string | null> {
  if (!organizationId) return null;
  const normalizedRoleKeys = roleKeys.map((role) => normalizeRoleInput(role));
  if (normalizedRoleKeys.includes('ROOT_ADMIN')) {
    return null;
  }
  await ensureSystemOrgRoles(organizationId, normalizedRoleKeys);
  const primaryRoleKey = getPrimaryRoleKey(normalizedRoleKeys);
  const orgRole = await AppDataSource.getRepository(OrgRoleEntity).findOneBy({
    organizationId,
    key: primaryRoleKey,
    isActive: true,
  });
  return orgRole?.id ?? null;
}

async function findActiveOrgRoles(organizationId: string | null, roleKeys: string[]) {
  if (!organizationId) return [];
  const normalizedRoleKeys = Array.from(new Set(roleKeys.map((role) => normalizeRoleInput(role)).filter((role) => role !== 'ROOT_ADMIN')));
  if (normalizedRoleKeys.length === 0) return [];
  await ensureSystemOrgRoles(organizationId, normalizedRoleKeys);
  return AppDataSource.getRepository(OrgRoleEntity).find({
    where: normalizedRoleKeys.map((key) => ({ organizationId, key, isActive: true })),
  });
}

async function ensureCatalogRoles(roleKeys: string[], descriptions?: Map<string, string>) {
  const roleRepo = AppDataSource.getRepository(RoleEntity);
  const roles = await Promise.all(
    Array.from(new Set(roleKeys.map((role) => normalizeRoleInput(role)))).map((roleKey) =>
      ensureRoleCatalogEntry(roleRepo, roleKey, {
        description: descriptions?.get(roleKey) ?? null,
        isSystem: SYSTEM_CATALOG_ROLE_KEYS.has(roleKey),
      }),
    ),
  );
  return new Map(roles.map((role) => [normalizeRoleInput(role.name), role]));
}

function getActor(req: Express.Request): PolicyActor {
  const auth = req.auth!;
  return {
    userId: auth.userId,
    roles: auth.roles.map((role) => normalizeRoleInput(role)),
    roleKey: getPrimaryRoleKey(auth.roles),
    plantIds: auth.plantIds,
    accessAllPlants: auth.accessAllPlants,
    plantId: auth.plantIds[0] ?? null,
  };
}

function toTargetUser(userId: string, roleKeys: string[], plantId: string | null): PolicyTargetUser {
  return {
    userId,
    roleKeys: roleKeys.map((role) => normalizeRoleInput(role)),
    plantId,
  };
}

usersRouter.get('/users', requirePermission('USERS', 'READ'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);

    const qb = profileRepo.createQueryBuilder('profile');
    applySearch(qb, 'profile', query.search, ['full_name', 'email', 'user_code', 'department']);
    applyPlantScope(qb, 'profile', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('profile.is_active = :active', { active: true });
    }
    qb.orderBy('profile.created_at', 'DESC');

    const profiles = await qb.getMany();
    const roleRows = profiles.length ? await roleRepo.find({ where: { userId: In(profiles.map((profile) => profile.userId)) } }) : [];
    const grouped = new Map<string, string[]>();
    roleRows.forEach((row) => {
      const curr = grouped.get(row.userId) ?? [];
      curr.push(row.role);
      grouped.set(row.userId, curr);
    });

    const visible = profiles
      .map((profile) => ({
        ...profile,
        roles: grouped.get(profile.userId) ?? [],
      }))
      .filter((profile) => canViewUser(actor, toTargetUser(profile.userId, profile.roles, profile.plantId)));
    const total = visible.length;
    const start = (query.page - 1) * query.limit;
    const data = visible.slice(start, start + query.limit);

    res.json(ok(data, 'Users fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/profiles', requirePermission('USERS', 'READ'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const qb = profileRepo.createQueryBuilder('profile');

    applySearch(qb, 'profile', query.search, ['full_name', 'email', 'user_code']);
    applyPlantScope(qb, 'profile', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('profile.is_active = :active', { active: true });
    }
    qb.orderBy('profile.created_at', 'DESC');

    const items = await qb.getMany();
    const roleRows = items.length ? await roleRepo.find({ where: { userId: In(items.map((profile) => profile.userId)) } }) : [];
    const grouped = new Map<string, string[]>();
    roleRows.forEach((row) => {
      const curr = grouped.get(row.userId) ?? [];
      curr.push(row.role);
      grouped.set(row.userId, curr);
    });

    const visible = items.filter((profile) => canViewUser(actor, toTargetUser(profile.userId, grouped.get(profile.userId) ?? [], profile.plantId)));
    const total = visible.length;
    const start = (query.page - 1) * query.limit;
    const data = visible.slice(start, start + query.limit);
    res.json(ok(data, 'Profiles fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/users/:id', requirePermission('USERS', 'READ'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    const profile = await profileRepo.findOneBy({ userId: user.id });
    const roles = await roleRepo.find({ where: { userId: user.id } });
    const target = toTargetUser(user.id, roles.map((row) => row.role), profile?.plantId ?? null);
    if (!canViewUser(actor, target)) {
      res.status(403).json(fail('No permission'));
      return;
    }

    if (profile) {
      ensurePlantAccess(req, profile.plantId);
    }
    res.json(ok({ user, profile, roles }, 'User fetched'));
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/users', requirePermission('USERS', 'CREATE'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const body = createUserSchema.parse(req.body);
    const requestedRoles = body.roles.map((role) => normalizeRoleInput(role));
    const disallowedRole = requestedRoles.find((role) => !canCreateUser(actor.roleKey, role));
    if (disallowedRole) {
      res.status(403).json(fail(`No permission to create role: ${disallowedRole}`));
      return;
    }

    const resolvedPlantId = body.plantId ?? null;
    enforcePlantScope(actor, resolvedPlantId);
    const requestedSystemRole = requestedRoles.find((role) => isSystemGlobalRole(role));
    const resolvedOrganizationId = requestedSystemRole === 'ROOT_ADMIN'
      ? null
      : (await resolveOrganizationIdForPlant(resolvedPlantId)) ?? req.auth!.organizationId ?? null;
    if (!requestedSystemRole && resolvedPlantId && !resolvedOrganizationId) {
      conflict('Organization could not be resolved for selected plant');
    }
    const orgRoles = await findActiveOrgRoles(resolvedOrganizationId, requestedRoles);
    const orgRolesByKey = new Map(orgRoles.map((role) => [normalizeRoleInput(role.key), role]));
    const invalidRole = requestedRoles.find((role) => role !== 'ROOT_ADMIN' && !orgRolesByKey.has(role));
    if (invalidRole) {
      res.status(400).json(fail(`Organization role ${invalidRole} is not configured`));
      return;
    }
    const roleDefsByKey = await ensureCatalogRoles(
      requestedRoles,
      new Map(orgRoles.map((role) => [normalizeRoleInput(role.key), `${role.name} role`])),
    );

    const created = await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const profileRepo = manager.getRepository(ProfileEntity);
      const roleRepo = manager.getRepository(UserRoleEntity);
      const orgRoleRepo = manager.getRepository(OrgRoleEntity);

      const existing = await userRepo.findOne({ where: { email: body.email.toLowerCase() } });
      if (existing) {
        conflict('Email already exists');
      }

      const existingProfileByCode = await profileRepo.findOne({ where: { userCode: body.userCode.trim() } });
      if (existingProfileByCode) {
        conflict('User code already exists');
      }

      const primaryRoleKey = getPrimaryRoleKey(requestedRoles);
      const resolvedOrgRole = resolvedOrganizationId
        ? await orgRoleRepo.findOneBy({ organizationId: resolvedOrganizationId, key: primaryRoleKey, isActive: true })
        : null;

      const user = userRepo.create({
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        fullName: body.fullName,
        phone: body.phone ?? null,
        isActive: body.isActive,
        organizationId: resolvedOrganizationId,
        orgRoleId: resolvedOrgRole?.id ?? null,
      });
      await userRepo.save(user);

      const profile = profileRepo.create({
        userId: user.id,
        userCode: body.userCode.trim(),
        fullName: body.fullName,
        email: user.email,
        phone: user.phone,
        profileImageUrl: body.profileImageUrl?.trim() || null,
        plantId: resolvedPlantId,
        department: body.department ?? null,
        isActive: body.isActive,
      });
      await profileRepo.save(profile);

      await roleRepo.save(
        requestedRoles.map((role) =>
          roleRepo.create({
            userId: user.id,
            roleId: roleDefsByKey.get(role)?.id ?? null,
            role,
            plantId: resolvedPlantId,
          }),
        ),
      );

      return { user, profile };
    });

    await audit('user.create', { actorUserId: req.auth!.userId, userId: created.user.id, roles: requestedRoles });
    res.status(201).json(ok(created, 'User created'));
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/profiles/:id', requirePermission('USERS', 'UPDATE'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        userCode: z.string().min(1).optional(),
        fullName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().nullable().optional(),
        profileImageUrl: profileImageSchema.optional().nullable(),
        department: z.string().nullable().optional(),
        plantId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const profile = await profileRepo.findOneBy({ id: params.id });
    if (!profile) {
      res.status(404).json(fail('Profile not found'));
      return;
    }
    ensurePlantAccess(req, body.plantId === undefined ? profile.plantId : body.plantId);

    const user = await userRepo.findOneBy({ id: profile.userId });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    if (isProtectedRootAdminEmail(user.email)) {
      res.status(403).json(fail('Protected root admin account cannot be modified'));
      return;
    }

    const targetRoles = await roleRepo.find({ where: { userId: user.id } });
    const target = toTargetUser(user.id, targetRoles.map((row) => row.role), profile.plantId);
    if (!canEditUser(actor, target)) {
      res.status(403).json(fail('No permission'));
      return;
    }

    if (body.userCode !== undefined) {
      const nextUserCode = body.userCode.trim();
      const existingProfile = await profileRepo.findOne({ where: { userCode: nextUserCode } });
      if (existingProfile && existingProfile.id !== profile.id) {
        res.status(409).json(fail('User code already exists'));
        return;
      }
      profile.userCode = nextUserCode;
    }
    if (body.fullName !== undefined) {
      profile.fullName = body.fullName;
      user.fullName = body.fullName;
    }
    if (body.email !== undefined) {
      const normalizedEmail = body.email.toLowerCase();
      const existingUser = await userRepo.findOne({ where: { email: normalizedEmail } });
      if (existingUser && existingUser.id !== user.id) {
        res.status(409).json(fail('Email already exists'));
        return;
      }
      profile.email = normalizedEmail;
      user.email = normalizedEmail;
    }
    if (body.phone !== undefined) {
      profile.phone = body.phone ?? null;
      user.phone = body.phone ?? null;
    }
    if (body.profileImageUrl !== undefined) {
      profile.profileImageUrl = body.profileImageUrl?.trim() || null;
    }
    if (body.department !== undefined) profile.department = body.department ?? null;
    if (body.plantId !== undefined) {
      profile.plantId = body.plantId ?? null;
      const targetRoleKeys = targetRoles.map((row) => normalizeRoleInput(row.role));
      const hasRootRole = targetRoleKeys.includes('ROOT_ADMIN');
      user.organizationId = hasRootRole ? null : await resolveOrganizationIdForPlant(profile.plantId);
      user.orgRoleId = hasRootRole ? null : await resolveOrgRoleIdForOrganization(user.organizationId, targetRoleKeys);
    }
    if (body.isActive !== undefined) {
      profile.isActive = body.isActive;
      user.isActive = body.isActive;
    }

    await userRepo.save(user);
    await profileRepo.save(profile);
    res.json(ok(profile, 'Profile updated'));
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  '/users/:id',
  requirePermission('USERS', 'UPDATE'),
  forbidFieldsByRole({
    ADMIN: ['email', 'plantId', 'isActive'],
  }),
  async (req, res, next) => {
    try {
      const actor = getActor(req);
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = patchUserSchema.parse(req.body);

      const userRepo = AppDataSource.getRepository(UserEntity);
      const profileRepo = AppDataSource.getRepository(ProfileEntity);
      const roleRepo = AppDataSource.getRepository(UserRoleEntity);

      const user = await userRepo.findOneBy({ id: params.id });
      if (!user) {
        res.status(404).json(fail('User not found'));
        return;
      }
      if (isProtectedRootAdminEmail(user.email)) {
        res.status(403).json(fail('Protected root admin account cannot be modified'));
        return;
      }

      const profile = await profileRepo.findOneBy({ userId: user.id });
      if (!profile) {
        res.status(404).json(fail('Profile not found'));
        return;
      }

      const targetRoles = await roleRepo.find({ where: { userId: user.id } });
      const target = toTargetUser(user.id, targetRoles.map((row) => row.role), profile.plantId);
      if (!canEditUser(actor, target)) {
        res.status(403).json(fail('No permission'));
        return;
      }

      const nextPlantId = body.plantId === undefined ? profile.plantId : body.plantId;
      enforcePlantScope(actor, nextPlantId ?? null);

      if (body.email !== undefined) {
        const normalizedEmail = body.email.toLowerCase();
        const existingUser = await userRepo.findOne({ where: { email: normalizedEmail } });
        if (existingUser && existingUser.id !== user.id) {
          res.status(409).json(fail('Email already exists'));
          return;
        }
        user.email = normalizedEmail;
        profile.email = user.email;
      }
      if (body.fullName !== undefined) {
        user.fullName = body.fullName;
        profile.fullName = body.fullName;
      }
      if (body.phone !== undefined) {
        user.phone = body.phone ?? null;
        profile.phone = body.phone ?? null;
      }
      if (body.profileImageUrl !== undefined) {
        profile.profileImageUrl = body.profileImageUrl?.trim() || null;
      }
      if (body.department !== undefined) {
        profile.department = body.department ?? null;
      }
      if (body.plantId !== undefined) {
        profile.plantId = body.plantId ?? null;
        const targetRoleKeys = targetRoles.map((row) => normalizeRoleInput(row.role));
        const hasRootRole = targetRoleKeys.includes('ROOT_ADMIN');
        user.organizationId = hasRootRole ? null : await resolveOrganizationIdForPlant(profile.plantId);
        user.orgRoleId = hasRootRole ? null : await resolveOrgRoleIdForOrganization(user.organizationId, targetRoleKeys);
      }
      if (body.isActive !== undefined) {
        user.isActive = body.isActive;
        profile.isActive = body.isActive;
      }

      await userRepo.save(user);
      await profileRepo.save(profile);

      await audit('user.update', { actorUserId: req.auth!.userId, userId: user.id });
      res.json(ok({ user, profile }, 'User updated'));
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.patch('/users/:id/roles', requirePermission('USERS', 'UPDATE'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = patchRolesSchema.parse(req.body);

    const normalizedRequestedRoles = body.roles.map((role) => normalizeRoleInput(role));
    const disallowedRole = normalizedRequestedRoles.find((role) => !canAssignRole(actor.roleKey, role));
    if (disallowedRole) {
      res.status(403).json(fail(`No permission to assign role: ${disallowedRole}`));
      return;
    }

    enforcePlantScope(actor, body.plantId ?? null);

    const userRepo = AppDataSource.getRepository(UserEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    if (isProtectedRootAdminEmail(user.email)) {
      res.status(403).json(fail('Protected root admin account roles cannot be changed'));
      return;
    }

    const existingRoles = await roleRepo.find({ where: { userId: user.id } });

    const target = toTargetUser(user.id, existingRoles.map((row) => row.role), body.plantId ?? existingRoles[0]?.plantId ?? null);
    if (!canEditUser(actor, target)) {
      res.status(403).json(fail('No permission'));
      return;
    }

    const resolvedPlantId = body.plantId ?? null;
    const resolvedOrganizationId = normalizedRequestedRoles.includes('ROOT_ADMIN')
      ? null
      : (await resolveOrganizationIdForPlant(resolvedPlantId)) ?? user.organizationId ?? null;
    if (!normalizedRequestedRoles.includes('ROOT_ADMIN') && resolvedPlantId && !resolvedOrganizationId) {
      conflict('Organization could not be resolved for selected plant');
    }
    const orgRoles = await findActiveOrgRoles(resolvedOrganizationId, normalizedRequestedRoles);
    const orgRolesByKey = new Map(orgRoles.map((role) => [normalizeRoleInput(role.key), role]));
    const invalidRole = normalizedRequestedRoles.find((role) => role !== 'ROOT_ADMIN' && !orgRolesByKey.has(role));
    if (invalidRole) {
      res.status(400).json(fail(`Organization role ${invalidRole} is not configured`));
      return;
    }
    const roleDefsByKey = await ensureCatalogRoles(
      normalizedRequestedRoles,
      new Map(orgRoles.map((role) => [normalizeRoleInput(role.key), `${role.name} role`])),
    );

    await roleRepo.delete({ userId: user.id });
    const rows = normalizedRequestedRoles.map((role) =>
      roleRepo.create({
        userId: user.id,
        roleId: roleDefsByKey.get(role)?.id ?? null,
        role,
        plantId: resolvedPlantId,
      }),
    );
    await roleRepo.save(rows);
    const hasRootRole = normalizedRequestedRoles.includes('ROOT_ADMIN');
    user.organizationId = hasRootRole ? null : resolvedOrganizationId;
    user.orgRoleId = hasRootRole ? null : await resolveOrgRoleIdForOrganization(user.organizationId, normalizedRequestedRoles);
    await userRepo.save(user);

    await audit('user.roles.update', { actorUserId: req.auth!.userId, userId: user.id, roles: body.roles });
    res.json(ok({ userId: user.id, roles: rows.map((row) => row.role) }, 'Roles updated'));
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/users/:id/password', requirePermission('USERS', 'UPDATE'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = patchPasswordSchema.parse(req.body);

    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    if (isProtectedRootAdminEmail(user.email)) {
      res.status(403).json(fail('Protected root admin password cannot be changed'));
      return;
    }

    const profile = await profileRepo.findOneBy({ userId: user.id });
    const targetRoles = await roleRepo.find({ where: { userId: user.id } });
    const target = toTargetUser(user.id, targetRoles.map((row) => row.role), profile?.plantId ?? null);
    if (!canEditUser(actor, target)) {
      res.status(403).json(fail('No permission'));
      return;
    }

    if (profile) {
      ensurePlantAccess(req, profile.plantId);
    }

    user.passwordHash = await hashPassword(body.password);
    await userRepo.save(user);

    await audit('user.password.update', { actorUserId: req.auth!.userId, userId: user.id });
    res.json(ok({ userId: user.id }, 'User password updated'));
  } catch (error) {
    next(error);
  }
});

usersRouter.delete('/users/:id', requirePermission('USERS', 'DELETE'), async (req, res, next) => {
  try {
    const actor = getActor(req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);

    const user = await userRepo.findOneBy({ id: params.id });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    if (isProtectedRootAdminEmail(user.email)) {
      res.status(403).json(fail('Protected root admin account cannot be deleted'));
      return;
    }

    const profile = await profileRepo.findOneBy({ userId: user.id });
    const targetRoles = await roleRepo.find({ where: { userId: user.id } });
    const target = toTargetUser(user.id, targetRoles.map((row) => row.role), profile?.plantId ?? null);
    if (!canEditUser(actor, target)) {
      res.status(403).json(fail('No permission'));
      return;
    }

    if (profile) {
      ensurePlantAccess(req, profile.plantId);
    }

    if (req.auth?.scopeType === 'ROOT_ADMIN') {
      await AppDataSource.transaction(async (manager) => {
        await manager.delete(RefreshTokenEntity, { userId: user.id });
        await manager.delete(UserRoleEntity, { userId: user.id });
        await manager.delete(ProfileEntity, { userId: user.id });
        await manager.delete(UserEntity, { id: user.id });
      });

      await audit('user.delete', { actorUserId: req.auth!.userId, userId: user.id });
      res.json(ok({ userId: user.id, deleted: true }, 'User deleted permanently'));
      return;
    }

    if (profile) {
      profile.isActive = false;
      await profileRepo.save(profile);
    }

    user.isActive = false;
    await userRepo.save(user);

    await audit('user.delete', { actorUserId: req.auth!.userId, userId: user.id });
    res.json(ok({ userId: user.id }, 'User deactivated'));
  } catch (error) {
    next(error);
  }
});
