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

export interface AssetRiskResponse {
  assetId: string;
  healthScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  failureProbability: number;
  predictedFailureWindow: string;
  recommendation: string;
  diagnostics: Record<string, unknown>;
}

export function getAssetRisk(params: { assetId: string; from?: string; to?: string }) {
  return httpRequest<ApiResponse<AssetRiskResponse>>(`/predictive/asset-risk${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function listHighRiskAssets(params: { plantId?: string; limit?: number; from?: string; to?: string } = {}) {
  return httpRequest<ApiResponse<Array<Record<string, unknown>>>>(`/predictive/high-risk${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

