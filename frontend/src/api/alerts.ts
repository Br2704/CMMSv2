import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface AlertConfig {
  id: string;
  plantId: string | null;
  assetType: string | null;
  metricKey: string;
  thresholdValue: string | number;
  comparisonType: ">" | "<" | ">=" | "<=";
  severity: AlertSeverity;
  notifyRoles: string[];
  isActive: boolean;
  version: number;
}

export interface AlertLog {
  id: string;
  plantId: string;
  assetId: string | null;
  metricKey: string;
  actualValue: string | number;
  thresholdValue: string | number;
  comparisonType: ">" | "<" | ">=" | "<=";
  severity: AlertSeverity;
  status: AlertStatus;
  message: string | null;
  triggeredAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  version: number;
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listAlertConfigs(params: ListParams & { plantId?: string } = {}) {
  return httpRequest<ApiListResponse<AlertConfig>>(`/alerts/config${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function createAlertConfig(payload: Partial<AlertConfig>) {
  return httpRequest<ApiResponse<AlertConfig>>("/alerts/config", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAlertConfig(id: string, payload: Partial<AlertConfig>) {
  return httpRequest<ApiResponse<AlertConfig>>(`/alerts/config/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteAlertConfig(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/alerts/config/${id}`, { method: "DELETE" });
}

export function listAlerts(params: ListParams & { plantId?: string; status?: AlertStatus; severity?: AlertSeverity } = {}) {
  return httpRequest<ApiListResponse<AlertLog>>(`/alerts/log${toQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function acknowledgeAlert(id: string, version?: number) {
  return httpRequest<ApiResponse<AlertLog>>(`/alerts/log/${id}/acknowledge`, {
    method: "PATCH",
    body: JSON.stringify(version ? { version } : {}),
  });
}

export function resolveAlert(id: string, version?: number) {
  return httpRequest<ApiResponse<AlertLog>>(`/alerts/log/${id}/resolve`, {
    method: "PATCH",
    body: JSON.stringify(version ? { version } : {}),
  });
}

export async function exportAlertsCsv(params: { plantId?: string; status?: AlertStatus; severity?: AlertSeverity } = {}) {
  const query = toQuery(params as Record<string, string | number | boolean | undefined>);
  const response = await fetch(`${getApiBaseUrl()}/alerts/export${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStoredAccessToken() || ""}`,
    },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to export alerts CSV");
  }
  return response.blob();
}
