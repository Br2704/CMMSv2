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

export interface PlantPerformanceInsight {
  rank: number;
  plantId: string;
  plantName: string;
  avgEfficiency: number;
  energyPerRuntime: number;
  rankingScore: number;
  percentile: number;
  recommendation: string;
  records: number;
}

export interface AssetAnomalyInsight {
  plantId: string;
  plantName: string;
  assetType: string;
  avgEfficiency: number;
  benchmarkMean: number;
  standardDeviation: number;
  anomalyThreshold: number;
  deviationPercent: number;
  recommendation: string;
  records: number;
}

export function getPlantPerformanceInsights(params: { from?: string; to?: string; assetType?: string } = {}) {
  return httpRequest<ApiResponse<{ from: string; to: string; assetType: string | null; plants: PlantPerformanceInsight[] }>>(
    `/insights/plant-performance${toQuery(params as Record<string, string | number | boolean | undefined>)}`,
    { method: "GET" },
  );
}

export function getAssetAnomalies(params: { from?: string; to?: string; assetType?: string } = {}) {
  return httpRequest<ApiResponse<{ from: string; to: string; assetType: string; anomalies: AssetAnomalyInsight[]; benchmarkMean: number; standardDeviation: number }>>(
    `/insights/asset-anomalies${toQuery(params as Record<string, string | number | boolean | undefined>)}`,
    { method: "GET" },
  );
}

