import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination';

export const idParamSchema = z.object({ id: z.string().uuid() });

export const genericCreateSchema = z.object({
  plantId: z.string().uuid().optional().nullable(),
}).strict();

export const genericUpdateSchema = genericCreateSchema.partial().strict();

export { listQuerySchema };
