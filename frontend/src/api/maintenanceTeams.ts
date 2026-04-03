import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface MaintenanceTeam {
  id: string;
  plantId: string | null;
  teamName: string;
  discipline: string;
  teamLeaderId: string | null;
  teamMemberIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTeamPayload {
  plantId?: string | null;
  teamName: string;
  discipline: string;
  teamLeaderId: string | null;
  teamMemberIds: string[];
  isActive?: boolean;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTeam(input: Record<string, unknown>): MaintenanceTeam {
  return {
    id: String(input.id ?? ""),
    plantId: (input.plantId ?? input.plant_id ?? null) as string | null,
    teamName: String(input.teamName ?? input.team_name ?? ""),
    discipline: String(input.discipline ?? ""),
    teamLeaderId: (input.teamLeaderId ?? input.team_leader_id ?? null) as string | null,
    teamMemberIds: parseStringArray(input.teamMemberIds ?? input.team_member_ids),
    isActive: Boolean(input.isActive ?? input.is_active ?? true),
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
  };
}

export async function listMaintenanceTeams(params: ListParams = {}): Promise<ApiListResponse<MaintenanceTeam>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/maintenance-teams${toQueryString(params)}`, { method: "GET" });
  return {
    ...response,
    data: response.data.map((item) => normalizeTeam(item)),
  };
}

export async function createMaintenanceTeam(payload: MaintenanceTeamPayload): Promise<ApiResponse<MaintenanceTeam>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/maintenance-teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeTeam(response.data) };
}

export async function updateMaintenanceTeam(id: string, payload: Partial<MaintenanceTeamPayload>): Promise<ApiResponse<MaintenanceTeam>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/maintenance-teams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return { ...response, data: normalizeTeam(response.data) };
}

export function deleteMaintenanceTeam(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/maintenance-teams/${id}`, { method: "DELETE" });
}
