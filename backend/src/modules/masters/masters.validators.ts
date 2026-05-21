import { z } from 'zod';
import { genericCreateSchema } from '../_core/crud.validators';

const optionalTrimmedString = z.preprocess((value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const nullableTrimmedString = z.preprocess((value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const masterBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  code: optionalTrimmedString,
  description: nullableTrimmedString,
  category: optionalTrimmedString,
  type: optionalTrimmedString,
  sort_order: z.coerce.number().int().min(0).optional(),
  is_active: z.coerce.boolean().optional(),
  plant_id: genericCreateSchema.shape.plantId,
});

export const createMasterSchema = masterBodySchema;
export const updateMasterSchema = masterBodySchema.partial();
