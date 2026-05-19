import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { resolvePlantFilter } from './plantScope';

export type ListQuery = {
  page: number;
  limit: number;
  search?: string;
  plantId?: string;
};

export function parseList(query: Record<string, unknown>): ListQuery {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
  const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;
  const plantId = typeof query.plantId === 'string' ? query.plantId : undefined;
  return { page, limit, search, plantId };
}

export function applySearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  search: string | undefined,
  columns: string[],
) {
  if (!search || columns.length === 0) {
    return;
  }
  const term = `%${search.toLowerCase()}%`;
  const clauses = columns.map((column, index) => `LOWER(${alias}.${column}) LIKE :search${index}`);
  const params = Object.fromEntries(columns.map((_, index) => [`search${index}`, term]));
  qb.andWhere(`(${clauses.join(' OR ')})`, params);
}

export function applyPlantScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  property: string,
  auth: Express.AuthContext,
  requestedPlantId?: string,
) {
  const scoped = resolvePlantFilter(auth, requestedPlantId);
  if (scoped === null) {
    return;
  }
  if (scoped.length === 0) {
    qb.andWhere('1=0');
    return;
  }
  qb.andWhere(`(${alias}.${property} IN (:...plantIds) OR ${alias}.${property} IS NULL)`, { plantIds: scoped });
}
