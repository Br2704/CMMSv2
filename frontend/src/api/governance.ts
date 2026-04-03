import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface GovernanceOverviewResponse {
  organizationsCount: number;
  plantsCount: number;
  usersCount: number;
  recentlyCreatedOrganizations: Array<{
    id: string;
    name: string;
    code: string | null;
    createdAt: string;
  }>;
  recentlyCreatedPlants: Array<{
    id: string;
    plantCode: string;
    plantName: string;
    organizationId: string;
    createdAt: string;
  }>;
}

export function getGovernanceOverview() {
  return httpRequest<ApiResponse<GovernanceOverviewResponse>>("/governance/overview", { method: "GET" });
}

