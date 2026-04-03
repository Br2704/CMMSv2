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
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[toSnakeKey(key)] = item;
  }
  return result;
}

function generateWorkOrderNumber(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WO-${yyyy}${mm}${dd}-${rand}`;
}

const optionalTrimmedString = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const nullableTrimmedString = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const optionalUuidOrNull = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  return value;
}, z.string().uuid().nullable());

const optionalIsoDateTimeOrNull = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().datetime({ offset: true }).nullable());

const spareConsumptionEntrySchema = z
  .preprocess(normalizeObjectKeys, z.object({
    spare_item_id: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
    spare_name: nullableTrimmedString.optional(),
    spare_code: nullableTrimmedString.optional(),
  }));

const spareConsumptionSchema = z.array(spareConsumptionEntrySchema).optional();

const mobileAttachmentSchema = z.preprocess(
  normalizeObjectKeys,
  z.object({
    name: optionalTrimmedString,
    mime_type: optionalTrimmedString,
    data_url: optionalTrimmedString,
    captured_at: optionalIsoDateTimeOrNull.optional(),
  }),
);

const voiceNoteSchema = z.preprocess(
  normalizeObjectKeys,
  z.object({
    name: optionalTrimmedString,
    duration_seconds: z.coerce.number().min(0).optional(),
    data_url: optionalTrimmedString,
    captured_at: optionalIsoDateTimeOrNull.optional(),
  }),
);

const safetyChecklistSchema = z.preprocess(
  normalizeObjectKeys,
  z.object({
    ppe_worn: z.coerce.boolean().optional(),
    machine_isolated: z.coerce.boolean().optional(),
    safety_lock_applied: z.coerce.boolean().optional(),
    confirmed_at: optionalIsoDateTimeOrNull.optional(),
    notes: nullableTrimmedString.optional(),
  }),
);

const workOrderBodyBaseSchema = z.object({
    wo_number: optionalTrimmedString,
    asset_id: z.string().uuid(),
    category: z.string().trim().min(1),
    priority: optionalTrimmedString.default('MEDIUM'),
    status: optionalTrimmedString.default('RAISED'),
    problem_description: z.string().trim().min(1),
    raised_by: optionalUuidOrNull.optional(),
    assigned_to: optionalUuidOrNull.optional(),
    opened_at: optionalIsoDateTimeOrNull.optional(),
    closed_at: optionalIsoDateTimeOrNull.optional(),
    started_at: optionalIsoDateTimeOrNull.optional(),
    resolved_at: optionalIsoDateTimeOrNull.optional(),
    downtime_start_at: optionalIsoDateTimeOrNull.optional(),
    downtime_end_at: optionalIsoDateTimeOrNull.optional(),
    is_failure_event: z.coerce.boolean().optional(),
    root_cause: nullableTrimmedString.optional(),
    action_taken: nullableTrimmedString.optional(),
    downtime_minutes: z.coerce.number().int().min(0).optional(),
    operator_fault: z.coerce.boolean().optional(),
    remarks: nullableTrimmedString.optional(),
    plant_id: optionalUuidOrNull.optional(),
    wo_type: optionalTrimmedString.default('BREAKDOWN'),
    reported_location: nullableTrimmedString.optional(),
    failure_code: nullableTrimmedString.optional(),
    sub_category: nullableTrimmedString.optional(),
    labor_hours: z.coerce.number().min(0).optional(),
    estimated_cost: z.coerce.number().min(0).optional(),
    actual_cost: z.coerce.number().min(0).optional(),
    vendor_id: optionalUuidOrNull.optional(),
    warranty_claim: z.coerce.boolean().optional(),
    safety_related: z.coerce.boolean().optional(),
    parts_replaced: nullableTrimmedString.optional(),
    spare_consumption: spareConsumptionSchema,
    attachments: z.array(mobileAttachmentSchema).optional(),
    voice_notes: z.array(voiceNoteSchema).optional(),
    safety_checklist: safetyChecklistSchema.optional(),
    follow_up_required: z.coerce.boolean().optional(),
    follow_up_notes: nullableTrimmedString.optional(),
  });

const validateWorkOrderDateRanges = (body: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const startedAt = typeof body.started_at === 'string' ? new Date(body.started_at) : null;
    const resolvedAt = typeof body.resolved_at === 'string' ? new Date(body.resolved_at) : null;
    const downStart = typeof body.downtime_start_at === 'string' ? new Date(body.downtime_start_at) : null;
    const downEnd = typeof body.downtime_end_at === 'string' ? new Date(body.downtime_end_at) : null;

    if (startedAt && resolvedAt && resolvedAt < startedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved_at'],
        message: 'resolved_at must be after started_at',
      });
    }

    if (downStart && downEnd && downEnd < downStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['downtime_end_at'],
        message: 'downtime_end_at must be after downtime_start_at',
      });
    }
  };

const workOrderBodySchema = workOrderBodyBaseSchema.superRefine(validateWorkOrderDateRanges);

const createWorkOrderBodySchema = workOrderBodySchema
  .transform((body) => ({
    ...body,
    wo_number: body.wo_number ?? generateWorkOrderNumber(),
  }));

const updateWorkOrderBodySchema = workOrderBodyBaseSchema.partial().superRefine(validateWorkOrderDateRanges);

export const createWorkOrderSchema = z.preprocess(normalizeObjectKeys, createWorkOrderBodySchema);
export const updateWorkOrderSchema = z.preprocess(normalizeObjectKeys, updateWorkOrderBodySchema);
