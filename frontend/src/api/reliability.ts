import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, ListParams } from "@/api/types";

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export interface ReliabilityMetrics {
  assetId: string;
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  assetType: string;
  from: string;
  to: string;
  failures: number;
  downtimeMinutes: number;
  uptimeMinutes: number;
  mttrMinutes: number;
  mtbfMinutes: number;
  windowMinutes: number;
  eventCount: number;
}

export interface DowntimeEventPayload {
  plantId: string;
  assetId: string;
  workOrderId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  isFailureEvent?: boolean;
  reason?: string | null;
  notes?: string | null;
}

export function getAssetReliability(assetId: string, params: { window?: "7d" | "30d" | "90d" | "custom"; from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.window) query.set("window", params.window);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return httpRequest<ApiResponse<ReliabilityMetrics>>(`/assets/${assetId}/reliability${query.toString() ? `?${query.toString()}` : ""}`, { method: "GET" });
}

export function listReliabilityLeaderboard(
  params: ListParams & { window?: "7d" | "30d" | "90d" | "custom"; from?: string; to?: string; assetType?: string } = {},
) {
  return httpRequest<ApiListResponse<Record<string, unknown>>>(`/assets/reliability/leaderboard${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, { method: "GET" });
}

export function createDowntimeEvent(payload: DowntimeEventPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/downtime-events", { method: "POST", body: JSON.stringify(payload) });
}

export function updateDowntimeEvent(id: string, payload: Partial<DowntimeEventPayload>) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/downtime-events/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function recomputeReliability(payload: { window?: "7d" | "30d" | "90d" | "custom"; from?: string; to?: string; plantId?: string } = {}) {
  return httpRequest<ApiResponse<{ saved: number; from: string; to: string }>>("/reliability/recompute", { method: "POST", body: JSON.stringify(payload) });
}

export async function exportReliabilityCsv(
  params: {
    scope?: "plant" | "all";
    plantId?: string;
    departmentId?: string;
    moduleId?: string;
    assetType?: string;
    window?: "7d" | "30d" | "90d" | "custom";
    from?: string;
    to?: string;
  } = {},
): Promise<Blob> {
  const query = buildQuery(params as Record<string, string | number | boolean | undefined>);
  const response = await fetch(`${getApiBaseUrl()}/exports/reliability${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStoredAccessToken() || ""}`,
    },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to export reliability CSV");
  }
  return response.blob();
}
