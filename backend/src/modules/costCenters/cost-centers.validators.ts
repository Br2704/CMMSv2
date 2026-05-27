import { z } from 'zod';

const optionalNullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().uuid().optional());

export const createCostCenterSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().min(1),
  departmentId: optionalNullableUuid,
  plantId: optionalNullableUuid,
  isActive: z.boolean().default(true),
});

export const updateCostCenterSchema = createCostCenterSchema.partial();
