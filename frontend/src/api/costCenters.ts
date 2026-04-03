import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  plantId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenterPayload {
  code: string;
  name: string;
  departmentId?: string | null;
  plantId?: string | null;
  isActive?: boolean;
}

export function listCostCenters(params: ListParams = {}) {
  return httpRequest<ApiListResponse<CostCenter>>(`/cost-centers${toQueryString(params)}`, { method: "GET" });
}

export function createCostCenter(payload: CostCenterPayload) {
  return httpRequest<ApiResponse<CostCenter>>("/cost-centers", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCostCenter(id: string, payload: Partial<CostCenterPayload>) {
  return httpRequest<ApiResponse<CostCenter>>(`/cost-centers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCostCenter(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/cost-centers/${id}`, { method: "DELETE" });
}
