import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination';

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

export const moduleListQuerySchema = listQuerySchema;

export const moduleIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createModuleSchema = z.object({
  plantId: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string().trim().min(1),
  code: optionalText.optional(),
  description: optionalText.optional(),
  isActive: z.boolean().default(true),
});

export const updateModuleSchema = createModuleSchema.partial();

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
