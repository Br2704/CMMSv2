import { z } from 'zod';
import { genericCreateSchema, genericUpdateSchema } from '../_core/crud.validators';

export const createPMScheduleSchema = z.record(z.any());
export const updatePMScheduleSchema = z.record(z.any());
