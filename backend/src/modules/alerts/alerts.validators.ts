
import { z } from 'zod';

export const createAlertConfigSchema = z.object({
  plantId: z.string().uuid().nullable().optional(),
  assetType: z.string().trim().min(1).nullable().optional(),
  metricKey: z.string().trim().min(1),
  thresholdValue: z.union([z.coerce.number(), z.string().trim().min(1)]).transform((value) => String(value)),
  comparisonType: z.enum(['>', '<', '>=', '<=']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  notifyRoles: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().default(true),
});

export const updateAlertConfigSchema = createAlertConfigSchema.partial();
