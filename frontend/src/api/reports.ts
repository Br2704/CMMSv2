import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface ReportSchedule {
  id: string;
  reportName: string;
  description: string | null;
  frequency: string;
  sendTime: string;
  recipients: string[];
  isEnabled: boolean;
  reportSections: string[] | null;
  filters: unknown;
  includeCharts: boolean;
  includeTables: boolean;
  includeDetailedLogs: boolean;
  plantId: string | null;
  createdBy: string | null;
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportPayload {
  reportName: string;
  description?: string | null;
  frequency?: string;
  sendTime?: string;
  recipients: string[];
  isEnabled?: boolean;
  reportSections?: string[] | null;
  filters?: unknown;
  includeCharts?: boolean;
  includeTables?: boolean;
  includeDetailedLogs?: boolean;
  plantId?: string | null;
}

export function listReportSchedules(params: ListParams = {}) {
  return httpRequest<ApiListResponse<ReportSchedule>>(`/reports${toQueryString(params)}`, { method: "GET" });
}

export function getReportSchedule(id: string) {
  return httpRequest<ApiResponse<ReportSchedule>>(`/reports/${id}`, { method: "GET" });
}

export function createReportSchedule(payload: ReportPayload) {
  return httpRequest<ApiResponse<ReportSchedule>>("/reports", { method: "POST", body: JSON.stringify(payload) });
}

export function updateReportSchedule(id: string, payload: Partial<ReportPayload>) {
  return httpRequest<ApiResponse<ReportSchedule>>(`/reports/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteReportSchedule(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/reports/${id}`, { method: "DELETE" });
}

export function listReportHistory(params: ListParams & { schedule_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.schedule_id) query.set("schedule_id", params.schedule_id);
  const common = toQueryString(params);
  const join = common ? `${common}&${query.toString()}` : query.toString() ? `?${query.toString()}` : "";
  return httpRequest<ApiListResponse<Record<string, unknown>>>(`/reports/history${join}`, { method: "GET" });
}

export function sendReportNow(scheduleId: string) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/reports/send-now", {
    method: "POST",
    body: JSON.stringify({ scheduleId }),
  });
}

export interface AdvancedReliabilityQuery {
  organizationId?: string;
  plantId?: string;
  departmentId?: string;
  machineId?: string;
  moduleId?: string;
  vendorId?: string;
  workOrderStatus?: string;
  maintenanceType?: string;
  startDate?: string;
  endDate?: string;
  format?: "json" | "csv" | "excel" | "pdf";
  page?: number;
  limit?: number;
}

export interface AdvancedReliabilitySummary {
  mttrHours: number;
  mtbfHours: number;
  downtimeMinutes: number;
  availabilityPercent: number;
  maintenanceFrequencyPerMachine: number;
  workOrderCount: number;
}

export interface AdvancedReliabilityPayload {
  summary: AdvancedReliabilitySummary;
  ranking: Array<{ assetId: string; assetCode: string; assetName: string; mttrHours: number; downtimeMinutes: number; failures: number }>;
  maintenanceFrequency: Array<{ assetId: string; assetCode: string; assetName: string; count: number }>;
  rows: Array<Record<string, unknown>>;
  reportCategories?: Record<string, number>;
}

function toAdvancedQueryString(params: AdvancedReliabilityQuery): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getAdvancedReliabilityReport(params: AdvancedReliabilityQuery) {
  return httpRequest<ApiResponse<AdvancedReliabilityPayload>>(`/reports/advanced/reliability${toAdvancedQueryString(params)}`, { method: "GET" });
}

export async function downloadAdvancedReliabilityReport(
  format: "csv" | "excel" | "pdf",
  params: AdvancedReliabilityQuery,
): Promise<void> {
  const queryString = toAdvancedQueryString({ ...params, format });
  const response = await fetch(`${getApiBaseUrl()}/reports/advanced/export${queryString}`, {
    method: "GET",
    headers: {
      ...(getStoredAccessToken() ? { Authorization: `Bearer ${getStoredAccessToken()}` } : {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Report export failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const date = new Date().toISOString().slice(0, 10);
  const extension = format === "excel" ? "xls" : format;
  anchor.download = `machine-reliability-${date}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
