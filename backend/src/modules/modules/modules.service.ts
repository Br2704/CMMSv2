import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, DepartmentEntity, MachineModuleEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { ok } from '../../utils/apiResponse';
import { buildPagination, type ListQuery } from '../../utils/pagination';
import { enforcePlantScope, resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { conflict, forbidden, notFound } from '../../utils/httpError';
import type { CreateModuleInput, UpdateModuleInput } from './modules.validators';

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

export class ModulesService {
  private modulesRepo = AppDataSource.getRepository(MachineModuleEntity);
  private departmentsRepo = AppDataSource.getRepository(DepartmentEntity);
  private assetsRepo = AppDataSource.getRepository(AssetEntity);

  async list(query: ListQuery, auth: AuthContext) {
    const qb = this.modulesRepo.createQueryBuilder('module');
    applySearch(qb, 'module', query.search, ['code', 'name', 'description']);
    applyPlantScope(qb, 'module', 'plant_id', auth, query.plantId);

    if (query.departmentId) {
      qb.andWhere('module.department_id = :departmentId', { departmentId: query.departmentId });
    }
    if (!query.includeInactive) {
      qb.andWhere('module.is_active = :active', { active: true });
    }

    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('module.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return ok(data, 'Modules fetched', buildPagination(query.page, query.limit, total));
  }

  private async validateDepartmentPlant(plantId: string, departmentId: string) {
    const department = await this.departmentsRepo.findOneBy({ id: departmentId });
    if (!department) {
      notFound('Department not found');
    }
    if (department.plantId !== plantId) {
      conflict('Department does not belong to selected plant');
    }
  }

  private async ensureUniqueModule(params: {
    plantId: string;
    departmentId: string;
    code: string | null | undefined;
    name: string;
    excludeId?: string;
  }) {
    const normalizedCode = normalizeDuplicateValue(params.code);
    const normalizedName = normalizeDuplicateValue(params.name);
    const qb = this.modulesRepo
      .createQueryBuilder('module')
      .where('module.plant_id = :plantId', { plantId: params.plantId })
      .andWhere('module.department_id = :departmentId', { departmentId: params.departmentId });

    if (params.excludeId) {
      qb.andWhere('module.id <> :excludeId', { excludeId: params.excludeId });
    }

    qb.andWhere(
      new Brackets((where) => {
        let hasClause = false;

        if (normalizedCode) {
          where.where('LOWER(TRIM(COALESCE(module.code, \'\'))) = :normalizedCode', { normalizedCode });
          hasClause = true;
        }

        if (normalizedName) {
          if (hasClause) {
            where.orWhere('LOWER(TRIM(module.name)) = :normalizedName', { normalizedName });
          } else {
            where.where('LOWER(TRIM(module.name)) = :normalizedName', { normalizedName });
          }
        }
      }),
    );

    const duplicate = await qb.getOne();
    if (duplicate) {
      conflict('Module code or name already exists in this department');
    }
  }

  async create(input: CreateModuleInput, auth: AuthContext) {
    const scopedPlantId = resolveScopedPlantId(auth, input.plantId);
    if (!scopedPlantId) {
      conflict('plantId is required');
    }
    enforceAuthPlantScope(auth, scopedPlantId);
    await this.validateDepartmentPlant(scopedPlantId, input.departmentId);
    await this.ensureUniqueModule({
      plantId: scopedPlantId,
      departmentId: input.departmentId,
      code: input.code,
      name: input.name,
    });

    const created = this.modulesRepo.create({
      plantId: scopedPlantId,
      departmentId: input.departmentId,
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    });
    await this.modulesRepo.save(created);
    return ok(created, 'Module created');
  }

  async update(id: string, input: UpdateModuleInput, auth: AuthContext) {
    const row = await this.modulesRepo.findOneBy({ id });
    if (!row) {
      notFound('Module not found');
    }

    const nextPlantId = resolveScopedPlantId(auth, input.plantId ?? row.plantId);
    const nextDepartmentId = input.departmentId ?? row.departmentId;
    if (!nextPlantId || !nextDepartmentId) {
      conflict('plantId and departmentId are required');
    }

    enforceAuthPlantScope(auth, nextPlantId);
    await this.validateDepartmentPlant(nextPlantId, nextDepartmentId);
    const nextCode = input.code === undefined ? row.code : input.code?.trim() || null;
    const nextName = input.name === undefined ? row.name : input.name.trim();
    await this.ensureUniqueModule({
      plantId: nextPlantId,
      departmentId: nextDepartmentId,
      code: nextCode,
      name: nextName,
      excludeId: row.id,
    });

    Object.assign(row, {
      ...input,
      plantId: nextPlantId,
      departmentId: nextDepartmentId,
      name: nextName,
      code: nextCode,
      description: input.description === undefined ? row.description : input.description,
    });
    await this.modulesRepo.save(row);
    return ok(row, 'Module updated');
  }

  async remove(id: string, auth: AuthContext) {
    const row = await this.modulesRepo.findOneBy({ id });
    if (!row) {
      notFound('Module not found');
    }
    enforceAuthPlantScope(auth, row.plantId);

    const linkedAssets = await this.assetsRepo.count({ where: { moduleId: row.id, isActive: true } });
    if (linkedAssets > 0) {
      conflict('Module cannot be deleted because active machines exist. Disable machines or reassign first.');
    }

    const isAdminDeleter = auth.roles.some((role) => role === 'ROOT_ADMIN' || role === 'SUPERADMIN' || role === 'ADMIN');
    if (isAdminDeleter) {
      await this.modulesRepo.delete({ id: row.id });
      return ok({ id: row.id, deleted: true }, 'Module deleted permanently');
    }

    row.isActive = false;
    await this.modulesRepo.save(row);
    return ok({ id: row.id, deleted: true }, 'Module deactivated');
  }
}

export const modulesService = new ModulesService();
