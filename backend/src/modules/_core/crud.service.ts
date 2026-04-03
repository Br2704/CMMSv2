import type { AuthContext } from '../../types/auth';
import { enforcePlantScope, resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import type { ListQuery } from '../../utils/pagination';
import { conflict, notFound } from '../../utils/httpError';
import { CrudRepository } from './crud.repository';
import type { GenericRecord, ListResult, ModuleConfig } from './crud.types';

export class CrudService {
  constructor(private readonly config: ModuleConfig, private readonly repository: CrudRepository) {}

  private isRelationProtectedDeleteError(error: unknown): boolean {
    if (typeof error !== 'object' || !error) {
      return false;
    }
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
    const driverError = 'driverError' in error ? (error as { driverError?: { code?: unknown } }).driverError : undefined;
    return code === '23503' || driverError?.code === '23503';
  }

  private resolvePlantValue(input: GenericRecord): string | null | undefined {
    const fromCamel = input.plantId as string | null | undefined;
    if (fromCamel !== undefined) {
      return fromCamel;
    }
    if (this.config.plantColumn) {
      return input[this.config.plantColumn] as string | null | undefined;
    }
    return undefined;
  }

  async list(query: ListQuery, auth: AuthContext): Promise<ListResult<GenericRecord>> {
    const scopedPlantIds = this.config.plantColumn ? resolvePlantFilter(auth, query.plantId) : null;
    return this.repository.list(query, scopedPlantIds);
  }

  async getById(id: string, auth: AuthContext): Promise<GenericRecord> {
    const row = await this.repository.getById(id);
    if (!row) {
      notFound(`${this.config.moduleName} record not found`);
    }
    if (this.config.plantColumn) {
      enforcePlantScope(auth, (row[this.config.plantColumn] as string | null | undefined) ?? null);
    }
    return row;
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    if (this.config.plantColumn) {
      const scopedPlantId = resolveScopedPlantId(auth, this.resolvePlantValue(input) ?? null);
      enforcePlantScope(auth, scopedPlantId);
      if (scopedPlantId !== null) {
        input.plantId = scopedPlantId;
        input[this.config.plantColumn] = scopedPlantId;
      }
    }
    return this.repository.create(input);
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const existing = await this.getById(id, auth);
    if (this.config.plantColumn) {
      const scopedPlantId = resolveScopedPlantId(
        auth,
        this.resolvePlantValue(input) ?? (existing[this.config.plantColumn] as string | null | undefined),
      );
      enforcePlantScope(auth, scopedPlantId);
      if (scopedPlantId !== null) {
        input.plantId = scopedPlantId;
        input[this.config.plantColumn] = scopedPlantId;
      }
    }

    const updated = await this.repository.update(id, input);
    if (!updated) {
      notFound(`${this.config.moduleName} record not found`);
    }
    return updated;
  }

  async remove(id: string, auth: AuthContext): Promise<void> {
    await this.getById(id, auth);
    if (auth.scopeType === 'ROOT_ADMIN') {
      try {
        await this.repository.hardDelete(id);
      } catch (error) {
        if (this.isRelationProtectedDeleteError(error)) {
          conflict(`${this.config.moduleName} cannot be deleted because related records still exist.`);
        }
        throw error;
      }
      return;
    }
    await this.repository.softDelete(id);
  }
}
