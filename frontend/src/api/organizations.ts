import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Organization {
  id: string;
  name: string;
  code: string | null;
  legalName: string | null;
  industry: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  notes: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandColor: string | null;
  billingCycle: "MONTHLY" | "YEARLY" | null;
  subscriptionStatus: "DRAFT" | "TRIAL" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "SUSPENDED";
  hasFreeTrial: boolean;
  trialStartDate: string | null;
  trialEndDate: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  reminderEnabled: boolean;
  reminderLeadDays: number;
  lastReminderSentAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  plantsCount?: number;
  usersCount?: number;
  adminsCount?: number;
  superadminsCount?: number;
}

export interface OrganizationPayload {
  name: string;
  code?: string | null;
  legalName?: string | null;
  industry?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  brandColor?: string | null;
  billingCycle?: "MONTHLY" | "YEARLY" | null;
  subscriptionStatus?: "DRAFT" | "TRIAL" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "SUSPENDED";
  hasFreeTrial?: boolean;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  reminderEnabled?: boolean;
  reminderLeadDays?: number;
  isActive?: boolean;
  superadminUserIds?: string[];
}

function normalizeOrganization(input: Record<string, unknown>): Organization {
  const rawIsActive = input.isActive ?? input.is_active;
  const resolvedIsActive =
    typeof rawIsActive === "boolean"
      ? rawIsActive
      : typeof rawIsActive === "number"
      ? rawIsActive === 1
      : typeof rawIsActive === "string"
      ? ["true", "1", "yes", "y"].includes(rawIsActive.trim().toLowerCase())
      : true;

  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? ""),
    code: (input.code ?? null) as string | null,
    legalName: (input.legalName ?? input.legal_name ?? null) as string | null,
    industry: (input.industry ?? null) as string | null,
    registrationNumber: (input.registrationNumber ?? input.registration_number ?? null) as string | null,
    taxId: (input.taxId ?? input.tax_id ?? null) as string | null,
    website: (input.website ?? null) as string | null,
    contactEmail: (input.contactEmail ?? input.contact_email ?? null) as string | null,
    contactPhone: (input.contactPhone ?? input.contact_phone ?? null) as string | null,
    primaryContactName: (input.primaryContactName ?? input.primary_contact_name ?? null) as string | null,
    primaryContactEmail: (input.primaryContactEmail ?? input.primary_contact_email ?? null) as string | null,
    primaryContactPhone: (input.primaryContactPhone ?? input.primary_contact_phone ?? null) as string | null,
    addressLine1: (input.addressLine1 ?? input.address_line_1 ?? input.address_line1 ?? null) as string | null,
    addressLine2: (input.addressLine2 ?? input.address_line_2 ?? input.address_line2 ?? null) as string | null,
    city: (input.city ?? null) as string | null,
    state: (input.state ?? null) as string | null,
    country: (input.country ?? null) as string | null,
    postalCode: (input.postalCode ?? input.postal_code ?? null) as string | null,
    notes: (input.notes ?? null) as string | null,
    logoUrl: (input.logoUrl ?? input.logo_url ?? null) as string | null,
    faviconUrl: (input.faviconUrl ?? input.favicon_url ?? null) as string | null,
    brandColor: (input.brandColor ?? input.brand_color ?? null) as string | null,
    billingCycle: (input.billingCycle ?? input.billing_cycle ?? null) as Organization["billingCycle"],
    subscriptionStatus: String(input.subscriptionStatus ?? input.subscription_status ?? "DRAFT") as Organization["subscriptionStatus"],
    hasFreeTrial: Boolean(input.hasFreeTrial ?? input.has_free_trial ?? false),
    trialStartDate: (input.trialStartDate ?? input.trial_start_date ?? null) as string | null,
    trialEndDate: (input.trialEndDate ?? input.trial_end_date ?? null) as string | null,
    subscriptionStartDate: (input.subscriptionStartDate ?? input.subscription_start_date ?? null) as string | null,
    subscriptionEndDate: (input.subscriptionEndDate ?? input.subscription_end_date ?? null) as string | null,
    reminderEnabled: Boolean(input.reminderEnabled ?? input.reminder_enabled ?? true),
    reminderLeadDays: Number(input.reminderLeadDays ?? input.reminder_lead_days ?? 60),
    lastReminderSentAt: (input.lastReminderSentAt ?? input.last_reminder_sent_at ?? null) as string | null,
    isActive: resolvedIsActive,
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
    plantsCount: Number(input.plantsCount ?? input.plants_count ?? 0),
    usersCount: Number(input.usersCount ?? input.users_count ?? 0),
    adminsCount: Number(input.adminsCount ?? input.admins_count ?? 0),
    superadminsCount: Number(input.superadminsCount ?? input.superadmins_count ?? 0),
  };
}

function extractOrganizationListItems(rawData: unknown): Record<string, unknown>[] {
  if (Array.isArray(rawData)) {
    return rawData.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (!rawData || typeof rawData !== "object") {
    return [];
  }

  const containers = [
    (rawData as { items?: unknown }).items,
    (rawData as { rows?: unknown }).rows,
    (rawData as { records?: unknown }).records,
    (rawData as { data?: unknown }).data,
  ];

  for (const candidate of containers) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }

  return [];
}

export async function listOrganizations(params: ListParams = {}): Promise<ApiListResponse<Organization>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/organizations${toQueryString(params)}`, { method: "GET" });

  return {
    ...response,
    data: extractOrganizationListItems(response.data).map((item) => normalizeOrganization(item)),
  };
}

export async function createOrganization(payload: OrganizationPayload): Promise<ApiResponse<Organization>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeOrganization(response.data) };
}

export async function updateOrganization(id: string, payload: Partial<OrganizationPayload>): Promise<ApiResponse<Organization>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/organizations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeOrganization(response.data) };
}

export function deleteOrganization(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/organizations/${id}`, { method: "DELETE" });
}
