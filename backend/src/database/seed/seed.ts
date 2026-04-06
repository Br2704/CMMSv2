import { env } from '../../config/env';
import type { Repository } from 'typeorm';
import { normalizeRoleName, RBAC_ACTIONS, RBAC_MODULE_KEYS, DASHBOARD_KPI_KEYS } from '../../utils/rbac';
import { hashPassword } from '../../utils/password';
import { AppDataSource } from '../data-source';
import { OrgRoleEntity, ProfileEntity, RoleDashboardKpiEntity, RoleEntity, RolePermissionEntity, UserEntity, UserRoleEntity } from '../entities';
import { seedJkFennerDemoData } from './seedJkFennerDemo';

type RoleSeed = { name: string; isSystem: boolean; description: string };
type PermissionSeed = { role: string; moduleKey: string; actions: string[] };
type KpiSeed = { role: string; kpiKey: string; isVisible: boolean; displayOrder: number };

const FULL_ACTIONS = [...RBAC_ACTIONS];
const READ_ONLY_ACTIONS = ['READ'];

const ROOT_GOVERNANCE_MODULES = ['DASHBOARD', 'MASTERS', 'ORGANIZATIONS', 'PLANTS', 'USERS', 'ROLE_ACCESS', 'MODULES'];
const ADMIN_BLOCKED_MODULES = new Set(['PLANTS', 'ROLE_ACCESS', 'BENCHMARKING']);
const ROOT_ADMIN_PROFILE_IMAGE_PATH = '/profile-images/root-admin-tamoptix.png';

const DEFAULT_ROLES: RoleSeed[] = [
  { name: 'SUPERADMIN', isSystem: true, description: 'Global platform administrator' },
  { name: 'ROOT_ADMIN', isSystem: true, description: 'Global root administrator with governance access' },
  { name: 'ADMIN', isSystem: true, description: 'Organization administrator' },
  { name: 'PLANT_ADMIN', isSystem: true, description: 'Plant-scoped administrator' },
  { name: 'MAINTENANCE_MANAGER', isSystem: true, description: 'Maintenance manager' },
  { name: 'ENGINEER', isSystem: true, description: 'Maintenance engineer' },
  { name: 'TECHNICIAN', isSystem: true, description: 'Maintenance technician' },
  { name: 'SECURITY_USER', isSystem: true, description: 'Security gate operator' },
  { name: 'STORE_USER', isSystem: true, description: 'Inventory and stores operator' },
  { name: 'VIEWER', isSystem: true, description: 'Read-only user' },
  { name: 'VENDOR', isSystem: true, description: 'External vendor user' },
  { name: 'VISITOR', isSystem: true, description: 'Visitor portal user' },
  { name: 'TEMPORARY_VISITOR', isSystem: true, description: 'Temporary visitor role for smart gate sessions' },
  { name: 'USER', isSystem: true, description: 'Standard plant user' },
];

function roleNameKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveRoleMapKey(roleMap: Map<string, RoleEntity>, role: string): string | null {
  const exact = roleNameKey(role);
  if (roleMap.has(exact)) return exact;
  const normalized = roleNameKey(normalizeRoleName(role));
  if (roleMap.has(normalized)) return normalized;
  return null;
}

function fromModules(modules: string[], actions: string[]) {
  return Object.fromEntries(modules.map((moduleKey) => [moduleKey, [...actions]])) as Record<string, string[]>;
}

function buildFrontendAssetUrl(pathname: string) {
  const baseUrl = env.FRONTEND_URL.trim().replace(/\/+$/g, '');
  return `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function userVisibleKpi(kpiKey: string) {
  return ['TOTAL_ASSETS', 'OPEN_WORK_ORDERS', 'CLOSED_WORK_ORDERS', 'LAST24H_WORK_ORDERS'].includes(kpiKey);
}

function buildPermissionMapByRole() {
  const superAdminPermissions = fromModules([...RBAC_MODULE_KEYS], FULL_ACTIONS);
  const rootAdminPermissions = fromModules(ROOT_GOVERNANCE_MODULES, FULL_ACTIONS);
  const adminPermissions = fromModules(
    RBAC_MODULE_KEYS.filter((moduleKey) => !ADMIN_BLOCKED_MODULES.has(moduleKey)),
    FULL_ACTIONS,
  );

  const maintenanceManagerPermissions: Record<string, string[]> = {
    ...fromModules(
      ['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'AMC', 'LOGS', 'INVENTORY', 'REPORTS', 'NOTIFICATIONS'],
      READ_ONLY_ACTIONS,
    ),
    ASSETS: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    WORK_ORDERS: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'],
    PM: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    CALIBRATION: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    AMC: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    LOGS: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    INVENTORY: ['READ', 'CREATE', 'UPDATE'],
    REPORTS: ['READ', 'CREATE', 'EXPORT'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
  };

  const engineerPermissions: Record<string, string[]> = {
    ...fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'LOGS', 'NOTIFICATIONS', 'REPORTS'], READ_ONLY_ACTIONS),
    WORK_ORDERS: ['READ', 'CREATE', 'UPDATE'],
    LOGS: ['READ', 'CREATE', 'UPDATE'],
    PM: ['READ', 'UPDATE'],
    CALIBRATION: ['READ', 'UPDATE'],
  };

  const technicianPermissions: Record<string, string[]> = {
    ...fromModules(['DASHBOARD', 'WORK_ORDERS', 'PM', 'LOGS', 'NOTIFICATIONS'], READ_ONLY_ACTIONS),
    WORK_ORDERS: ['READ', 'CREATE', 'UPDATE'],
    LOGS: ['READ', 'CREATE', 'UPDATE'],
  };

  const securityUserPermissions: Record<string, string[]> = {
    ...fromModules(['DASHBOARD', 'GATES', 'NOTIFICATIONS', 'REPORTS'], READ_ONLY_ACTIONS),
    GATES: ['READ', 'CREATE', 'UPDATE', 'EXPORT'],
  };

  const storeUserPermissions: Record<string, string[]> = {
    ...fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'INVENTORY', 'NOTIFICATIONS'], READ_ONLY_ACTIONS),
    INVENTORY: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'],
  };

  const viewerPermissions = fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'REPORTS', 'NOTIFICATIONS'], READ_ONLY_ACTIONS);
  const vendorPermissions = fromModules(['AMC', 'NOTIFICATIONS'], READ_ONLY_ACTIONS);
  const visitorPermissions = fromModules(['DASHBOARD', 'GATES', 'NOTIFICATIONS'], READ_ONLY_ACTIONS);
  const userPermissions: Record<string, string[]> = {
    DASHBOARD: ['READ'],
    ASSETS: ['READ'],
    WORK_ORDERS: ['READ', 'CREATE'],
    PM: ['READ'],
    NOTIFICATIONS: ['READ'],
  };

  return {
    SUPERADMIN: superAdminPermissions,
    ROOT_ADMIN: rootAdminPermissions,
    ADMIN: adminPermissions,
    PLANT_ADMIN: adminPermissions,
    MAINTENANCE_MANAGER: maintenanceManagerPermissions,
    ENGINEER: engineerPermissions,
    TECHNICIAN: technicianPermissions,
    SECURITY_USER: securityUserPermissions,
    STORE_USER: storeUserPermissions,
    VIEWER: viewerPermissions,
    VENDOR: vendorPermissions,
    VISITOR: visitorPermissions,
    TEMPORARY_VISITOR: visitorPermissions,
    USER: userPermissions,
  } as const;
}

function buildPermissionSeeds(): PermissionSeed[] {
  const permissionMapByRole = buildPermissionMapByRole();
  return Object.entries(permissionMapByRole).flatMap(([role, modules]) =>
    Object.entries(modules).map(([moduleKey, actions]) => ({
      role,
      moduleKey,
      actions: Array.from(new Set(actions.map((action) => action.trim().toUpperCase()))),
    })),
  );
}

function buildKpiSeeds(): KpiSeed[] {
  const roleNames = DEFAULT_ROLES.map((role) => role.name);
  return roleNames.flatMap((role) =>
    DASHBOARD_KPI_KEYS.map((kpiKey, index) => ({
      role,
      kpiKey,
      isVisible:
        role === 'SUPERADMIN' ||
        role === 'ROOT_ADMIN' ||
        role === 'ADMIN' ||
        role === 'PLANT_ADMIN' ||
        role === 'MAINTENANCE_MANAGER'
          ? true
          : userVisibleKpi(kpiKey),
      displayOrder: index,
    })),
  );
}

function actionsEqual(left: string[], right: string[]) {
  const a = [...new Set(left.map((item) => item.trim().toUpperCase()))].sort();
  const b = [...new Set(right.map((item) => item.trim().toUpperCase()))].sort();
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function permissionRowKey(roleId: string | null | undefined, role: string | null | undefined, moduleKey: string) {
  const module = moduleKey.toUpperCase();
  if (roleId) {
    return `id:${roleId}:${module}`;
  }
  return `role:${roleNameKey(role ?? '')}:${module}`;
}

async function ensureRoles(roleRepo: Repository<RoleEntity>) {
  const existingRoles = await roleRepo.find();
  const roleMap = new Map(existingRoles.map((role) => [roleNameKey(role.name), role]));

  for (const roleSeed of DEFAULT_ROLES) {
    const key = roleNameKey(roleSeed.name);
    const existing = roleMap.get(key);
    if (!existing) {
      const created = await roleRepo.save(
        roleRepo.create({
          name: roleSeed.name,
          description: roleSeed.description,
          isSystem: roleSeed.isSystem,
          isActive: true,
        }),
      );
      roleMap.set(key, created);
      continue;
    }

    let changed = false;
    if (existing.name !== roleSeed.name) {
      existing.name = roleSeed.name;
      changed = true;
    }
    if (existing.description !== roleSeed.description) {
      existing.description = roleSeed.description;
      changed = true;
    }
    if (existing.isSystem !== roleSeed.isSystem) {
      existing.isSystem = roleSeed.isSystem;
      changed = true;
    }
    if (!existing.isActive) {
      existing.isActive = true;
      changed = true;
    }

    if (changed) {
      const updated = await roleRepo.save(existing);
      roleMap.set(key, updated);
    }
  }

  return roleMap;
}

async function ensureRolePermissions(
  rolePermissionRepo: Repository<RolePermissionEntity>,
  roleMap: Map<string, RoleEntity>,
) {
  const seeds = buildPermissionSeeds();
  const whereConditions = seeds.flatMap((seed) => {
    const roleId = roleMap.get(roleNameKey(seed.role))?.id ?? null;
    const conditions: Array<{ role?: string; roleId?: string; moduleKey: string }> = [{ role: seed.role, moduleKey: seed.moduleKey }];
    if (roleId) {
      conditions.push({ roleId, moduleKey: seed.moduleKey });
    }
    return conditions;
  });

  const existingRows = whereConditions.length > 0 ? await rolePermissionRepo.find({ where: whereConditions }) : [];

  const existingMap = new Map<string, RolePermissionEntity>();
  for (const row of existingRows) {
    const key = permissionRowKey(row.roleId, row.role, row.moduleKey ?? row.moduleId);
    if (!existingMap.has(key)) {
      existingMap.set(key, row);
    }
  }

  const createRows: RolePermissionEntity[] = [];
  const updateRows: RolePermissionEntity[] = [];

  for (const seed of seeds) {
    const roleKey = roleNameKey(seed.role);
    const moduleKey = seed.moduleKey.toUpperCase();
    const roleEntity = roleMap.get(roleKey) ?? null;
    const key = permissionRowKey(roleEntity?.id ?? null, seed.role, moduleKey);
    const existing = existingMap.get(key);

    if (!existing) {
      createRows.push(
        rolePermissionRepo.create({
          roleId: roleEntity?.id ?? null,
          role: seed.role,
          moduleKey,
          moduleId: moduleKey,
          actions: seed.actions,
        }),
      );
      continue;
    }

    const normalizedExistingRole = roleNameKey(existing.role ?? roleEntity?.name ?? '');
    const nextRole = roleEntity?.name ?? seed.role;
    const needsUpdate =
      normalizedExistingRole !== roleKey ||
      existing.moduleKey !== moduleKey ||
      existing.moduleId !== moduleKey ||
      !actionsEqual(existing.actions ?? [], seed.actions) ||
      existing.roleId !== (roleEntity?.id ?? null);

    if (needsUpdate) {
      existing.roleId = roleEntity?.id ?? null;
      existing.role = nextRole;
      existing.moduleKey = moduleKey;
      existing.moduleId = moduleKey;
      existing.actions = seed.actions;
      updateRows.push(existing);
    }
  }

  if (createRows.length > 0) {
    await rolePermissionRepo.save(createRows);
  }
  if (updateRows.length > 0) {
    await rolePermissionRepo.save(updateRows);
  }
}

async function ensureRoleKpis(
  roleDashboardKpiRepo: Repository<RoleDashboardKpiEntity>,
  roleMap: Map<string, RoleEntity>,
) {
  const seeds = buildKpiSeeds();
  const roleIds = Array.from(new Set(seeds.map((seed) => roleMap.get(roleNameKey(seed.role))?.id).filter((value): value is string => Boolean(value))));
  const existingRows = roleIds.length > 0 ? await roleDashboardKpiRepo.find({ where: roleIds.map((roleId) => ({ roleId })) }) : [];
  const existingMap = new Map(existingRows.map((row) => [`${row.roleId}:${row.kpiKey}`, row]));

  const createRows: RoleDashboardKpiEntity[] = [];
  const updateRows: RoleDashboardKpiEntity[] = [];

  for (const seed of seeds) {
    const roleId = roleMap.get(roleNameKey(seed.role))?.id;
    if (!roleId) continue;
    const key = `${roleId}:${seed.kpiKey}`;
    const existing = existingMap.get(key);
    if (!existing) {
      createRows.push(
        roleDashboardKpiRepo.create({
          roleId,
          kpiKey: seed.kpiKey,
          isVisible: seed.isVisible,
          displayOrder: seed.displayOrder,
        }),
      );
      continue;
    }

    if (existing.isVisible !== seed.isVisible || existing.displayOrder !== seed.displayOrder) {
      existing.isVisible = seed.isVisible;
      existing.displayOrder = seed.displayOrder;
      updateRows.push(existing);
    }
  }

  if (createRows.length > 0) {
    await roleDashboardKpiRepo.save(createRows);
  }
  if (updateRows.length > 0) {
    await roleDashboardKpiRepo.save(updateRows);
  }
}

async function ensurePlatformUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: 'SUPERADMIN' | 'ROOT_ADMIN';
  userCode: string;
  department: string;
  profileImageUrl?: string | null;
  roleMap: Map<string, RoleEntity>;
}) {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);

  const normalizedEmail = input.email.toLowerCase();
  let user = await userRepo.findOne({ where: { email: normalizedEmail } });
  let existingProfile =
    !user
      ? await profileRepo.findOne({
          where: [{ userCode: input.userCode }, { email: normalizedEmail }],
        })
      : null;
  if (!user && existingProfile?.userId) {
    user = await userRepo.findOne({ where: { id: existingProfile.userId } });
  }
  if (!user) {
    user = userRepo.create({
      email: normalizedEmail,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phone: null,
      isActive: true,
    });
  } else {
    user.email = normalizedEmail;
    user.passwordHash = await hashPassword(input.password);
    user.fullName = input.fullName;
    user.isActive = true;
  }
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user = await userRepo.save(user);

  let profile = await profileRepo.findOne({ where: { userId: user.id } });
  if (!profile && existingProfile) {
    profile = existingProfile;
  }
  if (!profile) {
    existingProfile = await profileRepo.findOne({
      where: [{ userCode: input.userCode }, { email: normalizedEmail }],
    });
    profile = existingProfile;
  }
  if (!profile) {
    profile = profileRepo.create({
      userId: user.id,
      userCode: input.userCode,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profileImageUrl: input.profileImageUrl ?? null,
      plantId: null,
      department: input.department,
      isActive: true,
    });
  } else {
    profile.userId = user.id;
    profile.userCode = profile.userCode || input.userCode;
    profile.fullName = user.fullName;
    profile.email = user.email;
    profile.phone = user.phone;
    if (input.profileImageUrl !== undefined) {
      profile.profileImageUrl = input.profileImageUrl;
    }
    profile.plantId = null;
    profile.department = profile.department || input.department;
    profile.isActive = true;
  }
  await profileRepo.save(profile);

  const targetRole = input.role;
    const existingRoles = await userRoleRepo.find({ where: { userId: user.id } });
    const hasTarget = existingRoles.some((item) => normalizeRoleName(item.role) === targetRole);
  if (!hasTarget) {
    await userRoleRepo.save(
      userRoleRepo.create({
        userId: user.id,
        roleId: input.roleMap.get(targetRole)?.id ?? null,
        role: targetRole,
        plantId: null,
      }),
    );
  }

  return user;
}

async function repairUserRoleAssignments(roleMap: Map<string, RoleEntity>) {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);

  const users = await userRepo.find({ where: { isActive: true } });

  for (const user of users) {
    const currentRoles = await userRoleRepo.find({ where: { userId: user.id } });
    if (currentRoles.length === 0) {
      let desiredRole = 'USER';
      if (user.email.toLowerCase() === env.SUPERADMIN_EMAIL.toLowerCase()) {
        desiredRole = 'SUPERADMIN';
      } else if (user.email.toLowerCase() === env.ROOT_ADMIN_EMAIL.toLowerCase()) {
        desiredRole = 'ROOT_ADMIN';
      } else if (user.orgRoleId) {
        const orgRole = await orgRoleRepo.findOneBy({ id: user.orgRoleId });
        if (orgRole?.key) {
          desiredRole = normalizeRoleName(orgRole.key);
        }
      }

      if (!roleMap.has(desiredRole)) {
        const resolvedKey = resolveRoleMapKey(roleMap, desiredRole);
        desiredRole = resolvedKey ?? 'USER';
      }
      const desiredRoleEntity = roleMap.get(desiredRole) ?? roleMap.get('USER');

      const profile = await profileRepo.findOneBy({ userId: user.id });
      await userRoleRepo.save(
        userRoleRepo.create({
          userId: user.id,
          roleId: desiredRoleEntity?.id ?? null,
          role: roleMap.get(desiredRole)?.name ?? desiredRole,
          plantId: profile?.plantId ?? null,
        }),
      );
      continue;
    }

    for (const row of currentRoles) {
      const exactKey = resolveRoleMapKey(roleMap, row.role);
      let normalized = exactKey ?? 'USER';
      if (!roleMap.has(normalized)) {
        normalized = 'USER';
      }
      const canonicalRole = roleMap.get(normalized);
      if (!canonicalRole) continue;

      if (row.role !== canonicalRole.name || row.roleId !== canonicalRole.id) {
        row.role = canonicalRole.name;
        row.roleId = canonicalRole.id;
        await userRoleRepo.save(row);
      }
    }
  }
}

export async function runSeed() {
  const roleRepo = AppDataSource.getRepository(RoleEntity);
  const rolePermissionRepo = AppDataSource.getRepository(RolePermissionEntity);
  const roleDashboardKpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);

  const roleMap = await ensureRoles(roleRepo);

  const superadminUser = env.SEED_SUPERADMIN
    ? await ensurePlatformUser({
        email: env.SUPERADMIN_EMAIL,
        password: env.SUPERADMIN_PASSWORD,
        fullName: env.SUPERADMIN_FULL_NAME,
        role: 'SUPERADMIN',
        userCode: 'SUPER001',
        department: 'ADMINISTRATION',
        roleMap,
      })
    : null;

  const rootAdminUser = await ensurePlatformUser({
    email: env.ROOT_ADMIN_EMAIL,
    password: env.ROOT_ADMIN_PASSWORD,
    fullName: env.ROOT_ADMIN_FULL_NAME,
    role: 'ROOT_ADMIN',
    userCode: 'ROOT001',
    department: 'GOVERNANCE',
    profileImageUrl: buildFrontendAssetUrl(ROOT_ADMIN_PROFILE_IMAGE_PATH),
    roleMap,
  });

  await ensureRolePermissions(rolePermissionRepo, roleMap);
  await ensureRoleKpis(roleDashboardKpiRepo, roleMap);
  const demoData = env.SEED_DEMO_DATA
    ? await seedJkFennerDemoData(roleMap)
    : {
        seeded: false,
        reason: 'SEED_DEMO_DATA disabled',
      };
  await repairUserRoleAssignments(roleMap);

  return {
    roles: Array.from(roleMap.values())
      .map((role) => role.name)
      .sort(),
    superadminEmail: superadminUser?.email ?? null,
    rootAdminEmail: rootAdminUser.email,
    demoData,
  };
}
