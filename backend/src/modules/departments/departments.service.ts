import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { DepartmentEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import type { ListQuery } from '../../utils/pagination';
import { enforcePlantScope, resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { conflict, forbidden, notFound } from '../../utils/httpError';

function enforceAuthPlantScope(auth: AuthContext, plantId: string | null | undefined) {
  try {
    enforcePlantScope(auth, plantId);
  } catch {
    forbidden('Plant access denied');
  }
}

function normalizeDuplicateValue(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export class DepartmentsService {
  private departmentsRepo = AppDataSource.getRepository(DepartmentEntity);

  async list(query: ListQuery & { includeInactive?: boolean; isActive?: boolean }, auth: AuthContext) {
    const qb = this.departmentsRepo.createQueryBuilder('department');
    applySearch(qb, 'department', query.search, ['code', 'name']);
    applyPlantScope(qb, 'department', 'plant_id', auth, query.plantId);

    if (query.isActive !== undefined) {
      qb.andWhere('department.is_active = :active', { active: query.isActive });
    } else if (!query.includeInactive) {
      qb.andWhere('department.is_active = :active', { active: true });
    }

    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('department.created_at', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getById(id: string, auth: AuthContext) {
    const department = await this.departmentsRepo.findOneBy({ id });
    if (!department) {
      notFound('Department not found');
    }
    enforceAuthPlantScope(auth, department.plantId);
    return department;
  }

  private async validateParentDepartment(plantId: string, parentId: string | null | undefined, currentDepartmentId?: string) {
    if (!parentId) return;
    if (currentDepartmentId && parentId === currentDepartmentId) {
      conflict('Department cannot be its own parent');
    }

    const parent = await this.departmentsRepo.findOneBy({ id: parentId });
    if (!parent) {
      notFound('Parent department not found');
    }
    if (parent.plantId !== plantId) {
      conflict('Parent department does not belong to selected plant');
    }
  }

  private async ensureUniqueDepartment(params: {
    plantId: string;
    code: string;
    name: string;
    excludeId?: string;
  }) {
    const normalizedCode = normalizeDuplicateValue(params.code);
    const normalizedName = normalizeDuplicateValue(params.name);
    const qb = this.departmentsRepo
      .createQueryBuilder('department')
      .where('department.plant_id = :plantId', { plantId: params.plantId });

    if (params.excludeId) {
      qb.andWhere('department.id <> :excludeId', { excludeId: params.excludeId });
    }

    qb.andWhere(
      new Brackets((where) => {
        let hasClause = false;

        if (normalizedCode) {
          where.where('LOWER(TRIM(department.code)) = :normalizedCode', { normalizedCode });
          hasClause = true;
        }

        if (normalizedName) {
          if (hasClause) {
            where.orWhere('LOWER(TRIM(department.name)) = :normalizedName', { normalizedName });
          } else {
            where.where('LOWER(TRIM(department.name)) = :normalizedName', { normalizedName });
          }
        }
      }),
    );

    const duplicate = await qb.getOne();
    if (duplicate) {
      conflict('Department code or name already exists in this plant');
    }
  }

  async create(input: { plantId: string; code: string; name: string; parentId?: string | null; isActive?: boolean }, auth: AuthContext) {
    const scopedPlantId = resolveScopedPlantId(auth, input.plantId);
    if (!scopedPlantId) {
      conflict('plantId is required');
    }

    enforceAuthPlantScope(auth, scopedPlantId);
    await this.validateParentDepartment(scopedPlantId, input.parentId ?? null);
    await this.ensureUniqueDepartment({
      plantId: scopedPlantId,
      code: input.code,
      name: input.name,
    });

    const created = this.departmentsRepo.create({
      plantId: scopedPlantId,
      code: input.code.trim(),
      name: input.name.trim(),
      parentId: input.parentId ?? null,
      isActive: input.isActive ?? true,
    });

    await this.departmentsRepo.save(created);
    return created;
  }

  async update(
    id: string,
    input: Partial<{ plantId: string; code: string; name: string; parentId: string | null; isActive: boolean }>,
    auth: AuthContext,
  ) {
    const department = await this.getById(id, auth);
    const nextPlantId = resolveScopedPlantId(auth, input.plantId ?? department.plantId);
    if (!nextPlantId) {
      conflict('plantId is required');
    }

    enforceAuthPlantScope(auth, nextPlantId);
    const nextCode = typeof input.code === 'string' ? input.code.trim() : department.code;
    const nextName = typeof input.name === 'string' ? input.name.trim() : department.name;
    const nextParentId = input.parentId === undefined ? department.parentId : input.parentId;

    await this.validateParentDepartment(nextPlantId, nextParentId, department.id);
    await this.ensureUniqueDepartment({
      plantId: nextPlantId,
      code: nextCode,
      name: nextName,
      excludeId: department.id,
    });

    Object.assign(department, {
      plantId: nextPlantId,
      code: nextCode,
      name: nextName,
      parentId: nextParentId ?? null,
      isActive: input.isActive ?? department.isActive,
    });

    await this.departmentsRepo.save(department);
    return department;
  }

  private isRelationProtectedDeleteError(error: unknown): boolean {
    if (typeof error !== 'object' || !error) {
      return false;
    }
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
    const driverError = 'driverError' in error ? (error as { driverError?: { code?: unknown } }).driverError : undefined;
    return code === '23503' || driverError?.code === '23503';
  }

  async remove(id: string, auth: AuthContext) {
    const department = await this.getById(id, auth);

    if (auth.scopeType === 'ROOT_ADMIN') {
      try {
        await this.departmentsRepo.delete({ id: department.id });
      } catch (error) {
        if (this.isRelationProtectedDeleteError(error)) {
          conflict('Department cannot be deleted because related records still exist.');
        }
        throw error;
      }
      return;
    }

    department.isActive = false;
    await this.departmentsRepo.save(department);
  }
}

export const departmentsService = new DepartmentsService();
