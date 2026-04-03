import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse } from "@/api/types";

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export interface EnergyReadingPayload {
  plantId: string;
  meterId: string;
  capturedAt: string;
  kwh: number;
  demandKw?: number | null;
  notes?: string | null;
}

export interface GhgActivityPayload {
  plantId: string;
  sourceType: "electricity" | "diesel" | "boiler_fuel" | "lpg" | "other";
  quantity: number;
  unit: string;
  periodStart: string;
  periodEnd: string;
  factorKey?: string;
  factorValue?: number;
}

export function listEnergyReadings(params: { plantId?: string; meterId?: string; from?: string; to?: string; page?: number; limit?: number } = {}) {
  return httpRequest<ApiListResponse<Record<string, unknown>>>(`/esg/energy-readings${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function createEnergyReading(payload: EnergyReadingPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/esg/energy-readings", { method: "POST", body: JSON.stringify(payload) });
}

export function listGhgActivity(params: { plantId?: string; sourceType?: string; from?: string; to?: string; page?: number; limit?: number } = {}) {
  return httpRequest<ApiListResponse<Record<string, unknown>>>(`/esg/ghg-activity${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, {
    method: "GET",
  });
}

export function createGhgActivity(payload: GhgActivityPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/esg/ghg-activity", { method: "POST", body: JSON.stringify(payload) });
}

export function getGhgSummary(params: { plantId?: string; from?: string; to?: string } = {}) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/esg/ghg/summary${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, { method: "GET" });
}

export function getEnergySummary(params: { plantId?: string; from?: string; to?: string } = {}) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/esg/energy/summary${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, { method: "GET" });
}

export function getEsgIntensity(params: { plantId?: string; from?: string; to?: string } = {}) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/esg/intensity${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, { method: "GET" });
}

export function getEsgForecast(params: { plantId?: string; from?: string; to?: string; metric?: "co2e" | "kwh" | "energy_intensity" | "emissions_intensity" } = {}) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/esg/forecast${buildQuery(params as Record<string, string | number | boolean | undefined>)}`, { method: "GET" });
}

export function generateEsgReport(payload: { plantId?: string; reportType: "GHG" | "ISO50001" | "Energy"; periodStart: string; periodEnd: string; storagePath?: string | null }) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/esg/reports/generate", { method: "POST", body: JSON.stringify(payload) });
}

async function exportCsv(path: string, params: Record<string, string | number | boolean | undefined>) {
  const query = buildQuery(params);
  const response = await fetch(`${getApiBaseUrl()}${path}${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStoredAccessToken() || ""}`,
    },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to export CSV");
  }
  return response.blob();
}

export function exportGhgCsv(params: { plantId?: string; from?: string; to?: string } = {}) {
  return exportCsv("/exports/esg/ghg", params as Record<string, string | number | boolean | undefined>);
}

export function exportEnergyCsv(params: { plantId?: string; from?: string; to?: string } = {}) {
  return exportCsv("/exports/esg/energy", params as Record<string, string | number | boolean | undefined>);
}

export function exportExecutiveEsgPdf(params: { plantId?: string; from?: string; to?: string } = {}) {
  return exportCsv("/exports/esg/executive-report", params as Record<string, string | number | boolean | undefined>);
}
