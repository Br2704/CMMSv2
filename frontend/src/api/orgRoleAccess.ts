import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";
import type { FeatureMap } from "@/api/features";

export interface OrgRole {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrgRolePermissionMap = Record<string, string[]>;

export function listOrgRoles(orgId: string) {
  return httpRequest<ApiResponse<OrgRole[]>>(`/orgs/${orgId}/roles`, { method: "GET" });
}

export function createOrgRole(orgId: string, payload: { key: string; name: string; isActive?: boolean }) {
  return httpRequest<ApiResponse<OrgRole>>(`/orgs/${orgId}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrgRole(orgId: string, roleId: string, payload: Partial<{ key: string; name: string; isActive: boolean }>) {
  return httpRequest<ApiResponse<OrgRole>>(`/orgs/${orgId}/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteOrgRole(orgId: string, roleId: string) {
  return httpRequest<ApiResponse<{ id: string; deleted: boolean }>>(`/orgs/${orgId}/roles/${roleId}`, { method: "DELETE" });
}

export function getOrgRolePermissions(orgId: string, roleId: string) {
  return httpRequest<ApiResponse<OrgRolePermissionMap>>(`/orgs/${orgId}/roles/${roleId}/permissions`, { method: "GET" });
}

export function saveOrgRolePermissions(orgId: string, roleId: string, payload: OrgRolePermissionMap) {
  return httpRequest<ApiResponse<{ permissions: OrgRolePermissionMap; version: number }>>(`/orgs/${orgId}/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getOrgRbacVersion(orgId: string) {
  return httpRequest<ApiResponse<{ version: number }>>(`/orgs/${orgId}/rbac/version`, { method: "GET" });
}

export function listOrgFeatures(orgId: string) {
  return httpRequest<ApiResponse<FeatureMap>>(`/orgs/${orgId}/features`, { method: "GET" });
}

export function saveOrgFeatures(orgId: string, payload: FeatureMap) {
  return httpRequest<ApiResponse<FeatureMap>>(`/orgs/${orgId}/features`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

