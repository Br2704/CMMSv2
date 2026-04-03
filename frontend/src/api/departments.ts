import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Department {
  id: string;
  name: string;
  code: string;
  plantId: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  plantId?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

function normalizeDepartment(input: Record<string, unknown>): Department {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? ""),
    code: String(input.code ?? ""),
    plantId: (input.plantId ?? input.plant_id ?? null) as string | null,
    parentId: (input.parentId ?? input.parent_id ?? null) as string | null,
    isActive: Boolean(input.isActive ?? input.is_active ?? true),
    createdAt: String(input.createdAt ?? input.created_at ?? ""),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? ""),
  };
}

function extractDepartmentItems(rawData: unknown): Record<string, unknown>[] {
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

export async function listDepartments(params: ListParams = {}): Promise<ApiListResponse<Department>> {
  const response = await httpRequest<ApiListResponse<Record<string, unknown>>>(`/departments${toQueryString(params)}`, { method: "GET" });
  return {
    ...response,
    data: extractDepartmentItems(response.data).map((item) => normalizeDepartment(item)),
  };
}

export async function createDepartment(payload: DepartmentPayload): Promise<ApiResponse<Department>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>("/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    data: normalizeDepartment(response.data),
  };
}

export async function updateDepartment(id: string, payload: Partial<DepartmentPayload>): Promise<ApiResponse<Department>> {
  const response = await httpRequest<ApiResponse<Record<string, unknown>>>(`/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    data: normalizeDepartment(response.data),
  };
}

export function deleteDepartment(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/departments/${id}`, { method: "DELETE" });
}
