import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RolePayload {
  name: string;
  description?: string | null;
}

export function listRoles() {
  return httpRequest<ApiResponse<Role[]>>("/roles", { method: "GET" });
}

export function listRoleCatalog() {
  return httpRequest<ApiResponse<Role[]>>("/roles/catalog", { method: "GET" });
}

export function createRole(payload: RolePayload) {
  return httpRequest<ApiResponse<Role>>("/roles", { method: "POST", body: JSON.stringify(payload) });
}

export function updateRole(id: string, payload: Partial<RolePayload>) {
  return httpRequest<ApiResponse<Role>>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteRole(id: string) {
  return httpRequest<ApiResponse<{ id: string }>>(`/roles/${id}`, { method: "DELETE" });
}
