import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse } from "@/api/types";

export interface DataLoggingFieldValue {
  id: string;
  fieldId: string;
  value: string | null;
  fieldLabel: string | null;
  unit: string | null;
}

export interface DataLoggingField {
  id: string;
  templateId: string;
  sectionName: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: "TEXT" | "NUMBER" | "CHECKBOX" | "DROPDOWN" | "DATE" | "TIME" | "TEXTAREA";
  options: string[] | null;
  isRequired: boolean;
  minValue: string | null;
  maxValue: string | null;
  unit: string | null;
  displayOrder: number;
}

export interface DataLoggingTemplateAssignment {
  userId: string;
  fullName: string;
  userCode: string | null;
}

export interface DataLoggingTemplate {
  id: string;
  templateName: string;
  category: string;
  description: string | null;
  frequency: "HOURLY" | "SHIFT" | "DAILY" | "WEEKLY";
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  machineId: string | null;
  departmentName: string | null;
  moduleName: string | null;
  machineName: string | null;
  isActive: boolean;
  fields: DataLoggingField[];
  assignments: DataLoggingTemplateAssignment[];
}

export interface DataLoggingShift {
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  plantId: string | null;
}

export interface DataLoggingEntry {
  id: string;
  templateId: string;
  templateName: string;
  shiftId: string | null;
  shiftName: string | null;
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  machineId: string | null;
  logDate: string;
  status: string;
  remarks: string | null;
  createdAt: string;
  submittedAt: string | null;
  frequency: "HOURLY" | "SHIFT" | "DAILY" | "WEEKLY";
  values: DataLoggingFieldValue[];
}

export interface DataLoggingTemplatesResponse {
  templates: DataLoggingTemplate[];
  shifts: DataLoggingShift[];
}

export interface CreateDataLoggingEntryPayload {
  templateId: string;
  shiftId?: string | null;
  plantId?: string | null;
  logDate?: string;
  status?: string;
  remarks?: string | null;
  values: Array<{
    fieldId: string;
    value?: string | null;
  }>;
}

export function listAssignedDataLoggingTemplates(params: { plantId?: string; assignedOnly?: boolean } = {}) {
  const searchParams = new URLSearchParams();
  if (params.plantId) {
    searchParams.set("plantId", params.plantId);
  }
  searchParams.set("assignedOnly", String(params.assignedOnly ?? true));
  const query = searchParams.toString();
  return httpRequest<ApiResponse<DataLoggingTemplatesResponse>>(
    `/data-logging/templates${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}

export function listMyDataLoggingEntries(params: { plantId?: string; templateId?: string; search?: string; page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.plantId) searchParams.set("plantId", params.plantId);
  if (params.templateId) searchParams.set("templateId", params.templateId);
  if (params.search) searchParams.set("search", params.search);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return httpRequest<ApiListResponse<DataLoggingEntry>>(`/data-logging/entries${query ? `?${query}` : ""}`, { method: "GET" });
}

export function createDataLoggingEntry(payload: CreateDataLoggingEntryPayload) {
  return httpRequest<ApiResponse<DataLoggingEntry>>("/data-logging/entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
