import { httpRequest } from "@/api/http";
import type { Asset } from "@/api/assets";
import type { Department } from "@/api/departments";
import type { MachineModule } from "@/api/modules";
import type { Plant } from "@/api/plants";
import type { ApiResponse } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface OrganizationNode {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterDataHierarchyModuleNode {
  module: MachineModule;
  assets: Asset[];
}

export interface MasterDataHierarchyDepartmentNode {
  department: Department;
  modules: MasterDataHierarchyModuleNode[];
}

export interface MasterDataHierarchyPlantNode {
  plant: Plant;
  departments: MasterDataHierarchyDepartmentNode[];
}

export interface MasterDataHierarchyOrganizationNode {
  organization: OrganizationNode;
  plants: MasterDataHierarchyPlantNode[];
}

export interface MasterDataGraph {
  organizations: OrganizationNode[];
  plants: Plant[];
  departments: Department[];
  modules: MachineModule[];
  assets: Asset[];
  hierarchy: MasterDataHierarchyOrganizationNode[];
}

export interface MasterDataGraphParams {
  plantId?: string;
  includeInactive?: boolean;
}

export function getMasterDataGraph(params: MasterDataGraphParams = {}) {
  return httpRequest<ApiResponse<MasterDataGraph>>(`/master-data/graph${toQueryString(params)}`, { method: "GET" });
}
