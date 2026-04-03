import { httpRequest } from "@/api/http";
import type { ApiListResponse, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface PermissionEntry {
  role: string;
  moduleId: string;
  actions: string[];
}

export async function getPermissions(params: ListParams = { page: 1, limit: 100 }): Promise<PermissionEntry[]> {
  const response = await httpRequest<ApiListResponse<PermissionEntry>>(`/permissions${toQueryString(params)}`, { method: "GET" });

  return response.data.map((row) => ({
    role: row.role,
    moduleId: row.moduleId,
    actions: row.actions,
  }));
}
