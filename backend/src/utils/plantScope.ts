import type { AuthContext } from '../types/auth';
import { forbidden } from './httpError';
import { normalizeRoleName, resolveScopeType } from './rbac';

function getEffectiveRoleKey(auth: Pick<AuthContext, 'roleKey' | 'roles'>): string {
  if (typeof auth.roleKey === 'string' && auth.roleKey.trim()) {
    return auth.roleKey;
  }
  return auth.roles[0] ?? 'MAINTENANCE_USER';
}

export function getActorPlantId(auth: AuthContext): string | null {
  if (auth.activePlantId) {
    return auth.activePlantId;
  }
  return auth.plantIds[0] ?? null;
}

export function isGlobalRole(roleKey?: string | null, roles: string[] = [], organizationId?: string | null): boolean {
  const normalizedRoleKey = typeof roleKey === 'string' ? normalizeRoleName(roleKey) : '';
  const normalizedRoles = roles.map(normalizeRoleName);
  const effectiveRole = normalizedRoleKey || normalizedRoles[0] || 'MAINTENANCE_USER';
  const scopeType = resolveScopeType(effectiveRole);
  if (scopeType === 'ROOT_ADMIN') return true;
  if (scopeType === 'ORGANIZATION') {
    return Boolean(organizationId) || normalizedRoles.includes('SUPER_ADMIN');
  }
  return false;
}

export function resolvePlantFilter(auth: AuthContext, requestedPlantId?: string): string[] | null {
  const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveRoleKey(auth));

  if (scopeType === 'ROOT_ADMIN') {
    return requestedPlantId ? [requestedPlantId] : null;
  }

  if (scopeType === 'ORGANIZATION' || auth.accessAllPlants) {
    if (requestedPlantId) {
      return auth.plantIds.includes(requestedPlantId) ? [requestedPlantId] : [];
    }
    return auth.plantIds;
  }

  const actorPlantId = getActorPlantId(auth);
  if (!actorPlantId) {
    return [];
  }

  return [actorPlantId];
}

export function resolveScopedPlantId(auth: AuthContext, requestedPlantId?: string | null): string | null {
  const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveRoleKey(auth));
  if (scopeType === 'ROOT_ADMIN') {
    return requestedPlantId ?? null;
  }
  if (scopeType === 'ORGANIZATION' || auth.accessAllPlants) {
    if (requestedPlantId) {
      return auth.plantIds.includes(requestedPlantId) ? requestedPlantId : null;
    }
    return auth.plantIds[0] ?? null;
  }
  return getActorPlantId(auth);
}

export function enforcePlantScope(auth: AuthContext, plantId: string | null | undefined): void {
  const scopeType = auth.scopeType ?? resolveScopeType(getEffectiveRoleKey(auth));
  if (scopeType === 'ROOT_ADMIN') {
    return;
  }

  if (scopeType === 'ORGANIZATION' || auth.accessAllPlants) {
    if (!plantId) return;
    if (auth.plantIds.length === 0) {
      forbidden('Plant scope violation');
    }
    if (!auth.plantIds.includes(plantId)) {
      forbidden('Plant scope violation');
    }
    return;
  }

  const actorPlantId = getActorPlantId(auth);
  if (!actorPlantId || !plantId || plantId !== actorPlantId) {
    forbidden('Plant scope violation');
  }
}
