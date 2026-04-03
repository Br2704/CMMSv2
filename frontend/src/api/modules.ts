import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface MachineModule {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  plantId: string | null;
  departmentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MachineModulePayload {
  code?: string | null;
  name: string;
  description?: string | null;
  plantId: string;
  departmentId: string;
  isActive?: boolean;
}

export function listModules(params: ListParams = {}) {
  return httpRequest<ApiListResponse<MachineModule>>(`/modules${toQueryString(params)}`, { method: "GET" });
}

export function createModule(payload: MachineModulePayload) {
  return httpRequest<ApiResponse<MachineModule>>("/modules", { method: "POST", body: JSON.stringify(payload) });
}

export function updateModule(id: string, payload: Partial<MachineModulePayload>) {
  return httpRequest<ApiResponse<MachineModule>>(`/modules/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteModule(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/modules/${id}`, { method: "DELETE" });
}
