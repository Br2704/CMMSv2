import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Plant {
  id: string;
  plantCode: string;
  plantName: string;
  location: string | null;
  plantAdminId: string | null;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlantPayload {
  plantCode: string;
  plantName: string;
  organizationId: string;
  location?: string | null;
  plantAdminId?: string | null;
  isActive?: boolean;
}

function normalizePlant(input: Record<string, unknown>): Plant {
  return {
    id: String(input.id ?? ""),
    plantCode: String(input.plantCode ?? input.plant_code ?? ""),
    plantName: String(input.plantName ?? input.plant_name ?? ""),
    location: (input.location ?? null) as string | null,
    plantAdminId: (input.plantAdminId ?? input.plant_admin_id ?? null) as string | null,
    organizationId: String(input.organizationId ?? input.organization_id ?? ""),
    isActive: Boolean(input.isActive ?? input.is_active ?? false),
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
  };
}

function extractPlantListItems(rawData: unknown): Record<string, unknown>[] {
  if (Array.isArray(rawData)) {
    return rawData.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (!rawData || typeof rawData !== "object") {
    return [];
  }

  const containers = [
    (rawData as { items?: unknown }).items,
    (rawData as { rows?: unknown }).rows,
    (rawData as { records?: unknown }).records,
    (rawData as { data?: unknown }).data,
  ];

  for (const candidate of containers) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }

  return [];
}

export async function listPlants(params: ListParams = {}): Promise<ApiListResponse<Plant>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/plants${toQueryString(params)}`, { method: "GET" });
  return {
    ...response,
    data: extractPlantListItems(response.data).map((item) => normalizePlant(item)),
  };
}

export async function getPlant(id: string): Promise<ApiResponse<Plant>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/plants/${id}`, { method: "GET" });
  return {
    ...response,
    data: normalizePlant(response.data),
  };
}

export async function createPlant(payload: PlantPayload): Promise<ApiResponse<Plant>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/plants", { method: "POST", body: JSON.stringify(payload) });
  return {
    ...response,
    data: normalizePlant(response.data),
  };
}

export async function updatePlant(id: string, payload: Partial<PlantPayload>): Promise<ApiResponse<Plant>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/plants/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  return {
    ...response,
    data: normalizePlant(response.data),
  };
}

export function deletePlant(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/plants/${id}`, { method: "DELETE" });
}

// Backward-compatible exports
export const listPlantsApi = (query = "") => httpRequest<ApiListResponse<Plant>>(`/plants${query}`, { method: "GET" });
export const getPlantApi = getPlant;
export const createPlantApi = (payload: Record<string, unknown>) => createPlant(payload as unknown as PlantPayload);
export const updatePlantApi = (id: string, payload: Record<string, unknown>) =>
  updatePlant(id, payload as Partial<PlantPayload>);
export const deletePlantApi = deletePlant;
