import { AppDataSource } from '../../database/data-source';
import { DepartmentEntity, MaintenanceTeamEntity, WorkOrderTeamMappingEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest, notFound } from '../../utils/httpError';
import { resolvePlantFilter } from '../../utils/plantScope';
import type { ListQuery } from '../../utils/pagination';
import type { GenericRecord } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { workOrderTeamMappingsRepository } from './work-order-team-mappings.repository';

function normalizeCategory(value: string): string {
  return value
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

class WorkOrderTeamMappingsService extends CrudService {
  private readonly departmentsRepo = AppDataSource.getRepository(DepartmentEntity);
  private readonly teamsRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
  private readonly mappingsRepo = AppDataSource.getRepository(WorkOrderTeamMappingEntity);

  constructor() {
    super(
      {
        moduleName: 'workOrderTeamMappings',
        moduleId: 'MASTERS',
        basePath: '/api/work-order-team-mappings',
        tableName: 'work_order_team_mappings',
        plantColumn: 'plant_id',
      },
      workOrderTeamMappingsRepository,
    );
  }

  private async validateTeamForPlant(plantId: string, teamId: string): Promise<void> {
    const team = await this.teamsRepo.findOne({
      where: { id: teamId, plantId, isActive: true },
      select: ['id'],
    });
    if (!team) {
      badRequest('Selected team is invalid for the chosen plant');
    }
  }

  private async validateDepartmentForPlant(plantId: string, departmentId: string | null): Promise<void> {
    if (!departmentId) {
      return;
    }
    const department = await this.departmentsRepo.findOne({
      where: { id: departmentId, plantId, isActive: true },
      select: ['id'],
    });
    if (!department) {
      badRequest('Selected department is invalid for the chosen plant');
    }
  }

  async list(query: ListQuery, auth: AuthContext) {
    const scopedPlantIds = resolvePlantFilter(auth, query.plantId);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit ?? 100) || 100));
    const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
    const departmentId = typeof query.departmentId === 'string' ? query.departmentId : undefined;
    const qb = AppDataSource.createQueryBuilder().select('t.*').from('work_order_team_mappings', 't');

    if (scopedPlantIds) {
      if (scopedPlantIds.length === 0) {
        return { items: [], total: 0 };
      }
      qb.andWhere('t.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }

    if (departmentId) {
      qb.andWhere('t.department_id = :departmentId', { departmentId });
    }

    if (search) {
      qb.andWhere('LOWER(t.category) LIKE :search', { search: `%${search}%` });
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb.orderBy('t.category', 'ASC').addOrderBy('t.created_at', 'DESC').offset((page - 1) * limit).limit(limit);

    const [items, totalRaw] = await Promise.all([
      qb.getRawMany<GenericRecord>(),
      totalQb.getRawOne<{ count: string | number }>(),
    ]);

    return { items, total: Number(totalRaw?.count ?? 0) };
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const plantId = (input.plant_id ?? input.plantId) as string | undefined;
    const departmentId = (input.department_id ?? input.departmentId ?? null) as string | null;
    const teamId = (input.team_id ?? input.teamId) as string | undefined;
    const category = String(input.category ?? '');

    if (!plantId || !teamId || !category.trim()) {
      badRequest('plant_id, category and team_id are required');
    }

    await this.validateDepartmentForPlant(plantId, departmentId);
    await this.validateTeamForPlant(plantId, teamId);
    return super.create(
      {
        ...input,
        department_id: departmentId,
        category: normalizeCategory(category),
      },
      auth,
    );
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const existing = await this.mappingsRepo.findOne({
      where: { id },
      select: ['id', 'plantId', 'departmentId', 'teamId', 'category'],
    });
    if (!existing) {
      notFound('work order team mapping record not found');
    }

    const plantId = String(input.plant_id ?? input.plantId ?? existing.plantId);
    const departmentId = (input.department_id ?? input.departmentId ?? existing.departmentId ?? null) as string | null;
    const teamId = String(input.team_id ?? input.teamId ?? existing.teamId);
    const category = String(input.category ?? existing.category);

    await this.validateDepartmentForPlant(plantId, departmentId);
    await this.validateTeamForPlant(plantId, teamId);
    return super.update(
      id,
      {
        ...input,
        department_id: departmentId,
        category: normalizeCategory(category),
      },
      auth,
    );
  }
}

export const workOrderTeamMappingsService = new WorkOrderTeamMappingsService();
