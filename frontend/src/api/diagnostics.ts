import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface DiagnosticsOverview {
  dbHealth: "UP" | "DOWN";
  checkedAt: string;
  counts: {
    activeAssets: number;
    activeDepartments: number;
    activeModules: number;
  };
  orphanRecordsCount: number;
  orphanBreakdown: Array<{ label: string; count: number }>;
  dataInconsistenciesCount: number;
  inconsistenciesBreakdown: Array<{ label: string; count: number }>;
}

export function getSystemDiagnostics() {
  return httpRequest<ApiResponse<DiagnosticsOverview>>("/diagnostics/system-health", { method: "GET" });
}

export function getReconciliationDiagnostics() {
  return httpRequest<ApiResponse<{ totalFlags: number; flags: Array<Record<string, unknown>> }>>("/diagnostics/reconciliation", {
    method: "GET",
  });
}

