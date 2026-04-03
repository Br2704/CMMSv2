import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface BenchmarkPlantStat {
  plantId: string;
  plantName: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  lastValue: number | null;
  assets: Array<{
    assetId: string;
    assetCode: string;
    assetName: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>;
}

export interface BenchmarkCompareResponse {
  assetType: string;
  metric: string;
  from: string;
  to: string;
  plants: BenchmarkPlantStat[];
  ranking: BenchmarkPlantStat[];
  topRankingPlants: BenchmarkPlantStat[];
}

export function listBenchmarkingAssetTypes() {
  return httpRequest<ApiResponse<string[]>>("/benchmarking/asset-types", { method: "GET" });
}

export function compareBenchmarking(params: {
  assetType: string;
  metric: "efficiencyValue" | "energyPerRuntime" | "energyKwh" | "runtimeHours" | "productionOutput";
  window: "7d" | "30d" | "90d" | "custom";
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams({
    assetType: params.assetType,
    metric: params.metric,
    window: params.window,
  });

  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  return httpRequest<ApiResponse<BenchmarkCompareResponse>>(`/benchmarking/compare?${query.toString()}`, { method: "GET" });
}

export function listBenchmarkingAssets(params: { assetType: string; plantId?: string }) {
  const query = new URLSearchParams({ assetType: params.assetType });
  if (params.plantId) query.set("plantId", params.plantId);
  return httpRequest<ApiResponse<Array<{ id: string; code: string; name: string; plantId: string; assetType: string }>>>(
    `/benchmarking/assets?${query.toString()}`,
    { method: "GET" },
  );
}
