import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";
import type { PermissionsMeResponse } from "@/api/permissionsMe";

export interface RbacVersionResponse {
  version: number;
}

export function getRbacVersion() {
  return httpRequest<ApiResponse<RbacVersionResponse>>("/rbac/version", { method: "GET" });
}

export function getOrganizationRbacVersion(orgId: string) {
  return httpRequest<ApiResponse<RbacVersionResponse>>(`/orgs/${orgId}/rbac/version`, { method: "GET" });
}

export function getRbacPermissionsMe() {
  return httpRequest<ApiResponse<PermissionsMeResponse>>("/rbac/permissions/me", { method: "GET" });
}
