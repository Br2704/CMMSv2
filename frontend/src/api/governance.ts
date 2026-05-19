import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface GovernanceOverviewResponse {
  organizationsCount: number;
  plantsCount: number;
  usersCount: number;
  subscriptionStatusCounts: {
    ACTIVE: number;
    TRIAL: number;
    EXPIRING: number;
    EXPIRED: number;
  };
  recentlyCreatedOrganizations: Array<{
    id: string;
    name: string;
    code: string | null;
    createdAt: string;
    plantsCount: number;
    usersCount: number;
  }>;
  recentlyCreatedPlants: Array<{
    id: string;
    plantCode: string;
    plantName: string;
    organizationId: string;
    createdAt: string;
    organizationName: string;
  }>;
}

export function getGovernanceOverview() {
  return httpRequest<ApiResponse<GovernanceOverviewResponse>>("/governance/overview", { method: "GET" });
}

