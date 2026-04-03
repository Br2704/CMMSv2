import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";
import { listRoles as listRolesApi } from "@/api/roles";

export { listRolesApi as listRoles };

export type RolePermissionMap = Record<string, string[]>;

export function getRolePermissions(roleId: string) {
  return httpRequest<ApiResponse<RolePermissionMap>>(`/roles/${roleId}/permissions`, { method: "GET" });
}

export function saveRolePermissions(roleId: string, payload: RolePermissionMap) {
  return httpRequest<ApiResponse<RolePermissionMap>>(`/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
