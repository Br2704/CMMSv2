import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Shift extends Record<string, unknown> {
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  plantId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftPayload {
  shiftName: string;
  startTime: string;
  endTime: string;
  plantId?: string | null;
  isActive?: boolean;
}

export function listShifts(params: ListParams = {}) {
  return httpRequest<ApiListResponse<Shift>>(`/shifts${toQueryString(params)}`, { method: "GET" });
}

export function createShift(payload: ShiftPayload) {
  return httpRequest<ApiResponse<Shift>>("/shifts", { method: "POST", body: JSON.stringify(payload) });
}

export function updateShift(id: string, payload: Partial<ShiftPayload>) {
  return httpRequest<ApiResponse<Shift>>(`/shifts/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteShift(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/shifts/${id}`, { method: "DELETE" });
}
