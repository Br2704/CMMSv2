import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export type MasterRecord = Record<string, unknown>;

export function listMasters(params: ListParams = {}) {
  return httpRequest<ApiListResponse<MasterRecord>>(`/masters${toQueryString(params)}`, { method: "GET" });
}

export function getMaster(id: string) {
  return httpRequest<ApiResponse<MasterRecord>>(`/masters/${id}`, { method: "GET" });
}

export function createMaster(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<MasterRecord>>("/masters", { method: "POST", body: JSON.stringify(payload) });
}

export function updateMaster(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<MasterRecord>>(`/masters/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteMaster(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/masters/${id}`, { method: "DELETE" });
}
