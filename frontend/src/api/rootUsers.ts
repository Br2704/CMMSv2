import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult } from "@/api/types";

export interface RootOrgUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  profileImageUrl?: string | null;
  roleKey: string;
  isActive: boolean;
  createdAt: string;
  plantId: string | null;
  plantName?: string | null;
  lastLoginAt?: string | null;
  organizationId: string;
  organizationName?: string | null;
  userCode?: string | null;
}

export interface CreateRootUserPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  userCode?: string | null;
  roleKey: string;
  organizationId: string;
  plantId?: string | null;
  isActive?: boolean;
}

export interface UpdateRootUserPayload {
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  roleKey?: string;
  organizationId?: string;
  plantId?: string | null;
  isActive?: boolean;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listRootUsers(params: { organizationId?: string; roleKey?: string; page?: number; limit?: number; search?: string; includeInactive?: boolean }) {
  const query = buildQuery({
    organizationId: params.organizationId ?? undefined,
    roleKey: params.roleKey ?? undefined,
    page: params.page ?? 1,
    limit: params.limit ?? 100,
    search: params.search ?? undefined,
    includeInactive: params.includeInactive ?? undefined,
  });
  return httpRequest<ApiListResponse<RootOrgUser>>(`/root/users${query}`, { method: "GET" });
}

export function listOrgAdmins(params: { organizationId: string; page?: number; limit?: number; search?: string; includeInactive?: boolean }) {
  return listRootUsers(params);
}

export function createRootUser(payload: CreateRootUserPayload) {
  return httpRequest<ApiResponse<RootOrgUser>>("/root/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRootUser(id: string, payload: UpdateRootUserPayload) {
  return httpRequest<ApiResponse<RootOrgUser>>(`/root/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRootUser(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/root/users/${id}`, { method: "DELETE" });
}
