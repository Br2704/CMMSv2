
import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  plantId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();
