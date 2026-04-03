import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ExecutiveOverview {
  from: string;
  to: string;
  assetType: string | null;
  totalPlants: number;
  totalAssets: number;
  totalDowntimeHours: number;
  reliabilityScore: number;
  energyIntensity: number;
  ghgEmissionsTrend: { month: string; totalCo2e: number }[];
  topPerformingPlant: Record<string, unknown> | null;
  worstPerformingPlant: Record<string, unknown> | null;
  plantRanking: Array<Record<string, unknown>>;
  safetyIncidentsSummary: {
    totalIncidents: number;
    criticalIncidents: number;
    avgLostTimeHours: number;
  };
  hrAbsenteeismSummary: unknown;
}

export function getGlobalOperationsOverview(params: { from?: string; to?: string; assetType?: string } = {}) {
  return httpRequest<ApiResponse<ExecutiveOverview>>(`/executive/global-operations${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function getGlobalOperationsDrilldown(params: { plantId: string; from?: string; to?: string; assetType?: string }) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/executive/global-operations/drilldown${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

