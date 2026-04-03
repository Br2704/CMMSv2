import { z } from 'zod';

export const AMC_VISIT_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const;

const nullableDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const machineGroupSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  groupType: z.enum(['MODULE', 'CUSTOM']).default('CUSTOM'),
  moduleIds: z.array(z.string().uuid()).optional().default([]),
  assetIds: z.array(z.string().uuid()).optional().default([]),
  description: z.string().trim().nullable().optional(),
});

const notificationSettingsSchema = z.object({
  notifyEmail: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
  notifyOnVisitScheduled: z.boolean().optional(),
  notifyOnBreakdown: z.boolean().optional(),
  notifyOnRenewal: z.boolean().optional(),
  notifyOnServiceReportSubmitted: z.boolean().optional(),
  notifyOnServiceReportVerified: z.boolean().optional(),
  escalationEmails: z.array(z.string().trim().email()).optional(),
  notifyBeforeDays: z.array(z.coerce.number().int().min(0)).optional(),
});

export const createAmcSchema = z.object({
  contractName: z.string().trim().min(1),
  contractNumber: z.string().trim().optional(),
  vendorId: z.string().uuid(),
  plantId: z.string().uuid().nullable().optional(),
  contractType: z.string().trim().min(1),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  visitFrequency: z.enum(AMC_VISIT_FREQUENCIES),
  responseTimeSla: z.coerce.number().int().min(0).nullable().optional(),
  resolutionTimeSla: z.coerce.number().int().min(0).nullable().optional(),
  contractValue: z.coerce.number().min(0).nullable().optional(),
  status: z.string().trim().default('ACTIVE'),
  machineIds: z.array(z.string().uuid()).min(1),
  machineGroups: z.array(machineGroupSchema).optional(),
  vendorUserIds: z.array(z.string().uuid()).optional(),
  notificationSettings: notificationSettingsSchema.optional(),
  terms: z.string().trim().nullable().optional(),
});

export const updateAmcSchema = createAmcSchema.partial();

export const serviceReportSchema = z
  .object({
    visitScheduleId: z.string().uuid().nullable().optional(),
    workOrderId: z.string().uuid().nullable().optional(),
    serviceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    workDone: z.string().trim().min(1),
    partsReplaced: z.string().trim().nullable().optional(),
    observations: z.string().trim().nullable().optional(),
    recommendations: z.string().trim().nullable().optional(),
    nextServiceDate: nullableDate,
    attachments: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((value) => Boolean(value.visitScheduleId || value.workOrderId), {
    message: 'visitScheduleId or workOrderId is required',
    path: ['visitScheduleId'],
  });

export const verifyServiceReportSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED']),
  verificationRemarks: z.string().trim().nullable().optional(),
});
