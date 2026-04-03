import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export type SafetyIncident = Record<string, unknown>;
export type SafetyMetric = Record<string, unknown>;

export function listSafetyIncidents(params: ListParams = {}) {
  return httpRequest<ApiListResponse<SafetyIncident>>(`/safety/incidents${toQueryString(params)}`, { method: "GET" });
}
export function getSafetyIncident(id: string) {
  return httpRequest<ApiResponse<SafetyIncident>>(`/safety/${id}`, { method: "GET" });
}
export function createSafetyIncident(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyIncident>>("/safety/incidents", { method: "POST", body: JSON.stringify(payload) });
}
export function updateSafetyIncident(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyIncident>>(`/safety/incidents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function listSafetyMetrics(params: ListParams = {}) {
  return httpRequest<ApiListResponse<SafetyMetric>>(`/safety/metrics${toQueryString(params)}`, { method: "GET" });
}
export function createSafetyMetric(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyMetric>>("/safety/metrics", { method: "POST", body: JSON.stringify(payload) });
}
export function updateSafetyMetric(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyMetric>>(`/safety/metrics/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
