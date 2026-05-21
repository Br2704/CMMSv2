import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface SafetyMetric {
  id: string;
  metricName: string;
  category: string;
  unit: string | null;
  targetValue: string | null;
  aggregationMethod: string;
  plantId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SafetyIncident {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  reportedBy: string;
  reportedAt: string;
  plantId: string;
  [key: string]: unknown;
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
export function getSafetyIncident(id: string) {
  return httpRequest<ApiResponse<SafetyIncident>>(`/safety/${id}`, { method: "GET" });
}
export function createSafetyIncident(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyIncident>>("/safety/incidents", { method: "POST", body: JSON.stringify(payload) });
}
export function updateSafetyIncident(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<SafetyIncident>>(`/safety/incidents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
