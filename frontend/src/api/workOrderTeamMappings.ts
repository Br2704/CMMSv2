import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface WorkOrderTeamMapping {
  id: string;
  plantId: string | null;
  departmentId: string | null;
  category: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderTeamMappingPayload {
  plantId?: string | null;
  departmentId?: string | null;
  category: string;
  teamId: string;
}

function normalizeMapping(input: Record<string, unknown>): WorkOrderTeamMapping {
  return {
    id: String(input.id ?? ""),
    plantId: (input.plantId ?? input.plant_id ?? null) as string | null,
    departmentId: (input.departmentId ?? input.department_id ?? null) as string | null,
    category: String(input.category ?? ""),
    teamId: String(input.teamId ?? input.team_id ?? ""),
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
  };
}

export async function listWorkOrderTeamMappings(params: ListParams = {}): Promise<ApiListResponse<WorkOrderTeamMapping>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/work-order-team-mappings${toQueryString(params)}`, {
    method: "GET",
  });
  return {
    ...response,
    data: response.data.map((item) => normalizeMapping(item)),
  };
}

export async function createWorkOrderTeamMapping(payload: WorkOrderTeamMappingPayload): Promise<ApiResponse<WorkOrderTeamMapping>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/work-order-team-mappings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeMapping(response.data) };
}

export async function updateWorkOrderTeamMapping(id: string, payload: Partial<WorkOrderTeamMappingPayload>): Promise<ApiResponse<WorkOrderTeamMapping>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/work-order-team-mappings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeMapping(response.data) };
}

export function deleteWorkOrderTeamMapping(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/work-order-team-mappings/${id}`, { method: "DELETE" });
}
