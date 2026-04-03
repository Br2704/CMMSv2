import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface SystemHealth {
  status: "ok" | "warning";
  uptimeSeconds: number;
  dbLatencyMs: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  hierarchyConsistencyIssues: number;
}

export interface SystemPerformance {
  requestCountLast24Hours: number;
  apiFailuresLast24Hours: number;
  activeUsers: number;
  recentSecurityEvents: number;
}

export interface SystemErrors {
  apiErrors: Array<Record<string, unknown>>;
  securityAlerts: Array<Record<string, unknown>>;
}

export function getSystemHealth() {
  return httpRequest<ApiResponse<SystemHealth>>("/system/health", { method: "GET" });
}

export function getSystemPerformance() {
  return httpRequest<ApiResponse<SystemPerformance>>("/system/performance", { method: "GET" });
}

export function getSystemErrors() {
  return httpRequest<ApiResponse<SystemErrors>>("/system/errors", { method: "GET" });
}
