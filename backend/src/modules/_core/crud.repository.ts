import { randomUUID } from 'node:crypto';
import { AppDataSource } from '../../database/data-source';
import { badRequest } from '../../utils/httpError';
import type { ListQuery } from '../../utils/pagination';
import type { GenericRecord, ListResult, ModuleConfig } from './crud.types';

function parseSort(sort: string | undefined, sortColumns: string[] | undefined, fallback: { column: string; direction: 'ASC' | 'DESC' }) {
  if (!sort) return fallback;
  const [rawColumn, rawDirection] = sort.split(':');
  const direction: 'ASC' | 'DESC' = rawDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  if (!rawColumn || (sortColumns && !sortColumns.includes(rawColumn))) {
    return fallback;
  }
  return { column: rawColumn, direction };
}

export class CrudRepository {
  constructor(private readonly config: ModuleConfig) {}
  private readonly blockedPayloadColumns = new Set(['created_at', 'updated_at', 'deleted_at', 'version']);

  private toColumnKey(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([a-zA-Z])([0-9])/g, '$1_$2')
      .replace(/-/g, '_')
      .toLowerCase();
  }

  private getEntityMetadata() {
    return AppDataSource.entityMetadatas.find((metadata) => metadata.tableName === this.config.tableName) ?? null;
  }

  private isBlockedKey(key: string): boolean {
    return key === 'id' || this.blockedPayloadColumns.has(key) || this.blockedPayloadColumns.has(this.toColumnKey(key));
  }

  private resolvePayloadKey(key: string): string | null {
    const metadata = this.getEntityMetadata();
    const normalizedKey = this.toColumnKey(key);

    if (!metadata) {
      return normalizedKey;
    }

    const column = metadata.columns.find(
      (candidate) =>
        candidate.propertyName === key ||
        candidate.propertyName === normalizedKey ||
        candidate.databaseName === key ||
        candidate.databaseName === normalizedKey,
    );

    return column?.propertyName ?? null;
  }

  private normalizePayload(input: GenericRecord): GenericRecord {
    const normalized: GenericRecord = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) {
        continue;
      }
      const normalizedKey = this.resolvePayloadKey(key);
      if (!normalizedKey || this.isBlockedKey(normalizedKey)) {
        continue;
      }
      normalized[normalizedKey] = value;
    }
    return normalized;
  }

  private generateWorkOrderNumber(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `WO-${yyyy}${mm}${dd}-${rand}`;
  }

  async list(query: ListQuery, scopedPlantIds: string[] | null): Promise<ListResult<GenericRecord>> {
    const idColumn = this.config.idColumn ?? 'id';
    const sort = parseSort(query.sort, this.config.sortColumns, this.config.defaultSort ?? { column: idColumn, direction: 'DESC' });
    const qb = AppDataSource.createQueryBuilder().select('t.*').from(this.config.tableName, 't');

    if (query.search && this.config.searchColumns?.length) {
      qb.andWhere(
        this.config.searchColumns.map((column, i) => `LOWER(t.${column}) LIKE :search${i}`).join(' OR '),
        Object.fromEntries(this.config.searchColumns.map((_, i) => [`search${i}`, `%${query.search?.toLowerCase()}%`])),
      );
    }

    const plantColumn = this.config.plantColumn;
    if (plantColumn && scopedPlantIds) {
      if (scopedPlantIds.length === 0) {
        return { items: [], total: 0 };
      }
      qb.andWhere(`(t.${plantColumn} IN (:...plantIds) OR t.${plantColumn} IS NULL)`, { plantIds: scopedPlantIds });
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb.orderBy(`t.${sort.column}`, sort.direction).offset((query.page - 1) * query.limit).limit(query.limit);

    const [items, totalRaw] = await Promise.all([qb.getRawMany<GenericRecord>(), totalQb.getRawOne<{ count: string | number }>()]);
    return { items, total: Number(totalRaw?.count ?? 0) };
  }

  async getById(id: string): Promise<GenericRecord | null> {
    const idColumn = this.config.idColumn ?? 'id';
    const row = await AppDataSource.createQueryBuilder()
      .select('t.*')
      .from(this.config.tableName, 't')
      .where(`t.${idColumn} = :id`, { id })
      .getRawOne<GenericRecord>();
    return row ?? null;
  }

  async create(input: GenericRecord): Promise<GenericRecord> {
    const idColumn = this.config.idColumn ?? 'id';
    const payload = this.normalizePayload({ ...input });
    if (!payload[idColumn]) {
      payload[idColumn] = randomUUID();
    }

    if (this.config.tableName === 'work_orders') {
      const woNumber =
        typeof payload.woNumber === 'string'
          ? payload.woNumber.trim()
          : typeof payload.wo_number === 'string'
            ? payload.wo_number.trim()
            : '';
      if (!woNumber) {
        payload.woNumber = this.generateWorkOrderNumber();
      }

      const missingFields = [
        { key: 'assetId', fallbackKey: 'asset_id', label: 'asset_id' },
        { key: 'category', fallbackKey: null, label: 'category' },
        { key: 'problemDescription', fallbackKey: 'problem_description', label: 'problem_description' },
      ].filter((field) => {
        const value = payload[field.key] ?? (field.fallbackKey ? payload[field.fallbackKey] : undefined);
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        return false;
      }).map((field) => field.label);

      if (missingFields.length > 0) {
        badRequest('Validation failed for work order creation', {
          missingFields,
        });
      }
    }

    await AppDataSource.createQueryBuilder().insert().into(this.config.tableName).values(payload).execute();
    return (await this.getById(String(payload[idColumn]))) as GenericRecord;
  }

  async update(id: string, input: GenericRecord): Promise<GenericRecord | null> {
    const idColumn = this.config.idColumn ?? 'id';
    const payload = this.normalizePayload(input);
    if (Object.keys(payload).length === 0) {
      return this.getById(id);
    }
    await AppDataSource.createQueryBuilder().update(this.config.tableName).set(payload).where(`${idColumn} = :id`, { id }).execute();
    return this.getById(id);
  }

  async softDelete(id: string): Promise<boolean> {
    const idColumn = this.config.idColumn ?? 'id';
    try {
      await AppDataSource.createQueryBuilder()
        .update(this.config.tableName)
        .set({ is_active: false } as never)
        .where(`${idColumn} = :id`, { id })
        .execute();
      return true;
    } catch {
      try {
        await AppDataSource.createQueryBuilder()
          .update(this.config.tableName)
          .set({ deleted_at: new Date() } as never)
          .where(`${idColumn} = :id`, { id })
          .execute();
        return true;
      } catch {
        await AppDataSource.createQueryBuilder().delete().from(this.config.tableName).where(`${idColumn} = :id`, { id }).execute();
        return true;
      }
    }
  }

  async hardDelete(id: string): Promise<boolean> {
    const idColumn = this.config.idColumn ?? 'id';
    await AppDataSource.createQueryBuilder().delete().from(this.config.tableName).where(`${idColumn} = :id`, { id }).execute();
    return true;
  }
}
