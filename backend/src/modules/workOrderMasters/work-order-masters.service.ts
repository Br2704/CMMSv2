import { AppDataSource } from '../../database/data-source';
import { WorkOrderMasterEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest } from '../../utils/httpError';
import { enforcePlantScope, resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import type { ListQuery } from '../../utils/pagination';
import type { GenericRecord, ListResult } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { ensureDefaultWorkOrderMasters } from './work-order-master.helpers';
import { normalizeWorkOrderMasterCode, normalizeWorkOrderMasterOptionType } from './work-order-master.defaults';
import { workOrderMastersRepository } from './work-order-masters.repository';

class WorkOrderMastersService extends CrudService {
  private readonly mastersRepo = AppDataSource.getRepository(WorkOrderMasterEntity);

  constructor() {
    super(
      {
        moduleName: 'workOrderMasters',
        moduleId: 'MASTERS',
        basePath: '/api/work-order-masters',
        tableName: 'work_order_masters',
        plantColumn: 'plant_id',
      },
      workOrderMastersRepository,
    );
  }

  async list(query: ListQuery, auth: AuthContext): Promise<ListResult<GenericRecord>> {
    const extendedQuery = query as ListQuery & { optionType?: string; option_type?: string; type?: string };
    const scopedPlantIds = resolvePlantFilter(auth, query.plantId);
    const targetPlantIds = scopedPlantIds ?? [];
    if (targetPlantIds.length === 1) {
      await ensureDefaultWorkOrderMasters(targetPlantIds);
    }

    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit ?? 100) || 100));
    const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
    const optionTypeRaw =
      typeof extendedQuery.optionType === 'string'
        ? extendedQuery.optionType
        : typeof extendedQuery.option_type === 'string'
          ? extendedQuery.option_type
          : typeof extendedQuery.type === 'string'
            ? extendedQuery.type
            : '';
    const includeInactive = query.includeInactive === true || query.isActive === false;

    const qb = AppDataSource.createQueryBuilder().select('t.*').from('work_order_masters', 't');

    if (targetPlantIds) {
      if (targetPlantIds.length === 0) {
        return { items: [], total: 0 };
      }
      qb.andWhere('t.plant_id IN (:...plantIds)', { plantIds: targetPlantIds });
    }

    if (search) {
      qb.andWhere('(LOWER(t.code) LIKE :search OR LOWER(t.label) LIKE :search OR LOWER(COALESCE(t.description, \'\')) LIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (optionTypeRaw) {
      qb.andWhere('t.option_type = :optionType', {
        optionType: normalizeWorkOrderMasterOptionType(optionTypeRaw),
      });
    }

    if (!includeInactive) {
      qb.andWhere('t.is_active = true');
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb
      .orderBy('t.option_type', 'ASC')
      .addOrderBy('t.sort_order', 'ASC')
      .addOrderBy('t.label', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    const [items, totalRaw] = await Promise.all([
      qb.getRawMany<GenericRecord>(),
      totalQb.getRawOne<{ count: string | number }>(),
    ]);

    return { items, total: Number(totalRaw?.count ?? 0) };
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const plantId = resolveScopedPlantId(auth, (input.plant_id ?? input.plantId ?? null) as string | null);
    if (!plantId) {
      badRequest('plant_id is required');
    }

    const optionType = normalizeWorkOrderMasterOptionType(String(input.option_type ?? input.optionType ?? 'CATEGORY'));
    const label = String(input.label ?? '').trim();
    const code = normalizeWorkOrderMasterCode(String(input.code ?? label));

    if (!label) {
      badRequest('label is required');
    }
    if (!code) {
      badRequest('code is required');
    }

    await ensureDefaultWorkOrderMasters([plantId]);
    return super.create(
      {
        ...input,
        plant_id: plantId,
        plantId,
        option_type: optionType,
        code,
        label,
      },
      auth,
    );
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const existing = await this.mastersRepo.findOne({
      where: { id },
      select: ['id', 'plantId', 'optionType', 'code', 'label'],
    });
    if (!existing) {
      badRequest('work order master record not found');
    }

    const plantId = resolveScopedPlantId(
      auth,
      (input.plant_id ?? input.plantId ?? existing.plantId ?? null) as string | null,
    );
    enforcePlantScope(auth, plantId);

    const optionType = normalizeWorkOrderMasterOptionType(
      String(input.option_type ?? input.optionType ?? existing.optionType),
    );
    const label = String(input.label ?? existing.label).trim();
    const code = normalizeWorkOrderMasterCode(String(input.code ?? label ?? existing.code));

    if (!label) {
      badRequest('label is required');
    }
    if (!code) {
      badRequest('code is required');
    }

    return super.update(
      id,
      {
        ...input,
        plant_id: plantId,
        plantId,
        option_type: optionType,
        code,
        label,
      },
      auth,
    );
  }
}

export const workOrderMastersService = new WorkOrderMastersService();
