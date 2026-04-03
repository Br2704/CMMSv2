import { z } from 'zod';

function toScalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

const optionalUuidQuery = z
  .preprocess((value) => {
    const scalar = toScalar(value);
    if (typeof scalar !== 'string') return undefined;
    const trimmed = scalar.trim();
    if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') return undefined;
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().uuid().optional());

export const listQuerySchema = z.object({
  page: z
    .preprocess((value) => toScalar(value), z.coerce.number().int().default(1))
    .catch(1)
    .transform((value) => Math.max(1, value)),
  limit: z
    .preprocess((value) => toScalar(value), z.coerce.number().int().default(100))
    .catch(100)
    .transform((value) => Math.min(1000, Math.max(1, value))),
  search: z.preprocess((value) => {
    const scalar = toScalar(value);
    if (typeof scalar !== 'string') return undefined;
    const trimmed = scalar.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().optional()),
  plantId: optionalUuidQuery,
  departmentId: optionalUuidQuery,
  moduleId: optionalUuidQuery,
  isActive: z
    .preprocess((value) => {
      const scalar = toScalar(value);
      if (typeof scalar === 'boolean') return scalar;
      if (typeof scalar === 'string') {
        const normalized = scalar.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      return undefined;
    }, z.boolean().optional()),
  includeInactive: z
    .preprocess((value) => {
      const scalar = toScalar(value);
      if (typeof scalar === 'boolean') return scalar;
      if (typeof scalar === 'string') {
        const normalized = scalar.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      return undefined;
    }, z.boolean().optional())
    .default(false),
  sort: z.preprocess((value) => {
    const scalar = toScalar(value);
    return typeof scalar === 'string' ? scalar.trim() : undefined;
  }, z.string().optional()),
}).passthrough();

export type ListQuery = z.infer<typeof listQuerySchema>;

export function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function parseListQuery(query: Record<string, unknown>) {
  const parsed = listQuerySchema.parse(query);

  const includeInactive =
    parsed.includeInactive === true ||
    (parsed.isActive !== undefined && parsed.isActive === false);

  return {
    ...parsed,
    includeInactive,
    search: parsed.search && parsed.search.length > 0 ? parsed.search : undefined,
  };
}

export const toPagination = buildPagination;
