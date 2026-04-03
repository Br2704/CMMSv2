import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface RoleKpiItem {
  kpiKey: string;
  isVisible: boolean;
  displayOrder: number;
}

export function getRoleKpis(roleId: string) {
  return httpRequest<ApiResponse<RoleKpiItem[]>>(`/roles/${roleId}/kpis`, { method: "GET" });
}

export function saveRoleKpis(roleId: string, payload: RoleKpiItem[]) {
  return httpRequest<ApiResponse<RoleKpiItem[]>>(`/roles/${roleId}/kpis`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
