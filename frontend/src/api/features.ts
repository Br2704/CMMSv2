import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export type FeatureMap = Record<string, boolean>;

export interface FeaturesMeResponse {
  organizationId: string | null;
  enabled?: string[];
  features?: FeatureMap;
}

export function getFeaturesMe() {
  return httpRequest<ApiResponse<FeaturesMeResponse>>("/features/me", { method: "GET" });
}

export function getOrganizationFeatures(orgId: string) {
  return httpRequest<ApiResponse<FeatureMap>>(`/orgs/${orgId}/features`, { method: "GET" });
}

export function updateOrganizationFeatures(orgId: string, payload: FeatureMap) {
  return httpRequest<ApiResponse<FeatureMap>>(`/orgs/${orgId}/features`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
