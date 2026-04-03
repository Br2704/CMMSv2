import { z } from 'zod';

const optionalNullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().uuid().optional());

export const createShiftSchema = z.object({
  shiftName: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  plantId: optionalNullableUuid,
  isActive: z.boolean().default(true),
});

export const updateShiftSchema = createShiftSchema.partial();
