import type { Repository } from 'typeorm';
import { RoleEntity } from '../database/entities';
import { normalizeRoleName } from './rbac';

type RoleCatalogRepo = Pick<Repository<RoleEntity>, 'findOneBy' | 'create' | 'save'>;

export async function ensureRoleCatalogEntry(
  roleRepo: RoleCatalogRepo,
  roleName: string,
  options?: {
    description?: string | null;
    isSystem?: boolean;
  },
) {
  const normalizedRole = normalizeRoleName(roleName);
  const description = options?.description?.trim() || null;
  const existing = await roleRepo.findOneBy({ name: normalizedRole });

  if (existing) {
    let dirty = false;
    if (!existing.isActive) {
      existing.isActive = true;
      dirty = true;
    }
    if (description !== null && existing.description !== description) {
      existing.description = description;
      dirty = true;
    }
    if (options?.isSystem && !existing.isSystem) {
      existing.isSystem = true;
      dirty = true;
    }
    if (dirty) {
      return roleRepo.save(existing);
    }
    return existing;
  }

  const created = roleRepo.create({
    name: normalizedRole,
    description,
    isSystem: Boolean(options?.isSystem),
    isActive: true,
  });
  return roleRepo.save(created);
}
