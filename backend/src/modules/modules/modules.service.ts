import { Brackets } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { DepartmentEntity, MachineModuleEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { ok } from '../../utils/apiResponse';
import { buildPagination, type ListQuery } from '../../utils/pagination';
import { enforcePlantScope, resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { conflict, forbidden, notFound } from '../../utils/httpError';
import type { CreateModuleInput, UpdateModuleInput } from './modules.validators';
import { generateEntityCode } from '../../utils/codeGenerator';
import { audit } from '../../utils/audit';
import { cascadeDeleteRelatedRecords } from '../../utils/cascadeDelete';

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

    if (normalizedCode) {
      const qbCode = this.modulesRepo
        .createQueryBuilder('module')
        .where('module.plant_id = :plantId', { plantId: params.plantId })
        .andWhere('LOWER(TRIM(COALESCE(module.code, \'\'))) = :normalizedCode', { normalizedCode });
      if (params.excludeId) {
        qbCode.andWhere('module.id <> :excludeId', { excludeId: params.excludeId });
      }
      if (await qbCode.getOne()) {
        conflict('Module code already exists in this plant');
      }
    }

    if (normalizedName) {
      const qbName = this.modulesRepo
        .createQueryBuilder('module')
        .where('module.plant_id = :plantId', { plantId: params.plantId })
        .andWhere('module.department_id = :departmentId', { departmentId: params.departmentId })
        .andWhere('LOWER(TRIM(module.name)) = :normalizedName', { normalizedName });
      if (params.excludeId) {
        qbName.andWhere('module.id <> :excludeId', { excludeId: params.excludeId });
      }
      if (await qbName.getOne()) {
        conflict('Module name already exists in this department');
      }
    }
  }

  async create(input: CreateModuleInput, auth: AuthContext) {
    const scopedPlantId = resolveScopedPlantId(auth, input.plantId);
    if (!scopedPlantId) {
      conflict('plantId is required');
    }
    enforceAuthPlantScope(auth, scopedPlantId);
    const resolvedCode = input.code?.trim() || await generateEntityCode({
      tableName: 'machine_modules',
      codeColumn: 'code',
      typeCode: 'MOD',
      plantId: scopedPlantId,
      organizationId: auth.organizationId ?? null,
      scope: {
        plantColumn: 'plant_id',
        plantId: scopedPlantId,
      },
    });
    await this.validateDepartmentPlant(scopedPlantId, input.departmentId);
    await this.ensureUniqueModule({
      plantId: scopedPlantId,
      departmentId: input.departmentId,
      code: resolvedCode,
      name: input.name,
    });

    const created = this.modulesRepo.create({
      plantId: scopedPlantId,
      departmentId: input.departmentId,
      name: input.name.trim(),
      code: resolvedCode,
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
    const nextCode = input.code === undefined ? row.code : input.code?.trim() || row.code;
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

    const isAdminDeleter = auth.roles.some((role) => role === 'ROOT_ADMIN' || role === 'SUPER_ADMIN' || role === 'PLANT_ADMIN');
    if (isAdminDeleter) {
      await cascadeDeleteRelatedRecords({
        tableName: 'machine_modules',
        moduleName: 'modules',
        entityId: row.id,
        authUserId: auth.userId ?? null,
        authRoles: auth.roles,
        path: `/api/modules/${row.id}`,
        plantId: row.plantId,
      });
      await this.modulesRepo.delete({ id: row.id });
      await audit('modules.delete', {
        module: 'MODULES',
        actorUserId: auth.userId ?? null,
        entityName: 'machine_modules',
        entityId: row.id,
        method: 'DELETE',
        path: `/api/modules/${row.id}`,
        plantId: row.plantId,
        statusCode: 200,
        metadata: { hardDelete: true, cascade: true },
      });
      return ok({ id: row.id, deleted: true }, 'Module deleted permanently');
    }

    row.isActive = false;
    await this.modulesRepo.save(row);
    return ok({ id: row.id, deleted: true }, 'Module deactivated');
  }
}

export const modulesService = new ModulesService();
