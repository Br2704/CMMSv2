import { AppDataSource } from '../database/data-source';
import { OrgRoleEntity, PlantEntity, ProfileEntity, UserEntity } from '../database/entities';
import { normalizeRoleName } from './rbac';

type MinimalUser = Pick<UserEntity, 'id' | 'organizationId' | 'orgRoleId'>;
type MinimalProfile = Pick<ProfileEntity, 'plantId'>;

export interface ResolvedUserOrganizationScope {
  organizationId: string | null;
  orgRoleId: string | null;
  orgRoleKey: string | null;
  source: 'org_role' | 'user' | 'profile_plant' | 'auth_plant' | 'none';
}

export async function resolveUserOrganizationScope(input: {
  userId?: string;
  user?: MinimalUser | null;
  profile?: MinimalProfile | null;
  authPlantIds?: string[];
}): Promise<ResolvedUserOrganizationScope> {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);

  const user =
    input.user ??
    (input.userId
      ? await userRepo.findOne({
          where: { id: input.userId },
          select: ['id', 'organizationId', 'orgRoleId'],
        })
      : null);

  if (!user) {
    return {
      organizationId: null,
      orgRoleId: null,
      orgRoleKey: null,
      source: 'none',
    };
  }

  if (user.orgRoleId) {
    const orgRole = await orgRoleRepo.findOne({
      where: { id: user.orgRoleId, isActive: true },
      select: ['id', 'organizationId', 'key'],
    });
    if (orgRole?.organizationId) {
      return {
        organizationId: orgRole.organizationId,
        orgRoleId: orgRole.id,
        orgRoleKey: normalizeRoleName(orgRole.key),
        source: 'org_role',
      };
    }
  }

  if (user.organizationId) {
    return {
      organizationId: user.organizationId,
      orgRoleId: user.orgRoleId ?? null,
      orgRoleKey: null,
      source: 'user',
    };
  }

  const profile =
    input.profile ??
    (user.id
      ? await profileRepo.findOne({
          where: { userId: user.id },
          select: ['plantId'],
        })
      : null);

  if (profile?.plantId) {
    const plant = await plantRepo.findOne({
      where: { id: profile.plantId },
      select: ['organizationId'],
    });
    if (plant?.organizationId) {
      return {
        organizationId: plant.organizationId,
        orgRoleId: user.orgRoleId ?? null,
        orgRoleKey: null,
        source: 'profile_plant',
      };
    }
  }

  const fallbackPlantId = input.authPlantIds?.[0] ?? null;
  if (fallbackPlantId) {
    const plant = await plantRepo.findOne({
      where: { id: fallbackPlantId },
      select: ['organizationId'],
    });
    if (plant?.organizationId) {
      return {
        organizationId: plant.organizationId,
        orgRoleId: user.orgRoleId ?? null,
        orgRoleKey: null,
        source: 'auth_plant',
      };
    }
  }

  return {
    organizationId: null,
    orgRoleId: user.orgRoleId ?? null,
    orgRoleKey: null,
    source: 'none',
  };
}
