import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { EsgAuthorizedUserEntity, MaintenanceTeamEntity, OrgRoleEntity, OrgRolePermissionEntity, PlantEntity, ProfileEntity, RolePermissionEntity, UserRoleEntity, UserEntity } from '../database/entities';
import { enforceRoleRateLimit } from './roleRateLimit';
import { enforcePlantScopeRequest } from './plantScopeMiddleware';
import { RBAC_ACTIONS, RBAC_MODULE_KEYS, isAdminRole, isRootAdminRole, normalizeModuleKey, normalizeRoleName, resolveScopeType } from '../utils/rbac';
import { verifyAccessToken } from '../utils/jwt';
import { getPrimaryRoleKey, rolePrecedence } from '../utils/policy';
import { fail } from '../utils/apiResponse';
import { recordSecurityEvent } from '../utils/securityEvents';
import { resolveUserOrganizationScope } from '../utils/userOrganization';
import { applySystemRolePermissionPolicy } from '../utils/systemRolePermissionPolicy';

function normalizeRole(role: string) {
  return normalizeRoleName(role);
}

function mergePermissionActions(permissionMap: Record<string, string[]>, moduleKey: string, actions: string[]) {
  const normalizedModuleKey = normalizeModuleKey(moduleKey);
  const existing = permissionMap[normalizedModuleKey] ?? [];
  permissionMap[normalizedModuleKey] = Array.from(new Set([...existing, ...actions.map((action) => action.toUpperCase())]));
}

function buildFallbackPermissionsForRole(role: string): Record<string, string[]> {
  const normalized = normalizeRole(role);
  const allActions = [...RBAC_ACTIONS];

  const fromModules = (modules: string[], actions: string[]) =>
    Object.fromEntries(modules.map((moduleKey) => [moduleKey, [...actions]])) as Record<string, string[]>;

  const readOnly = ['READ'];

  if (normalized === 'SUPERADMIN') {
    const map = Object.fromEntries(RBAC_MODULE_KEYS.map((moduleKey) => [moduleKey, [...allActions]])) as Record<string, string[]>;
    delete map.ROLE_ACCESS;
    map.ORGANIZATIONS = ['READ'];
    map.PLANTS = ['READ', 'UPDATE'];
    return map;
  }
  if (normalized === 'ROOT_ADMIN') {
    return fromModules([...RBAC_MODULE_KEYS], allActions);
  }
  if (normalized === 'ADMIN') {
    const map = Object.fromEntries(RBAC_MODULE_KEYS.map((moduleKey) => [moduleKey, allActions])) as Record<string, string[]>;
    map.PLANTS = ['READ'];
    delete map.ROLE_ACCESS;
    delete map.BENCHMARKING;
    map.ORGANIZATIONS = ['READ'];
    return map;
  }
  if (normalized === 'MAINTENANCE_MANAGER') {
    return {
      ...fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'AMC', 'LOGS', 'INVENTORY', 'REPORTS', 'NOTIFICATIONS'], readOnly),
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
  }
  if (normalized === 'ENGINEER') {
    return {
      ...fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'LOGS', 'NOTIFICATIONS', 'REPORTS'], readOnly),
      WORK_ORDERS: ['READ', 'CREATE', 'UPDATE'],
      LOGS: ['READ', 'CREATE', 'UPDATE'],
    };
  }
  if (normalized === 'TECHNICIAN') {
    return {
      ...fromModules(['DASHBOARD', 'WORK_ORDERS', 'PM', 'LOGS', 'NOTIFICATIONS'], readOnly),
      WORK_ORDERS: ['READ', 'CREATE', 'UPDATE'],
      LOGS: ['READ', 'CREATE', 'UPDATE'],
    };
  }
  if (normalized === 'STORE_USER') {
    return {
      ...fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'NOTIFICATIONS', 'INVENTORY'], readOnly),
      INVENTORY: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
    };
  }
  if (normalized === 'VIEWER') {
    return fromModules(['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'REPORTS', 'NOTIFICATIONS'], readOnly);
  }
  if (normalized === 'VENDOR') {
    return fromModules(['AMC'], readOnly);
  }
  if (normalized === 'VISITOR') {
    return {};
  }
  if (normalized === 'SECURITY_USER' || normalized === 'SECURITY') {
    return {
      ...fromModules(['GATES'], ['READ', 'CREATE', 'UPDATE', 'EXPORT']),
      GATES: ['READ', 'CREATE', 'UPDATE', 'EXPORT'],
    };
  }
  if (normalized === 'USER') {
    return {
      DASHBOARD: ['READ'],
      ASSETS: ['READ'],
      WORK_ORDERS: ['READ', 'CREATE'],
      PM: ['READ'],
      NOTIFICATIONS: ['READ'],
    };
  }
  return {};
}

function mapPermissions(
  rows: Array<{ moduleKey?: string | null; moduleId?: string | null; actions: string[] | null | undefined }>,
): Record<string, string[]> {
  const permissionMap: Record<string, string[]> = {};
  for (const permission of rows) {
    const moduleId = normalizeModuleKey(permission.moduleKey ?? permission.moduleId ?? '');
    if (!moduleId) continue;
    if (!permissionMap[moduleId]) {
      permissionMap[moduleId] = [];
    }
    for (const action of permission.actions ?? []) {
      const normalizedAction = action.toUpperCase();
      if (!permissionMap[moduleId].includes(normalizedAction)) {
        permissionMap[moduleId].push(normalizedAction);
      }
    }
  }
  return permissionMap;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({ route: req.originalUrl, reason: 'missing_or_invalid_authorization_header' }, 'Authentication denied');
      void recordSecurityEvent({
        eventType: 'AUTH_MISSING_BEARER',
        severity: 'MEDIUM',
        module: 'AUTH',
        action: req.method,
        path: req.originalUrl,
        message: 'Authentication denied because the bearer token is missing or malformed',
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      });
      res.status(401).json(fail('Unauthorized'));
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const userRepo = AppDataSource.getRepository(UserEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const permissionRepo = AppDataSource.getRepository(RolePermissionEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
    const orgPermissionRepo = AppDataSource.getRepository(OrgRolePermissionEntity);
    const esgAuthorizedUserRepo = AppDataSource.getRepository(EsgAuthorizedUserEntity);
    const maintenanceTeamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);

    const user = await userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      logger.warn({ route: req.originalUrl, userId: payload.sub, reason: 'user_not_found_or_inactive' }, 'Authentication denied');
      void recordSecurityEvent({
        userId: payload.sub,
        eventType: 'AUTH_INACTIVE_USER_ACCESS',
        severity: 'HIGH',
        module: 'AUTH',
        action: req.method,
        path: req.originalUrl,
        message: 'Authentication denied because the user is missing or inactive',
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      });
      res.status(401).json(fail('Unauthorized'));
      return;
    }

    const userRoles = await roleRepo.find({ where: { userId: user.id } });
    const profile = await profileRepo.findOneBy({ userId: user.id });
    const roles = userRoles.map((item) => normalizeRole(item.role));
    const normalizedSuperAdminEmail = env.SUPERADMIN_EMAIL.trim().toLowerCase();
    const normalizedUserEmail = user.email.trim().toLowerCase();
    const normalizedRootAdminEmail = env.ROOT_ADMIN_EMAIL.trim().toLowerCase();
    const isConfiguredRootAdmin = Boolean(normalizedRootAdminEmail) && normalizedUserEmail === normalizedRootAdminEmail;
    const isConfiguredSuperAdmin = Boolean(normalizedSuperAdminEmail) && normalizedUserEmail === normalizedSuperAdminEmail;
    if (isConfiguredRootAdmin && !roles.some((role) => isRootAdminRole(role))) {
      roles.unshift('ROOT_ADMIN');
      void recordSecurityEvent({
        userId: user.id,
        eventType: 'AUTH_AUTO_ROLE_ASSIGNED',
        severity: 'MEDIUM',
        module: 'AUTH',
        action: 'LOGIN',
        path: req.originalUrl,
        message: `Auto-assigned ROOT_ADMIN role based on email matching`,
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { emailDomain: normalizedUserEmail.split('@')[1] },
      });
    }
    if (isConfiguredSuperAdmin && !roles.includes('SUPERADMIN') && !roles.some((role) => isRootAdminRole(role))) {
      roles.unshift('SUPERADMIN');
      void recordSecurityEvent({
        userId: user.id,
        eventType: 'AUTH_AUTO_ROLE_ASSIGNED',
        severity: 'MEDIUM',
        module: 'AUTH',
        action: 'LOGIN',
        path: req.originalUrl,
        message: `Auto-assigned SUPERADMIN role based on email matching`,
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        metadata: { emailDomain: normalizedUserEmail.split('@')[1] },
      });
    }
    const hasRootAdminRole = roles.some((role) => isRootAdminRole(role));
    let effectiveRoles = hasRootAdminRole ? ['ROOT_ADMIN'] : roles;
    if (effectiveRoles.length === 0) {
      effectiveRoles = ['USER'];
    }

    const allCandidatePlantIds = Array.from(
      new Set([profile?.plantId, ...userRoles.map((item) => item.plantId)].filter((value): value is string => Boolean(value))),
    );
    const resolvedScope = await resolveUserOrganizationScope({
      user,
      profile,
      authPlantIds: allCandidatePlantIds,
    });
    let resolvedOrganizationId = resolvedScope.organizationId;
    let orgRoleId = resolvedScope.orgRoleId ?? user.orgRoleId;
    let orgRoleKey: string | null = resolvedScope.orgRoleKey ?? null;

    if (!resolvedOrganizationId && allCandidatePlantIds.length > 0) {
      const candidatePlants = await plantRepo.find({
        where: allCandidatePlantIds.map((id) => ({ id })),
        select: ['organizationId'],
      });
      resolvedOrganizationId = candidatePlants.find((plant) => Boolean(plant.organizationId))?.organizationId ?? null;
    }

    if (!hasRootAdminRole && !orgRoleKey && resolvedOrganizationId && user.orgRoleId) {
      const orgRole = await orgRoleRepo.findOneBy({ id: user.orgRoleId, organizationId: resolvedOrganizationId, isActive: true });
      if (orgRole) {
        orgRoleId = orgRole.id;
        orgRoleKey = normalizeRole(orgRole.key);
      }
    }

    if (!hasRootAdminRole && orgRoleKey) {
      effectiveRoles = [orgRoleKey];
    }

    const roleKey = getPrimaryRoleKey(effectiveRoles);
    const scopeType = resolveScopeType(roleKey);
    const isRootAdmin = scopeType === 'ROOT_ADMIN';
    const isSuperAdmin = scopeType === 'ORGANIZATION';

    let plantIds: string[] = [];
    if (isSuperAdmin) {
      if (resolvedOrganizationId) {
        const orgPlants = await plantRepo.find({
          where: { organizationId: resolvedOrganizationId, isActive: true },
          select: ['id'],
        });
        plantIds = orgPlants.map((plant) => plant.id);
      } else {
        logger.warn(
          {
            userId: user.id,
            roleKey,
            reason: 'organization_scope_without_organization_id',
          },
          'Scope resolution warning',
        );
      }
    } else if (!isRootAdmin) {
      const actorPlantId = profile?.plantId ?? allCandidatePlantIds[0] ?? null;
      if (actorPlantId) {
        plantIds = [actorPlantId];
        if (!resolvedOrganizationId) {
          const actorPlant = await plantRepo.findOne({
            where: { id: actorPlantId },
            select: ['organizationId'],
          });
          resolvedOrganizationId = actorPlant?.organizationId ?? null;
        }
      }
    }

    const activePlantId = plantIds[0] ?? null;
    const accessAllPlants = scopeType === 'ORGANIZATION';
    let permissionMap: Record<string, string[]> = {};

    if (!isRootAdmin && resolvedOrganizationId && orgRoleId) {
      const orgPermissions = await orgPermissionRepo.find({
        where: { organizationId: resolvedOrganizationId, roleId: orgRoleId },
      });
      permissionMap = mapPermissions(
        orgPermissions.map((row) => ({
          moduleKey: row.moduleKey,
          moduleId: row.moduleKey,
          actions: Array.isArray(row.actions) ? row.actions : [],
        })),
      );
      if (Object.keys(permissionMap).length === 0 && orgRoleKey) {
        logger.warn(
          {
            userId: user.id,
            organizationId: resolvedOrganizationId,
            orgRoleKey,
            reason: 'org_role_permissions_empty_fallback_used',
          },
          'RBAC fallback applied',
        );
        permissionMap = buildFallbackPermissionsForRole(orgRoleKey);
      }
    }

    if (Object.keys(permissionMap).length === 0) {
      const roleIds = userRoles.map((item) => item.roleId).filter((value): value is string => Boolean(value));
      const permissions = effectiveRoles.length
        ? await permissionRepo.find({ where: [...effectiveRoles.map((role) => ({ role })), ...roleIds.map((roleId) => ({ roleId }))] })
        : [];
      permissionMap = mapPermissions(
        permissions.map((permission) => ({
          moduleKey: permission.moduleKey,
          moduleId: permission.moduleId,
          actions: permission.actions,
        })),
      );
      if (Object.keys(permissionMap).length === 0) {
        const fallbackRole = roleKey ?? normalizeRole(userRoles[0]?.role ?? 'USER');
        logger.warn(
          {
            userId: user.id,
            roleKey: fallbackRole,
            reason: 'role_permissions_empty_fallback_used',
          },
          'RBAC fallback applied',
        );
        permissionMap = buildFallbackPermissionsForRole(fallbackRole);
      }
    }

    if (isSuperAdmin && !isRootAdmin) {
      // SUPERADMIN always retains operational access inside organization scope,
      // but governance mutations stay reserved for ROOT_ADMIN.
      const fullSuperAdminPermissions = buildFallbackPermissionsForRole('SUPERADMIN');
      for (const [moduleKey, actions] of Object.entries(fullSuperAdminPermissions)) {
        const existing = permissionMap[moduleKey] ?? [];
        permissionMap[moduleKey] = Array.from(new Set([...existing, ...actions.map((action) => action.toUpperCase())]));
      }
      permissionMap.ORGANIZATIONS = ['READ'];
      permissionMap.PLANTS = ['READ', 'UPDATE'];
      delete permissionMap.ROLE_ACCESS;
    }

    if (!effectiveRoles.includes('SUPERADMIN') && effectiveRoles.some((role) => normalizeRole(role) === 'ADMIN')) {
      delete permissionMap.ROLE_ACCESS;
      if (roleKey === 'ADMIN') {
        permissionMap.ORGANIZATIONS = ['READ'];
        permissionMap.PLANTS = ['READ'];
      }
    }

    if (!isRootAdmin && !isSuperAdmin) {
      delete permissionMap.ROLE_ACCESS;
    }

    if (!isRootAdmin && plantIds.length > 0) {
      const esgAssignments = await esgAuthorizedUserRepo.find({
        where: plantIds.map((plantId) => ({ plantId, userId: user.id })),
        select: ['id'],
        take: 1,
      });
      if (esgAssignments.length > 0) {
        mergePermissionActions(permissionMap, 'ESG', ['READ', 'UPDATE']);
      }
    }

    if (!isRootAdmin) {
      permissionMap = applySystemRolePermissionPolicy(roleKey, permissionMap);
    }

    if (isRootAdmin) {
      const rootScopedPermissions: Record<string, string[]> = {};
      RBAC_MODULE_KEYS.forEach((moduleKey) => {
        rootScopedPermissions[moduleKey] = [...RBAC_ACTIONS];
      });
      permissionMap = rootScopedPermissions;
    }

    const teamRows = plantIds.length > 0
      ? await maintenanceTeamRepo.find({
          where: plantIds.map((plantId) => ({ plantId, isActive: true })),
          select: ['id', 'teamLeaderId', 'teamMemberIds'],
        })
      : [];
    const teamIds = teamRows
      .filter((team) => team.teamLeaderId === user.id || (team.teamMemberIds ?? []).includes(user.id))
      .map((team) => team.id);

    if (Object.keys(permissionMap).length === 0) {
      logger.warn(
        {
          userId: user.id,
          roles: effectiveRoles,
          organizationId: resolvedOrganizationId,
          reason: 'empty_permission_map_after_resolution',
        },
        'RBAC resolved with empty permissions',
      );
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      roles: effectiveRoles,
      roleKey,
      rolePrecedence: rolePrecedence(roleKey),
      scopeType,
      organizationId: resolvedOrganizationId,
      orgRoleId: orgRoleId ?? null,
      department: profile?.department ?? null,
      teamIds,
      permissions: permissionMap,
      plantIds,
      activePlantId,
      accessAllPlants,
    };

    enforcePlantScopeRequest(req);

    if (!enforceRoleRateLimit(req, res)) {
      return;
    }

    next();
  } catch {
    logger.warn({ route: req.originalUrl, reason: 'token_verification_failed' }, 'Authentication denied');
    void recordSecurityEvent({
      eventType: 'AUTH_TOKEN_VERIFICATION_FAILED',
      severity: 'HIGH',
      module: 'AUTH',
      action: req.method,
      path: req.originalUrl,
      message: 'Authentication denied because access token verification failed',
      ipAddress: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      notify: true,
    });
    res.status(401).json(fail('Unauthorized'));
  }
}
