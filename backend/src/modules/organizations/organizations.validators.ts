import { z } from 'zod';
import { isSafeImageValue } from '../../utils/fileValidation';

const imageValueSchema = z
  .string()
  .trim()
  .max(2_500_000)
  .refine((value) => isSafeImageValue(value), 'Must be a valid secure image URL or supported data URL');

const nullableTrimmedString = z.string().trim().max(255).nullable().optional();
const nullableTextString = z.string().trim().max(10_000).nullable().optional();
const nullableDateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD format').nullable().optional();
const nullableImageSchema = imageValueSchema.nullable().optional();

const organizationBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(64).nullable().optional(),
  legalName: nullableTrimmedString,
  industry: nullableTrimmedString,
  registrationNumber: nullableTrimmedString,
  taxId: nullableTrimmedString,
  website: nullableTrimmedString,
  contactEmail: z.string().trim().email().nullable().optional(),
  contactPhone: nullableTrimmedString,
  primaryContactName: nullableTrimmedString,
  primaryContactEmail: z.string().trim().email().nullable().optional(),
  primaryContactPhone: nullableTrimmedString,
  addressLine1: nullableTrimmedString,
  addressLine2: nullableTrimmedString,
  city: nullableTrimmedString,
  state: nullableTrimmedString,
  country: nullableTrimmedString,
  postalCode: nullableTrimmedString,
  notes: nullableTextString,
  logoUrl: nullableImageSchema,
  faviconUrl: nullableImageSchema,
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').nullable().optional(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).nullable().optional(),
  subscriptionStatus: z.enum(['DRAFT', 'TRIAL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED']).optional(),
  hasFreeTrial: z.boolean().optional(),
  trialStartDate: nullableDateString,
  trialEndDate: nullableDateString,
  subscriptionStartDate: nullableDateString,
  subscriptionEndDate: nullableDateString,
  reminderEnabled: z.boolean().optional(),
  reminderLeadDays: z.coerce.number().int().min(1).max(365).optional(),
  isActive: z.boolean().default(true),
});

export const createOrganizationSchema = organizationBaseSchema;

export const updateOrganizationSchema = organizationBaseSchema.partial();
