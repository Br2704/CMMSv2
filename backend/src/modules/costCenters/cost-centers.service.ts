import { CrudService } from '../_core/crud.service';
import { costCentersRepository } from './cost-centers.repository';
import type { AuthContext } from '../../types/auth';
import type { GenericRecord } from '../_core/crud.types';
import { conflict } from '../../utils/httpError';
import { ensureUniqueCode } from '../../utils/codeGenerator';

class CostCentersService extends CrudService {
  private async ensureUniqueName(name: string, plantId: string | null, excludeId?: string) {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    const exists = await ensureUniqueCode({
      tableName: 'cost_centers',
      codeColumn: 'name',
      code: normalizedName,
      scope: {
        plantColumn: 'plant_id',
        plantId,
      },
      excludeId,
    });

    if (exists) {
      conflict('Cost center name already exists');
    }
  }

  override async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    if (typeof input.name === 'string') {
      const plantId = (input.plantId as string | null | undefined) ?? null;
      await this.ensureUniqueName(input.name, plantId);
    }
    return super.create(input, auth);
  }

  override async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    if (typeof input.name === 'string') {
      const plantId = (input.plantId as string | null | undefined) ?? null;
      await this.ensureUniqueName(input.name, plantId, id);
    }
    return super.update(id, input, auth);
  }
}

export const costCentersService = new CostCentersService(
  {
    moduleName: 'costCenters',
    moduleId: 'MASTERS',
    basePath: '/api/cost-centers',
    tableName: 'cost_centers',
    plantColumn: 'plant_id',
    codeColumn: 'code',
    codeType: 'CC',
    uniqueCodeMessage: 'Cost center code already exists',
  },
  costCentersRepository,
);
