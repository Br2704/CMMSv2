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

  async create(input: CreateModuleInput, auth: AuthContext) {
    const scopedPlantId = resolveScopedPlantId(auth, input.plantId);
    if (!scopedPlantId) {
      conflict('plantId is required');
    }
    enforceAuthPlantScope(auth, scopedPlantId);
    await this.validateDepartmentPlant(scopedPlantId, input.departmentId);

    const created = this.modulesRepo.create({
      plantId: scopedPlantId,
      departmentId: input.departmentId,
      name: input.name,
      code: input.code ?? null,
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

    Object.assign(row, {
      ...input,
      plantId: nextPlantId,
      departmentId: nextDepartmentId,
      code: input.code === undefined ? row.code : input.code,
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

    if (auth.scopeType === 'ROOT_ADMIN') {
      await this.modulesRepo.delete({ id: row.id });
      return ok({ id: row.id, deleted: true }, 'Module deleted permanently');
    }

    row.isActive = false;
    await this.modulesRepo.save(row);
    return ok({ id: row.id, deleted: true }, 'Module deactivated');
  }
}

export const modulesService = new ModulesService();
