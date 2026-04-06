import { forbidden } from './httpError';
import { normalizeRoleName } from './rbac';

export const SYSTEM_ROLES = ['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER', 'USER', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR', 'SECURITY'] as const;

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
  SUPERADMIN: 300,
  ADMIN: 200,
  MAINTENANCE_MANAGER: 180,
  ENGINEER: 140,
  TECHNICIAN: 130,
  STORE_USER: 125,
  VIEWER: 110,
  VENDOR: 105,
  SECURITY: 102,
  VISITOR: 95,
  TEMPORARY_VISITOR: 94,
};

const SUPERADMIN_MANAGED_ROLES = new Set([
  'MAINTENANCE_MANAGER',
  'ENGINEER',
  'TECHNICIAN',
  'STORE_USER',
  'VIEWER',
  'USER',
  'SECURITY',
  'VENDOR',
  'VISITOR',
  'TEMPORARY_VISITOR',
]);

const ADMIN_MANAGED_ROLES = new Set([
  'MAINTENANCE_MANAGER',
  'ENGINEER',
  'TECHNICIAN',
  'STORE_USER',
  'VIEWER',
  'USER',
  'SECURITY',
  'VENDOR',
  'VISITOR',
  'TEMPORARY_VISITOR',
]);

function normalizeRole(role: string): string {
  return normalizeRoleName(role);
}

export function rolePrecedence(roleKey: string): number {
  const normalized = normalizeRole(roleKey);
  return ROLE_PRECEDENCE[normalized] ?? 100;
}

export function getPrimaryRoleKey(roles: string[]): string {
  if (roles.length === 0) return 'USER';
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
  if (role === 'ROOT_ADMIN') {
    return ['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER', 'ENGINEER', 'TECHNICIAN', 'STORE_USER', 'VIEWER', 'SECURITY', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR', 'USER'];
  }
  if (role === 'SUPERADMIN') {
    return ['MAINTENANCE_MANAGER', 'ENGINEER', 'TECHNICIAN', 'STORE_USER', 'VIEWER', 'SECURITY', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR', 'USER'];
  }
  if (role === 'ADMIN') {
    return ['MAINTENANCE_MANAGER', 'ENGINEER', 'TECHNICIAN', 'STORE_USER', 'VIEWER', 'USER', 'SECURITY', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR'];
  }
  return ['USER', 'SECURITY', 'VENDOR', 'VISITOR', 'TEMPORARY_VISITOR'];
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

  if (normalizedActor === 'ROOT_ADMIN') return true;
  if (normalizedCreateRole === 'ROOT_ADMIN') return false;
  if (normalizedActor === 'SUPERADMIN') {
    return SUPERADMIN_MANAGED_ROLES.has(normalizedCreateRole);
  }
  if (normalizedActor === 'ADMIN') {
    return ADMIN_MANAGED_ROLES.has(normalizedCreateRole);
  }
  return false;
}

export function canAssignRole(actorRole: string, roleKey: string): boolean {
  const normalizedActor = normalizeRole(actorRole);
  const normalizedTargetRole = normalizeRole(roleKey);

  if (normalizedActor === 'ROOT_ADMIN') return true;
  if (normalizedTargetRole === 'ROOT_ADMIN') return false;
  if (normalizedActor === 'SUPERADMIN') {
    return SUPERADMIN_MANAGED_ROLES.has(normalizedTargetRole);
  }
  if (normalizedActor === 'ADMIN') {
    return ADMIN_MANAGED_ROLES.has(normalizedTargetRole);
  }
  return false;
}

export function canViewUser(actor: PolicyActor, targetUser: PolicyTargetUser): boolean {
  const actorRole = normalizeRole(actor.roleKey);
  const targetRoles = targetUser.roleKeys.map((item) => normalizeRole(item));

  if (actorRole === 'ROOT_ADMIN') return true;
  if (targetRoles.includes('ROOT_ADMIN')) return false;

  if (actorRole === 'SUPERADMIN') {
    return true;
  }

  if (actorRole === 'ADMIN') {
    if (targetRoles.includes('SUPERADMIN')) return false;
    return !!targetUser.plantId && actor.plantIds.includes(targetUser.plantId);
  }

  return targetUser.userId === actor.userId;
}

export function canEditUser(actor: PolicyActor, targetUser: PolicyTargetUser): boolean {
  const actorRole = normalizeRole(actor.roleKey);
  const targetRoles = targetUser.roleKeys.map((item) => normalizeRole(item));

  if (actorRole === 'ROOT_ADMIN') {
    return true;
  }

  if (targetRoles.includes('ROOT_ADMIN')) {
    return false;
  }

  if (actorRole === 'SUPERADMIN') {
    return targetRoles.every((role) => canAssignRole(actorRole, role));
  }

  if (actorRole === 'ADMIN') {
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
