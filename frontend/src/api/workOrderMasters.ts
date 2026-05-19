import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult } from "@/api/types";

export type WorkOrderMasterOptionType = "CATEGORY" | "WO_TYPE" | "FAILURE_CODE" | "TEMPLATE";

export interface WorkOrderMaster {
  id: string;
  plantId: string | null;
  optionType: WorkOrderMasterOptionType;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderMasterPayload {
  plantId?: string | null;
  optionType: WorkOrderMasterOptionType;
  code?: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface WorkOrderMasterListParams {
  plantId?: string;
  search?: string;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
  optionType?: WorkOrderMasterOptionType;
}

function toQueryString(params: WorkOrderMasterListParams = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null) return;
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      searchParams.set(key, trimmed);
      return;
    }
    searchParams.set(key, String(rawValue));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function normalizeWorkOrderMaster(input: Record<string, unknown>): WorkOrderMaster {
  return {
    id: String(input.id ?? ""),
    plantId: (input.plantId ?? input.plant_id ?? null) as string | null,
    optionType: String(input.optionType ?? input.option_type ?? "CATEGORY") as WorkOrderMasterOptionType,
    code: String(input.code ?? ""),
    label: String(input.label ?? ""),
    description: (input.description ?? null) as string | null,
    sortOrder: Number(input.sortOrder ?? input.sort_order ?? 0),
    isActive: Boolean(input.isActive ?? input.is_active ?? true),
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
  };
}

export async function listWorkOrderMasters(params: WorkOrderMasterListParams = {}): Promise<ApiListResponse<WorkOrderMaster>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/work-order-masters${toQueryString(params)}`, {
    method: "GET",
  });
  return {
    ...response,
    data: response.data.map((item) => normalizeWorkOrderMaster(item)),
  };
}

export async function createWorkOrderMaster(payload: WorkOrderMasterPayload): Promise<ApiResponse<WorkOrderMaster>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/work-order-masters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    data: normalizeWorkOrderMaster(response.data),
  };
}

export async function updateWorkOrderMaster(id: string, payload: Partial<WorkOrderMasterPayload>): Promise<ApiResponse<WorkOrderMaster>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/work-order-masters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    data: normalizeWorkOrderMaster(response.data),
  };
}

export function deleteWorkOrderMaster(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/work-order-masters/${id}`, { method: "DELETE" });
}
