import { forbidden } from './httpError';
import { normalizeRoleName } from './rbac';

export const SYSTEM_ROLES = [
  'ROOT_ADMIN',
  'SUPER_ADMIN',
  'PLANT_ADMIN',
  'ESG_ADMIN',
  'HR_ADMIN',
  'MAINTENANCE_MANAGER',
  'PRODUCTION_MANAGER',
  'SCM_MANAGER',
  'HR_MANAGER',
  'CALIBRATION_MANAGER',
  'ACCOUNTS_MANAGER',
  'SAFETY_MANAGER',
  'ESG_MANAGER',
  'MAINTENANCE_USER',
  'PRODUCTION_USER',
  'SCM_USER',
  'HR_USER',
  'CALIBRATION_USER',
  'ACCOUNTS_USER',
  'SAFETY_USER',
  'ESG_USER',
  'VENDOR',
  'VISITOR',
  'SECURITY',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export type ActorRoleKey = string;

export type PolicyActor = {
  userId: string;
  roleKey: ActorRoleKey;
  roles: string[];
  plantId?: string | null;
  plantIds: string[];
  accessAllPlants: boolean;
};

export type PolicyTargetUser = {
  userId: string;
  roleKeys: string[];
  plantId: string | null;
};

const ROLE_PRECEDENCE: Record<string, number> = {
  ROOT_ADMIN: 400,
  SUPER_ADMIN: 320,
  PLANT_ADMIN: 300,
  ESG_ADMIN: 290,
  HR_ADMIN: 285,
  MAINTENANCE_MANAGER: 180,
  PRODUCTION_MANAGER: 176,
  SCM_MANAGER: 174,
  HR_MANAGER: 172,
  CALIBRATION_MANAGER: 170,
  ACCOUNTS_MANAGER: 168,
  SAFETY_MANAGER: 166,
  ESG_MANAGER: 164,
  MAINTENANCE_USER: 150,
  SCM_USER: 148,
  HR_USER: 145,
  CALIBRATION_USER: 144,
  ACCOUNTS_USER: 143,
  SAFETY_USER: 142,
  PRODUCTION_USER: 138,
  ESG_USER: 136,
  VENDOR: 105,
  SECURITY: 102,
  VISITOR: 95,

};

const SUPERADMIN_MANAGED_ROLES = new Set([
  'MAINTENANCE_MANAGER',
  'PRODUCTION_MANAGER',
  'SCM_MANAGER',
  'HR_MANAGER',
  'CALIBRATION_MANAGER',
  'ACCOUNTS_MANAGER',
  'SAFETY_MANAGER',
  'ESG_MANAGER',
  'MAINTENANCE_USER',
  'PRODUCTION_USER',
  'SCM_USER',
  'HR_USER',
  'CALIBRATION_USER',
  'ACCOUNTS_USER',
  'SAFETY_USER',
  'ESG_USER',
  'SECURITY',
  'VENDOR',
  'VISITOR',

]);

const ADMIN_MANAGED_ROLES = new Set([
  'MAINTENANCE_MANAGER',
  'PRODUCTION_MANAGER',
  'SCM_MANAGER',
  'HR_MANAGER',
  'CALIBRATION_MANAGER',
  'ACCOUNTS_MANAGER',
  'SAFETY_MANAGER',
  'ESG_MANAGER',
  'MAINTENANCE_USER',
  'PRODUCTION_USER',
  'SCM_USER',
  'HR_USER',
  'CALIBRATION_USER',
  'ACCOUNTS_USER',
  'SAFETY_USER',
  'ESG_USER',
  'SECURITY',
  'VENDOR',
  'VISITOR',

]);

function normalizeRole(role: string): string {
  return normalizeRoleName(role);
}

export function rolePrecedence(roleKey: string): number {
  const normalized = normalizeRole(roleKey);
  return ROLE_PRECEDENCE[normalized] ?? 100;
}

export function getPrimaryRoleKey(roles: string[]): string {
  if (roles.length === 0) return 'VISITOR';
  return roles
    .map((role) => normalizeRole(role))
    .sort((a, b) => rolePrecedence(b) - rolePrecedence(a))[0];
}

export function isSystemRole(roleKey: string): boolean {
  const normalized = normalizeRole(roleKey);
  return SYSTEM_ROLES.includes(normalized as SystemRole);
}

export function isRegularRole(roleKey: string): boolean {
  return !isSystemRole(roleKey);
}

export function visibleRolesForActor(actorRole: string): string[] {
  const role = normalizeRole(actorRole);
  const ALL_ROLES = [...SYSTEM_ROLES];
  const ADMIN_ROLES = ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'ESG_ADMIN', 'HR_ADMIN'];
  const NON_ADMIN_ROLES = ALL_ROLES.filter((r) => !ADMIN_ROLES.includes(r as any));

  if (role === 'ROOT_ADMIN') {
    return ALL_ROLES;
  }
  if (role === 'SUPER_ADMIN' || role === 'PLANT_ADMIN' || role === 'ESG_ADMIN' || role === 'HR_ADMIN') {
    return [role, ...NON_ADMIN_ROLES];
  }
  if (role === 'HR_MANAGER') {
    return [role, 'HR_USER', 'SECURITY', 'VENDOR', 'VISITOR'];
  }
  return [role];
}

export function allowedRoleTargetsForCreate(actorRole: string): string[] {
  return visibleRolesForActor(actorRole).filter((targetRole) => canCreateUser(actorRole, targetRole));
}

export function allowedRoleTargetsForEdit(actorRole: string): string[] {
  return visibleRolesForActor(actorRole).filter((targetRole) => canAssignRole(actorRole, targetRole));
}

export function canCreateUser(actorRole: string, createRole: string): boolean {
  const normalizedActor = normalizeRole(actorRole);
  const normalizedCreateRole = normalizeRole(createRole);

  const isAdminTarget = ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'ESG_ADMIN', 'HR_ADMIN'].includes(normalizedCreateRole);

  if (normalizedActor === 'ROOT_ADMIN') {
    return true;
  }

  if (isAdminTarget) {
    return false;
  }

  if (normalizedActor === 'SUPER_ADMIN') {
    return SUPERADMIN_MANAGED_ROLES.has(normalizedCreateRole);
  }

  if (normalizedActor === 'PLANT_ADMIN' || normalizedActor === 'ESG_ADMIN' || normalizedActor === 'HR_ADMIN') {
    return ADMIN_MANAGED_ROLES.has(normalizedCreateRole);
  }

  if (normalizedActor === 'HR_MANAGER') {
    return ['HR_USER', 'SECURITY', 'VENDOR', 'VISITOR'].includes(normalizedCreateRole);
  }

  return false;
}

export function canAssignRole(actorRole: string, roleKey: string): boolean {
  return canCreateUser(actorRole, roleKey);
}

export function canViewUser(actor: PolicyActor, targetUser: PolicyTargetUser): boolean {
  const actorRole = normalizeRole(actor.roleKey);
  const targetRoles = targetUser.roleKeys.map((item) => normalizeRole(item));
  const hasAdminTarget = targetRoles.some((r) => ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'ESG_ADMIN', 'HR_ADMIN'].includes(r));

  if (actorRole === 'ROOT_ADMIN') return true;

  if (hasAdminTarget) {
    return targetUser.userId === actor.userId;
  }

  if (actorRole === 'SUPER_ADMIN') {
    return true;
  }

  if (actorRole === 'PLANT_ADMIN' || actorRole === 'ESG_ADMIN' || actorRole === 'HR_ADMIN' || actorRole === 'HR_MANAGER') {
    return !!targetUser.plantId && actor.plantIds.includes(targetUser.plantId);
  }

  return targetUser.userId === actor.userId;
}

export function canEditUser(actor: PolicyActor, targetUser: PolicyTargetUser): boolean {
  const actorRole = normalizeRole(actor.roleKey);
  const targetRoles = targetUser.roleKeys.map((item) => normalizeRole(item));
  const hasAdminTarget = targetRoles.some((r) => ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'ESG_ADMIN', 'HR_ADMIN'].includes(r));

  if (actorRole === 'ROOT_ADMIN') {
    return true;
  }

  if (hasAdminTarget) {
    return false;
  }

  if (actorRole === 'SUPER_ADMIN') {
    return targetRoles.every((role) => canAssignRole(actorRole, role));
  }

  if (actorRole === 'PLANT_ADMIN' || actorRole === 'ESG_ADMIN' || actorRole === 'HR_ADMIN' || actorRole === 'HR_MANAGER') {
    if (!targetRoles.every((role) => canAssignRole(actorRole, role))) return false;
    return !!targetUser.plantId && actor.plantIds.includes(targetUser.plantId);
  }

  return false;
}

export function enforcePlantScope(actor: PolicyActor, resourcePlantId: string | null | undefined): void {
  const actorRole = normalizeRole(actor.roleKey);

  if (actorRole === 'ROOT_ADMIN') {
    return;
  }

  if (actor.accessAllPlants) {
    if (!resourcePlantId) {
      return;
    }
    if (!actor.plantIds.includes(resourcePlantId)) {
      forbidden('Plant scope violation');
    }
    return;
  }

  if (!resourcePlantId || !actor.plantIds.includes(resourcePlantId)) {
    forbidden('Plant scope violation');
  }
}

export function hasRootAdminAllowAll(roles: string[]): boolean {
  return roles.map((role) => normalizeRole(role)).includes('ROOT_ADMIN');
}

export function canDeleteRoleByPolicy(input: { isSystem: boolean; assignedUsers: number }): { allowed: true } | { allowed: false; reason: string } {
  if (input.isSystem) {
    return { allowed: false, reason: 'SYSTEM_ROLE' };
  }
  if (input.assignedUsers > 0) {
    return { allowed: false, reason: 'ROLE_ASSIGNED' };
  }
  return { allowed: true };
}
