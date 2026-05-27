
import { z } from 'zod';

const optionalNullableString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalNullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().uuid().optional());

export const createPlantSchema = z.object({
  plantCode: z.string().trim().min(1).optional(),
  plantName: z.string().min(1),
  location: optionalNullableString,
  plantAdminId: optionalNullableUuid,
  organizationId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

export const updatePlantSchema = createPlantSchema.partial();
