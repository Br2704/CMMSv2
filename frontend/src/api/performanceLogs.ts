import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface PerformanceLog {
  id: string;
  plantId: string;
  assetId: string;
  capturedAt: string;
  runtimeHours: string | null;
  energyKwh: string | null;
  productionOutput: string | null;
  efficiencyValue: string | null;
  efficiencyUnit: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceLogPayload {
  plantId: string;
  assetId: string;
  capturedAt: string;
  runtimeHours?: number | null;
  energyKwh?: number | null;
  productionOutput?: number | null;
  efficiencyValue?: number | null;
  efficiencyUnit?: string | null;
  notes?: string | null;
}

export function listPerformanceLogs(params: ListParams & { assetId?: string; from?: string; to?: string } = {}) {
  return httpRequest<ApiListResponse<PerformanceLog>>(`/performance-logs${toQueryString(params)}`, { method: "GET" });
}

export function createPerformanceLog(payload: PerformanceLogPayload) {
  return httpRequest<ApiResponse<PerformanceLog>>("/performance-logs", { method: "POST", body: JSON.stringify(payload) });
}

export function updatePerformanceLog(id: string, payload: Partial<PerformanceLogPayload>) {
  return httpRequest<ApiResponse<PerformanceLog>>(`/performance-logs/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deletePerformanceLog(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/performance-logs/${id}`, { method: "DELETE" });
}
