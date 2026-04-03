import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface PermissionMeKpi {
  kpiKey: string;
  isVisible: boolean;
  displayOrder: number;
}

export interface PermissionsMeResponse {
  roleNames?: string[];
  roles: string[];
  roleKey?: string;
  scopeType?: "ROOT_ADMIN" | "ORGANIZATION" | "PLANT";
  rolePrecedence?: number;
  isRootAdmin?: boolean;
  isGlobal?: boolean;
  organizationId?: string | null;
  orgRoleId?: string | null;
  plantId?: string | null;
  permissions: Record<string, string[]>;
  permissionKeys?: string[];
  allowedModules?: string[];
  allowedActionsByModule?: Record<string, string[]>;
  allowedRoleTargetsForCreate?: string[];
  allowedRoleTargetsForEdit?: string[];
  kpis: PermissionMeKpi[];
  kpiVisibility?: PermissionMeKpi[];
  plantIds: string[];
  accessAllPlants: boolean;
  rbacVersion?: number;
}

export function getPermissionsMe() {
  return httpRequest<ApiResponse<PermissionsMeResponse>>("/permissions/me", { method: "GET" });
}
