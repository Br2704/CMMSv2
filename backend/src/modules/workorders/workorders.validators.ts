import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination';

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

const requiredTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return value.trim();
}, z.string().min(1));

const nullableTrimmedString = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().min(1, { message: 'Field cannot be empty' }).nullable());

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
    spare_item_id: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    spare_name: nullableTrimmedString.optional(),
    spare_code: nullableTrimmedString.optional(),
    is_manual: z.coerce.boolean().optional(),
  }))
  .superRefine((entry, ctx) => {
    const isManual = Boolean(entry.is_manual) || entry.spare_item_id.startsWith('manual-');
    if (!isManual && !z.string().uuid().safeParse(entry.spare_item_id).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spare_item_id'],
        message: 'spare_item_id must be a valid UUID unless marked as manual',
      });
    }
    if (isManual && !entry.spare_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spare_name'],
        message: 'spare_name is required for manual spare entries',
      });
    }
  });

const spareConsumptionSchema = z.array(spareConsumptionEntrySchema).optional();

const mobileAttachmentSchema = z.preprocess(
  normalizeObjectKeys,
  z
    .object({
      name: optionalTrimmedString,
      mime_type: optionalTrimmedString,
      data_url: requiredTrimmedString,
      captured_at: optionalIsoDateTimeOrNull.optional(),
    })
    .superRefine((value, ctx) => {
      const mimeType = value.mime_type?.toLowerCase() || '';
      const dataUrl = value.data_url.toLowerCase();

      if (mimeType && !mimeType.startsWith('image/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mime_type'],
          message: 'Only image attachments are allowed',
        });
      }

      if (!dataUrl.startsWith('data:image/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data_url'],
          message: 'Attachment data_url must be an image data URL',
        });
      }
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
    category: optionalTrimmedString,
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
    reporter_name_type: nullableTrimmedString.optional(),
    failure_code: nullableTrimmedString.optional(),
    sub_category: nullableTrimmedString.optional(),
    labor_hours: z.coerce.number().min(0).optional(),
    actual_cost: z.coerce.number().min(0).optional(),
    vendor_id: optionalUuidOrNull.optional(),
    warranty_claim: z.coerce.boolean().optional(),
    safety_related: z.coerce.boolean().optional(),
    parts_replaced: nullableTrimmedString.optional(),
    spare_consumption: spareConsumptionSchema,
    attachments: z.array(mobileAttachmentSchema).optional(),
    safety_checklist: safetyChecklistSchema.optional(),
    follow_up_required: z.coerce.boolean().optional(),
    follow_up_team_id: optionalUuidOrNull.optional(),
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

const whyWhyAnalysisSchema = z.preprocess(
  normalizeObjectKeys,
  z.object({
    why_1: requiredTrimmedString,
    why_2: requiredTrimmedString,
    why_3: requiredTrimmedString,
    why_4: requiredTrimmedString,
    why_5: requiredTrimmedString,
    root_reason: requiredTrimmedString,
    corrective_prevention: requiredTrimmedString,
    recurrence_prevention: requiredTrimmedString,
  }),
);

const startWorkOrderBodySchema = z
  .object({
    verification_method: z.enum(['QR_SCAN', 'MANUAL_ENTRY']),
    scanned_asset_id: optionalUuidOrNull.optional(),
    manual_machine_code: nullableTrimmedString.optional(),
    initial_assessment: nullableTrimmedString.optional(),
    category: optionalTrimmedString,
    assigned_to: optionalUuidOrNull.optional(),
    assigned_to_notes: nullableTrimmedString.optional(),
    estimated_time_minutes: z.coerce.number().int().min(0).optional(),
    expected_downtime_minutes: z.coerce.number().int().min(0).optional(),
    assessment_remarks: nullableTrimmedString.optional(),
    safety_checklist: safetyChecklistSchema,
  })
  .superRefine((body, ctx) => {
    if (body.verification_method === 'QR_SCAN' && !body.scanned_asset_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scanned_asset_id'],
        message: 'scanned_asset_id is required when using QR_SCAN',
      });
    }
    if (body.verification_method === 'MANUAL_ENTRY' && !body.manual_machine_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manual_machine_code'],
        message: 'manual_machine_code is required when QR is unavailable',
      });
    }
    if (!body.safety_checklist?.ppe_worn || !body.safety_checklist?.machine_isolated || !body.safety_checklist?.safety_lock_applied) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['safety_checklist'],
        message: 'All safety checklist items must be confirmed',
      });
    }
  });

const triageWorkOrderBodySchema = z.object({
  initial_assessment: nullableTrimmedString.optional(),
  assigned_to_notes: nullableTrimmedString.optional(),
  estimated_time_minutes: z.coerce.number().int().min(0).optional(),
});

const submitWorkOrderForApprovalBodySchema = z
  .object({
    wo_type: optionalTrimmedString,
    work_performed_description: requiredTrimmedString,
    issue_details: requiredTrimmedString,
    corrective_action: nullableTrimmedString.optional(),
    root_cause: nullableTrimmedString.optional(),
    time_spent_minutes: z.coerce.number().int().min(0).optional(),
    downtime_minutes: z.coerce.number().int().min(0).optional(),
    completion_at: optionalIsoDateTimeOrNull.optional(),
    materials_used: nullableTrimmedString.optional(),
    spare_used: z.coerce.boolean().optional(),
    attachments: z.array(mobileAttachmentSchema).optional(),
    remarks: requiredTrimmedString,
    failure_code: nullableTrimmedString.optional(),
    actual_failure_category: nullableTrimmedString.optional(),
    why_why_analysis: z.preprocess(normalizeObjectKeys, whyWhyAnalysisSchema).nullable().optional(),
    preventive_recommendation: nullableTrimmedString.optional(),
    manpower_used: nullableTrimmedString.optional(),
    actual_cost: z.coerce.number().min(0).optional(),
    spare_consumption: spareConsumptionSchema,
    operator_fault: z.coerce.boolean().optional(),
    follow_up_required: z.coerce.boolean().optional(),
    follow_up_team_id: optionalUuidOrNull.optional(),
    follow_up_notes: nullableTrimmedString.optional(),
    follow_up_support_category: optionalTrimmedString,
    follow_up_urgency: nullableTrimmedString.optional(),
  })
  .superRefine((body, ctx) => {
    const spareUsed = Boolean(body.spare_used);
    const spareRows = Array.isArray(body.spare_consumption) ? body.spare_consumption : [];
    const materialsUsed = typeof body.materials_used === 'string' ? body.materials_used.trim() : '';

    if (spareUsed && spareRows.length === 0 && !materialsUsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spare_consumption'],
        message: 'spare_consumption or materials_used is required when spare_used is true',
      });
    }

    if (body.follow_up_required && !body.follow_up_team_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['follow_up_team_id'],
        message: 'follow_up_team_id is required when follow_up_required is true',
      });
    }
  });

const reviewWorkOrderBodySchema = z.object({
  comments: nullableTrimmedString.optional(),
});

const acceptWorkOrderBodySchema = z.object({
  notes: nullableTrimmedString.optional(),
});

const workOrderActivityBodySchema = z
  .object({
    type: z.enum(['COMMENT', 'INTERNAL_NOTE']).default('COMMENT'),
    notes: requiredTrimmedString,
    attachments: z.array(mobileAttachmentSchema).optional(),
    occurred_at: optionalIsoDateTimeOrNull.optional(),
  });

export const startWorkOrderSchema = z.preprocess(normalizeObjectKeys, startWorkOrderBodySchema);
export const triageWorkOrderSchema = z.preprocess(normalizeObjectKeys, triageWorkOrderBodySchema);
export const submitWorkOrderForApprovalSchema = z.preprocess(normalizeObjectKeys, submitWorkOrderForApprovalBodySchema);
export const reviewWorkOrderSchema = z.preprocess(normalizeObjectKeys, reviewWorkOrderBodySchema);
export const acceptWorkOrderSchema = z.preprocess(normalizeObjectKeys, acceptWorkOrderBodySchema);
export const workOrderActivitySchema = z.preprocess(normalizeObjectKeys, workOrderActivityBodySchema);

const workOrderScopeSchema = z.enum(['assigned', 'raised', 'incharge', 'all', 'approval_required']);

const optionalTrimmedQueryString = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value[0];
    }
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional(),
);

const optionalBooleanQuery = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value[0];
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return undefined;
  },
  z.boolean().optional(),
);

export const workOrdersListQuerySchema = listQuerySchema.extend({
  scope: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value[0];
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'approval' || normalized === 'approval-required') {
        return 'approval_required';
      }
      return normalized;
    },
    workOrderScopeSchema.optional(),
  ),
  status: optionalTrimmedQueryString,
  category: optionalTrimmedQueryString,
  wo_type: optionalTrimmedQueryString,
  woType: optionalTrimmedQueryString,
  approval_required: optionalBooleanQuery,
  approvalRequired: optionalBooleanQuery,
  escalation_only: optionalBooleanQuery,
  escalationOnly: optionalBooleanQuery,
  date_from: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value[0];
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().optional(),
  ),
  date_to: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value[0];
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().optional(),
  ),
});

const bulkUpdateBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, { message: 'At least one work order ID is required' }),
  assigned_to: optionalUuidOrNull.optional(),
  priority: optionalTrimmedString.optional(),
  status: z.enum(['ASSIGNED', 'OPENED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
  category: optionalTrimmedString.optional(),
  wo_type: optionalTrimmedString.optional(),
  plant_id: optionalUuidOrNull.optional(),
  remarks: nullableTrimmedString.optional(),
});

export const bulkUpdateSchema = z.preprocess(normalizeObjectKeys, bulkUpdateBodySchema);

export const workOrdersSummaryQuerySchema = listQuerySchema.pick({ plantId: true });
