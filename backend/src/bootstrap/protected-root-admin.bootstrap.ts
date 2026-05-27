import { EntityManager } from 'typeorm';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { PROTECTED_ROOT_ADMIN } from '../config/protectedRootAdmin';
import { hashPassword } from '../utils/password';
import { AppDataSource } from '../database/data-source';
import { OrganizationEntity, PlantEntity, ProfileEntity, RoleEntity, UserEntity, UserRoleEntity } from '../database/entities';

const PROTECTED_EMAIL = PROTECTED_ROOT_ADMIN.email.trim().toLowerCase();
const PROTECTED_ORG_NAME = PROTECTED_ROOT_ADMIN.organizationName.trim();
const PROTECTED_ORG_CODE = PROTECTED_ROOT_ADMIN.organizationCode.trim().toUpperCase();
const PROTECTED_ROLE = PROTECTED_ROOT_ADMIN.roleKey;
const LEGACY_DEFAULT_ORG_NAME = 'default organization';
const LEGACY_DEFAULT_ORG_CODE = 'default';

async function findOrganizationByName(manager: EntityManager) {
  return manager
    .getRepository(OrganizationEntity)
    .createQueryBuilder('org')
    .where('LOWER(org.name) = :name', { name: PROTECTED_ORG_NAME.toLowerCase() })
    .orderBy('org.created_at', 'ASC')
    .getOne();
}

async function findOrganizationByCode(manager: EntityManager) {
  return manager
    .getRepository(OrganizationEntity)
    .createQueryBuilder('org')
    .where("LOWER(COALESCE(org.code, '')) = :code", { code: PROTECTED_ORG_CODE.toLowerCase() })
    .orderBy('org.created_at', 'ASC')
    .getOne();
}

async function findLegacyDefaultOrganization(manager: EntityManager) {
  return manager
    .getRepository(OrganizationEntity)
    .createQueryBuilder('org')
    .where('LOWER(org.name) = :legacyName', { legacyName: LEGACY_DEFAULT_ORG_NAME })
    .orWhere("LOWER(COALESCE(org.code, '')) = :legacyCode", { legacyCode: LEGACY_DEFAULT_ORG_CODE })
    .orderBy('org.created_at', 'ASC')
    .getOne();
}

async function ensureProtectedOrganization(manager: EntityManager) {
  const organizationRepo = manager.getRepository(OrganizationEntity);

  const orgByName = await findOrganizationByName(manager);
  const orgByCode = await findOrganizationByCode(manager);
  const legacyDefaultOrg = await findLegacyDefaultOrganization(manager);
  const organization = orgByName ?? orgByCode ?? legacyDefaultOrg ?? organizationRepo.create();

  organization.name = PROTECTED_ORG_NAME;
  organization.logoUrl = PROTECTED_ROOT_ADMIN.organizationLogoUrl;
  organization.faviconUrl = PROTECTED_ROOT_ADMIN.organizationFaviconUrl;
  organization.contactEmail = PROTECTED_EMAIL;
  organization.isActive = true;
  if (!organization.legalName) {
    organization.legalName = PROTECTED_ORG_NAME;
  }

  const currentCode = organization.code?.trim().toUpperCase() ?? '';
  const canUseProtectedCode = !orgByCode || orgByCode.id === organization.id;
  if (currentCode !== PROTECTED_ORG_CODE && canUseProtectedCode) {
    organization.code = PROTECTED_ORG_CODE;
  }

  return organizationRepo.save(organization);
}

async function purgeLegacyDefaultOrganizations(manager: EntityManager, protectedOrganizationId: string) {
  const organizationRepo = manager.getRepository(OrganizationEntity);
  const plantRepo = manager.getRepository(PlantEntity);
  const userRepo = manager.getRepository(UserEntity);

  const legacyRows = await organizationRepo
    .createQueryBuilder('org')
    .where('org.id <> :protectedOrganizationId', { protectedOrganizationId })
    .andWhere(
      "(LOWER(org.name) = :legacyName OR LOWER(COALESCE(org.code, '')) = :legacyCode)",
      {
        legacyName: LEGACY_DEFAULT_ORG_NAME,
        legacyCode: LEGACY_DEFAULT_ORG_CODE,
      },
    )
    .getMany();

  if (legacyRows.length === 0) {
    return;
  }

  for (const legacyOrg of legacyRows) {
    // Keep safety-first behavior: remove only orphaned legacy defaults with no active links.
    // eslint-disable-next-line no-await-in-loop
    const [plantCount, userCount] = await Promise.all([
      plantRepo.count({ where: { organizationId: legacyOrg.id } }),
      userRepo.count({ where: { organizationId: legacyOrg.id } }),
    ]);

    if (plantCount > 0 || userCount > 0) {
      logger.warn(
        {
          legacyOrganizationId: legacyOrg.id,
          plantCount,
          userCount,
        },
        'Legacy Default Organization detected with linked records; keeping it to avoid data loss',
      );
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await organizationRepo.delete({ id: legacyOrg.id });
    logger.info({ legacyOrganizationId: legacyOrg.id }, 'Removed legacy Default Organization seed record');
  }
}

async function ensureProtectedRootRole(manager: EntityManager) {
  const roleRepo = manager.getRepository(RoleEntity);
  const existing = await roleRepo.findOneBy({ name: PROTECTED_ROLE });
  if (existing) {
    let dirty = false;
    if (!existing.isSystem) {
      existing.isSystem = true;
      dirty = true;
    }
    if (!existing.isActive) {
      existing.isActive = true;
      dirty = true;
    }
    const expectedDescription = 'Protected root administrator';
    if (existing.description !== expectedDescription) {
      existing.description = expectedDescription;
      dirty = true;
    }
    if (dirty) {
      return roleRepo.save(existing);
    }
    return existing;
  }

  return roleRepo.save(
    roleRepo.create({
      name: PROTECTED_ROLE,
      description: 'Protected root administrator',
      isSystem: true,
      isActive: true,
    }),
  );
}

async function generateProtectedUserCode(manager: EntityManager, userId: string) {
  const profileRepo = manager.getRepository(ProfileEntity);
  const preferred = 'RTA-TAMOPTIX';
  const preferredHit = await profileRepo.findOne({ where: { userCode: preferred }, select: ['id', 'userId'] });
  if (!preferredHit || preferredHit.userId === userId) {
    return preferred;
  }

  const fallback = `RTA-${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const fallbackHit = await profileRepo.findOne({ where: { userCode: fallback }, select: ['id', 'userId'] });
  if (!fallbackHit || fallbackHit.userId === userId) {
    return fallback;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `RTA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await profileRepo.findOne({ where: { userCode: candidate }, select: ['id'] });
    if (!existing) {
      return candidate;
    }
  }

  return `RTA-${Date.now().toString().slice(-6)}`;
}

async function ensureProtectedRootUser(manager: EntityManager, organizationId: string, roleId: string) {
  const userRepo = manager.getRepository(UserEntity);
  const profileRepo = manager.getRepository(ProfileEntity);
  const userRoleRepo = manager.getRepository(UserRoleEntity);

  let user = await userRepo
    .createQueryBuilder('usr')
    .where('LOWER(usr.email) = :email', { email: PROTECTED_EMAIL })
    .orderBy('usr.created_at', 'ASC')
    .getOne();

  if (!user) {
    const rootAdminPassword = env.ROOT_ADMIN_PASSWORD;
    if (!rootAdminPassword) {
      logger.error('ROOT_ADMIN_PASSWORD environment variable is not set. Protected root admin user cannot be created. Set ROOT_ADMIN_PASSWORD in the environment and restart.');
      return null;
    }
    const passwordHash = await hashPassword(rootAdminPassword);
    user = userRepo.create({
      email: PROTECTED_EMAIL,
      passwordHash,
      fullName: PROTECTED_ROOT_ADMIN.fullName,
      phone: null,
      isActive: true,
      organizationId,
      orgRoleId: null,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  } else {
    user.email = PROTECTED_EMAIL;
    user.fullName = PROTECTED_ROOT_ADMIN.fullName;
    user.isActive = true;
    user.organizationId = organizationId;
    user.orgRoleId = null;
    const rootAdminPassword = env.ROOT_ADMIN_PASSWORD;
    if (rootAdminPassword) {
      user.passwordHash = await hashPassword(rootAdminPassword);
    }
  }
  user = await userRepo.save(user);

  let profile = await profileRepo.findOneBy({ userId: user.id });
  if (!profile) {
    profile = profileRepo.create({
      userId: user.id,
      userCode: await generateProtectedUserCode(manager, user.id),
      fullName: PROTECTED_ROOT_ADMIN.fullName,
      email: PROTECTED_EMAIL,
      phone: null,
      profileImageUrl: PROTECTED_ROOT_ADMIN.profileImageUrl,
      plantId: null,
      departmentId: null,
      isActive: true,
    });
  } else {
    profile.fullName = PROTECTED_ROOT_ADMIN.fullName;
    profile.email = PROTECTED_EMAIL;
    profile.phone = null;
    profile.profileImageUrl = PROTECTED_ROOT_ADMIN.profileImageUrl;
    profile.plantId = null;
    profile.isActive = true;
    if (!profile.userCode?.trim()) {
      profile.userCode = await generateProtectedUserCode(manager, user.id);
    }
  }
  await profileRepo.save(profile);

  const existingRoles = await userRoleRepo.find({ where: { userId: user.id } });
  const needsRoleReset =
    existingRoles.length !== 1 ||
    existingRoles[0].role !== PROTECTED_ROLE ||
    existingRoles[0].roleId !== roleId ||
    existingRoles[0].plantId !== null;

  if (needsRoleReset) {
    await userRoleRepo.delete({ userId: user.id });
    await userRoleRepo.save(
      userRoleRepo.create({
        userId: user.id,
        roleId,
        role: PROTECTED_ROLE,
        plantId: null,
      }),
    );
  }

  return user;
}

export async function ensureProtectedRootAdminBootstrap() {
  const result = await AppDataSource.transaction(async (manager) => {
    const organization = await ensureProtectedOrganization(manager);
    await purgeLegacyDefaultOrganizations(manager, organization.id);
    const role = await ensureProtectedRootRole(manager);
    const user = await ensureProtectedRootUser(manager, organization.id, role.id);

    if (!user) {
      return null;
    }

    return {
      organizationId: organization.id,
      userId: user.id,
    };
  });

  if (!result) {
    logger.error('Protected root admin bootstrap failed: ROOT_ADMIN_PASSWORD not set');
    return;
  }

  logger.info(
    {
      protectedRootAdminEmail: PROTECTED_EMAIL,
      protectedOrganizationName: PROTECTED_ORG_NAME,
      organizationId: result.organizationId,
      userId: result.userId,
    },
    'Protected root admin bootstrap ensured',
  );
}
