import { z } from 'zod';

const MAX_DATE_RANGE_DAYS = 365;

function toScalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' },
);

const dateRangeSchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
}).refine(
  (data) => {
    const from = new Date(data.from);
    const to = new Date(data.to);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= MAX_DATE_RANGE_DAYS;
  },
  { message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days` },
).optional();

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
  dateRange: dateRangeSchema,
}).strict();

export type ListQuery = z.infer<typeof listQuerySchema>;

export function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function parseListQuery(query: Record<string, unknown>): z.infer<typeof listQuerySchema> & { includeInactive: boolean } {
  const parsed = listQuerySchema.safeParse(query);

  if (!parsed.success) {
    return {
      page: 1,
      limit: 50,
      search: undefined,
      plantId: undefined,
      departmentId: undefined,
      moduleId: undefined,
      isActive: undefined,
      includeInactive: false,
      sort: undefined,
      dateRange: undefined,
    };
  }

  const includeInactive =
    parsed.data.includeInactive === true ||
    (parsed.data.isActive !== undefined && parsed.data.isActive === false);

  return {
    ...parsed.data,
    includeInactive,
    search: parsed.data.search && parsed.data.search.length > 0 ? parsed.data.search : undefined,
  };
}

export const toPagination = buildPagination;
