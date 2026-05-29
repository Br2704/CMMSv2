import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { AppDataSource } from '../database/data-source';
import { EsgAuthorizedUserEntity, MaintenanceTeamEntity, OrgRoleEntity, OrgRolePermissionEntity, PlantEntity, ProfileEntity, RolePermissionEntity, UserRoleEntity, UserEntity } from '../database/entities';
import { enforceRoleRateLimit } from './roleRateLimit';
import { enforcePlantScopeRequest } from './plantScopeMiddleware';
import { normalizeModuleKey } from '../utils/rbac';
import { verifyAccessToken } from '../utils/jwtEnhanced';
import { fail } from '../utils/apiResponse';
import { recordSecurityEvent } from '../utils/securityEvents';
import { resolveUserOrganizationScope } from '../utils/userOrganization';
import { resolveCanonicalRoleKey, isValidEnterpriseRole } from '../config/enterprise-roles';
import { rolePrecedence } from '../utils/policy';
import { getPrimaryRole, getRolePrecedence, resolveRoleInfo } from '../services/role-hierarchy';
import { buildEnterprisePermissionMap, mergePermissionMaps } from '../services/permission-engine';
import { resolveScopeType } from '../services/scope-resolver';

function normalizeRole(role: string) {
  return resolveCanonicalRoleKey(role);
}

function mergePermissionActions(permissionMap: Record<string, string[]>, moduleKey: string, actions: string[]) {
  const normalizedModuleKey = normalizeModuleKey(moduleKey);
  const existing = permissionMap[normalizedModuleKey] ?? [];
  permissionMap[normalizedModuleKey] = Array.from(new Set([...existing, ...actions.map((action) => action.toUpperCase())]));
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
    const roles = userRoles.map((item) => normalizeRole(item.role)).filter(role => {
      return isValidEnterpriseRole(role);
    });
    
    const hasRootAdminRole = roles.some((role) => role === 'ROOT_ADMIN');
    let effectiveRoles = hasRootAdminRole ? ['ROOT_ADMIN'] : roles;
    if (effectiveRoles.length === 0) {
      logger.warn({ route: req.originalUrl, userId: user.id }, 'Authentication denied: user has no active role assignments');
      void recordSecurityEvent({
        userId: user.id,
        eventType: 'AUTH_NO_ROLE_ASSIGNMENT',
        severity: 'HIGH',
        module: 'AUTH',
        action: req.method,
        path: req.originalUrl,
        message: 'Authentication denied because the user has no active role assignments',
        ipAddress: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      });
      res.status(403).json(fail('Forbidden'));
      return;
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

    // Use the new role-hierarchy service for getting the primary role
    const roleKey = getPrimaryRole(effectiveRoles);
    const scopeType = resolveScopeType(roleKey);
    const isRootAdmin = scopeType === 'PLATFORM';
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

    // ------------------------------------------------------------------
    // PERMISSION MAP RESOLUTION using the new Enterprise Permission Engine
    // ------------------------------------------------------------------
    let permissionMap: Record<string, string[]> = {};

    // 1. Check org-level custom permissions (for organization-scoped roles)
    if (resolvedOrganizationId && orgRoleId) {
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
    }

    // 2. If empty, check plant-level role permissions
    if (Object.keys(permissionMap).length === 0) {
      if (!isRootAdmin) {
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
      }
    }

    // 3. Fallback to enterprise-defined permissions when DB permissions are empty
    if (Object.keys(permissionMap).length === 0) {
      const fallbackRole = roleKey ?? 'MAINTENANCE_USER';
      logger.warn(
        {
          userId: user.id,
          roleKey: fallbackRole,
          reason: 'permissions_empty_enterprise_fallback_used',
        },
        'RBAC enterprise fallback applied',
      );
      permissionMap = buildEnterprisePermissionMap(fallbackRole);
    }

    // 4. Merge enterprise defaults on top of DB permissions (ensure at least default access)
    const enterpriseDefaults = buildEnterprisePermissionMap(roleKey);
    permissionMap = mergePermissionMaps(enterpriseDefaults, permissionMap);

    // 5. Apply SUPER_ADMIN overrides
    if (isSuperAdmin && !isRootAdmin) {
      permissionMap.ORGANIZATIONS = ['READ'];
      permissionMap.PLANTS = ['READ', 'UPDATE'];
      delete permissionMap.ROLE_ACCESS;
    }

    // 6. Remove ROLE_ACCESS for non-admin non-root users
    if (!isRootAdmin && !isSuperAdmin) {
      delete permissionMap.ROLE_ACCESS;
    }

    // 7. ESG authorized user check — grant ESG access if user is ESG-authorized
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

    // 8. Resolve maintenance team memberships
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

    // ------------------------------------------------------------------
    // Build AuthContext
    // ------------------------------------------------------------------
    req.auth = {
      userId: user.id,
      email: user.email,
      roles: effectiveRoles,
      roleKey,
      rolePrecedence: rolePrecedence(roleKey),
      scopeType: scopeType === 'PLATFORM' ? 'ROOT_ADMIN' : scopeType === 'ORGANIZATION' ? 'ORGANIZATION' : 'PLANT',
      organizationId: resolvedOrganizationId,
      orgRoleId: orgRoleId ?? null,
      department: (profile?.departmentId as string | null) ?? null,
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
