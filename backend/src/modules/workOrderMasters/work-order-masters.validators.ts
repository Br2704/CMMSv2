import { z } from 'zod';
import { normalizeWorkOrderMasterCode, normalizeWorkOrderMasterOptionType } from './work-order-master.defaults';

function toSnakeKey(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

function normalizeObjectKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[toSnakeKey(key)] = item;
  }
  return result;
}

const nullableTrimmedString = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const optionTypeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return normalizeWorkOrderMasterOptionType(value);
}, z.enum(['CATEGORY', 'WO_TYPE', 'FAILURE_CODE']));

const optionCodeSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const normalized = normalizeWorkOrderMasterCode(value);
  return normalized.length > 0 ? normalized : undefined;
}, z.string().min(1).optional());

const createWorkOrderMasterBodySchema = z.object({
  plant_id: z.string().uuid().optional(),
  option_type: optionTypeSchema,
  code: optionCodeSchema,
  label: z.string().trim().min(1),
  description: nullableTrimmedString.optional(),
  sort_order: z.coerce.number().int().min(0).optional().default(0),
  is_active: z.coerce.boolean().optional().default(true),
});

const updateWorkOrderMasterBodySchema = createWorkOrderMasterBodySchema.partial();

export const createWorkOrderMasterSchema = z.preprocess(normalizeObjectKeys, createWorkOrderMasterBodySchema);
export const updateWorkOrderMasterSchema = z.preprocess(normalizeObjectKeys, updateWorkOrderMasterBodySchema);
