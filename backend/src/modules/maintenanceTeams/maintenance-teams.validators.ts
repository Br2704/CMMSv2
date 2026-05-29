import { z } from 'zod';

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
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [toSnakeKey(key), item]);
  return Object.fromEntries(entries);
}

const optionalUuidOrNull = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  return value;
}, z.string().uuid().nullable());

const memberIdsSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value;
}, z.array(z.string().uuid()).default([]));

const createTeamBodySchema = z.object({
  plant_id: z.string().uuid().optional(),
  team_name: z.string().trim().min(1),
  discipline: z.string().trim().min(1),
  team_leader_id: optionalUuidOrNull,
  team_member_ids: memberIdsSchema,
  is_active: z.coerce.boolean().optional().default(true),
});

const updateTeamBodySchema = createTeamBodySchema.partial();

const createMappingBodySchema = z.object({
  plant_id: z.string().uuid().optional(),
  department_id: optionalUuidOrNull.optional(),
  category: z.string().trim().min(1),
  team_id: z.string().uuid(),
});

const updateMappingBodySchema = createMappingBodySchema.partial();

export const createMaintenanceTeamSchema = z.preprocess(normalizeObjectKeys, createTeamBodySchema);
export const updateMaintenanceTeamSchema = z.preprocess(normalizeObjectKeys, updateTeamBodySchema);
export const createWorkOrderTeamMappingSchema = z.preprocess(normalizeObjectKeys, createMappingBodySchema);
export const updateWorkOrderTeamMappingSchema = z.preprocess(normalizeObjectKeys, updateMappingBodySchema);
