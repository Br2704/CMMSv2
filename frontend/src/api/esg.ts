import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export type EsgSectionKey = "energy" | "water" | "emissions" | "waste" | "production";
export type EsgCategoryKey = "ENERGY" | "WATER" | "EMISSIONS" | "WASTE" | "PRODUCTION" | "RENEWABLES" | "ALL";
export type EsgWorkbookCategory = "PRODUCTION" | "ENERGY" | "EMISSIONS" | "WATER" | "WASTE" | "MATERIALS" | "RENEWABLES";

export interface EsgKpiMaster {
  id: string;
  kpiName: string;
  kpiCategory: string;
  formula: string | null;
  unit: string | null;
  description: string | null;
  status: "ACTIVE" | "INACTIVE" | string;
}

export interface EsgEmissionFactor {
  id: string;
  energyType: string;
  unit: string;
  co2Factor: string | number;
  source: string | null;
  effectiveDate: string;
  isActive: boolean;
}

export interface EsgTarget {
  id: string;
  plantId: string;
  year: number;
  targetEnergyReduction: string | number | null;
  targetWaterReduction: string | number | null;
  targetEmissionReduction: string | number | null;
  targetWasteReduction: string | number | null;
  renewableTarget: string | number | null;
}

export interface EsgAuthorizedUser {
  id: string;
  plantId: string;
  userId: string;
  esgCategory: EsgCategoryKey | string;
  createdAt: string;
  userName?: string | null;
  userEmail?: string | null;
}

export interface EsgKpiResult {
  id: string;
  plantId: string;
  year: number;
  month: number;
  kpiName: string;
  kpiCategory: string;
  value: string;
  unit: string | null;
  targetValue: string | null;
  status: string;
  variance: string | null;
}

export interface EsgEnergyData {
  id?: string;
  plantId?: string | null;
  year: number;
  month: number;
  gridElectricityKwh: number;
  dieselConsumptionLitre: number;
  coalConsumption: number;
  gasConsumption: number;
  steamConsumption: number;
  solarGeneration: number;
  windGeneration: number;
  greenEnergyPurchase: number;
  totalEnergy?: string;
  renewableEnergyPercentage?: string;
  energyIntensity?: string | null;
  isLocked?: boolean;
}

export interface EsgWaterData {
  id?: string;
  plantId?: string | null;
  year: number;
  month: number;
  freshWaterIntake: number;
  groundWater: number;
  municipalWater: number;
  recycledWater: number;
  rainWater: number;
  waterDischarge: number;
  totalWaterConsumption?: string;
  waterIntensity?: string | null;
  recycledWaterPercentage?: string;
  isLocked?: boolean;
}

export interface EsgEmissionData {
  id?: string;
  plantId?: string | null;
  year: number;
  month: number;
  scope1Emissions: number;
  scope2Emissions: number;
  scope3Emissions: number;
  boilerNox: number;
  boilerSox: number;
  boilerPm: number;
  stackEmission: number;
  totalGhgEmissions?: string;
  emissionIntensity?: string | null;
  isLocked?: boolean;
}

export interface EsgWasteData {
  id?: string;
  plantId?: string | null;
  year: number;
  month: number;
  hazardousWaste: number;
  nonHazardousWaste: number;
  recycledWaste: number;
  landfillWaste: number;
  incineratedWaste: number;
  totalWaste?: string;
  recyclingRate?: string;
  wasteIntensity?: string | null;
  isLocked?: boolean;
}

export interface EsgProductionData {
  id?: string;
  plantId?: string | null;
  year: number;
  month: number;
  productionQuantity: number;
  operatingHours: number;
  machineUtilization: number;
  isLocked?: boolean;
}

export interface EsgAccess {
  plantId: string | null;
  canEnterData: boolean;
  categories: string[];
  readOnly: boolean;
}

export interface EsgDashboardResponse {
  plantId: string;
  year: number;
  month: number;
  readOnly: boolean;
  authorizedCategories: string[];
  target: EsgTarget | null;
  current: {
    energy: EsgEnergyData | null;
    water: EsgWaterData | null;
    emissions: EsgEmissionData | null;
    waste: EsgWasteData | null;
    production: EsgProductionData | null;
    kpis: EsgKpiResult[];
  };
  trends: EsgKpiResult[];
}

export interface EsgDataResponse {
  plantId: string;
  year: number;
  month: number;
  target: EsgTarget | null;
  energy: EsgEnergyData | null;
  water: EsgWaterData | null;
  emissions: EsgEmissionData | null;
  waste: EsgWasteData | null;
  production: EsgProductionData | null;
  kpis: EsgKpiResult[];
  access: {
    canEnterData: boolean;
    categories: string[];
  };
}

export interface EsgAnalyticsRow {
  plantId: string;
  plantName: string;
  [key: string]: string | number;
}

export interface EsgWorkbookMetricDefinition {
  code: string;
  label: string;
  category: EsgWorkbookCategory;
  unit: string;
  targetAllowed: boolean;
}

export interface EsgWorkbookDailyEntry {
  id: string;
  plantId: string;
  entryDate: string;
  year: number;
  month: number;
  metricCode: string;
  metricLabel: string;
  category: EsgWorkbookCategory;
  unit: string | null;
  value: string;
  notes: string | null;
}

export interface EsgWorkbookSummaryRow {
  metricCode: string;
  metricLabel: string;
  category: EsgWorkbookCategory;
  unit: string | null;
  value: string;
  plantTargetValue?: string | null;
  organizationTargetValue?: string | null;
  status: string;
}

export interface EsgWorkbookSummaryResponse {
  plantId: string;
  organizationId: string | null;
  year: number;
  month: number;
  rows: EsgWorkbookSummaryRow[];
}

export interface EsgWorkbookOrganizationSummaryResponse {
  organizationId: string | null;
  year: number;
  month: number;
  rows: EsgWorkbookSummaryRow[];
  plantBreakdown: Array<{
    plantId: string;
    plantName: string;
    rows: EsgWorkbookSummaryRow[];
  }>;
}

export interface EsgWorkbookPlantTarget {
  id: string;
  plantId: string;
  year: number;
  metricCode: string;
  metricLabel: string;
  category: EsgWorkbookCategory;
  unit: string | null;
  targetValue: string;
  notes: string | null;
}

export interface EsgWorkbookOrganizationTarget {
  id: string;
  organizationId: string;
  year: number;
  metricCode: string;
  metricLabel: string;
  category: EsgWorkbookCategory;
  unit: string | null;
  targetValue: string;
  notes: string | null;
}

export function getEsgAccess(params: { plantId?: string | null } = {}) {
  return httpRequest<ApiResponse<EsgAccess>>(`/esg/access${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function listEsgMasterKpis(params: ListParams = {}) {
  return httpRequest<ApiListResponse<EsgKpiMaster>>(`/esg/master/kpis${toQueryString(params)}`, { method: "GET" });
}

export function createEsgMasterKpi(payload: Partial<EsgKpiMaster>) {
  return httpRequest<ApiResponse<EsgKpiMaster>>("/esg/master/kpis", { method: "POST", body: JSON.stringify(payload) });
}

export function updateEsgMasterKpi(id: string, payload: Partial<EsgKpiMaster>) {
  return httpRequest<ApiResponse<EsgKpiMaster>>(`/esg/master/kpis/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function listEsgEmissionFactors() {
  return httpRequest<ApiResponse<EsgEmissionFactor[]>>("/esg/master/emission-factors", { method: "GET" });
}

export function createEsgEmissionFactor(payload: Partial<EsgEmissionFactor>) {
  return httpRequest<ApiResponse<EsgEmissionFactor>>("/esg/master/emission-factors", { method: "POST", body: JSON.stringify(payload) });
}

export function updateEsgEmissionFactor(id: string, payload: Partial<EsgEmissionFactor>) {
  return httpRequest<ApiResponse<EsgEmissionFactor>>(`/esg/master/emission-factors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function listEsgTargets(params: { plantId?: string; year?: number } = {}) {
  return httpRequest<ApiResponse<EsgTarget[]>>(`/esg/master/targets${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function saveEsgTarget(payload: Partial<EsgTarget>) {
  return httpRequest<ApiResponse<EsgTarget>>("/esg/master/targets", { method: "POST", body: JSON.stringify(payload) });
}

export function listEsgAuthorizedUsers(params: { plantId?: string } = {}) {
  return httpRequest<ApiResponse<EsgAuthorizedUser[]>>(`/esg/master/authorized-users${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function createEsgAuthorizedUser(payload: Partial<EsgAuthorizedUser>) {
  return httpRequest<ApiResponse<EsgAuthorizedUser>>("/esg/master/authorized-users", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteEsgAuthorizedUser(id: string) {
  return httpRequest<ApiResponse<{ id: string; deleted: boolean }>>(`/esg/master/authorized-users/${id}`, { method: "DELETE" });
}

export function getEsgMasterAnalytics(params: { year: number; month: number }) {
  return httpRequest<ApiResponse<EsgAnalyticsRow[]>>(`/esg/master/analytics${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function getEsgDashboard(params: { plantId?: string | null; year?: number; month?: number } = {}) {
  return httpRequest<ApiResponse<EsgDashboardResponse>>(`/esg/dashboard${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function getEsgData(params: { plantId?: string | null; year: number; month: number }) {
  return httpRequest<ApiResponse<EsgDataResponse>>(`/esg/data${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function saveEsgEnergyData(payload: EsgEnergyData) {
  return httpRequest<ApiResponse<EsgEnergyData>>("/esg/data/energy", { method: "PUT", body: JSON.stringify(payload) });
}

export function saveEsgWaterData(payload: EsgWaterData) {
  return httpRequest<ApiResponse<EsgWaterData>>("/esg/data/water", { method: "PUT", body: JSON.stringify(payload) });
}

export function saveEsgEmissionData(payload: EsgEmissionData) {
  return httpRequest<ApiResponse<EsgEmissionData>>("/esg/data/emissions", { method: "PUT", body: JSON.stringify(payload) });
}

export function saveEsgWasteData(payload: EsgWasteData) {
  return httpRequest<ApiResponse<EsgWasteData>>("/esg/data/waste", { method: "PUT", body: JSON.stringify(payload) });
}

export function saveEsgProductionData(payload: EsgProductionData) {
  return httpRequest<ApiResponse<EsgProductionData>>("/esg/data/production", { method: "PUT", body: JSON.stringify(payload) });
}

export function lockEsgSection(payload: { plantId?: string | null; year: number; month: number; section: EsgSectionKey; locked: boolean }) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/esg/data/lock", { method: "POST", body: JSON.stringify(payload) });
}

export function getEsgAnalytics(params: { plantId?: string | null; year: number; month: number }) {
  return httpRequest<ApiResponse<EsgAnalyticsRow[]>>(`/esg/analytics${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function getEsgReport(params: { plantId?: string | null; year: number; month?: number; reportType?: string; format?: "json" | "csv" | "pdf" }) {
  return httpRequest<ApiResponse<EsgAnalyticsRow[]>>(`/esg/reports${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function getEsgWorkbookCatalog() {
  return httpRequest<ApiResponse<{ inputMetrics: EsgWorkbookMetricDefinition[]; derivedMetrics: EsgWorkbookMetricDefinition[] }>>("/esg/workbook/catalog", { method: "GET" });
}

export function listEsgWorkbookDailyEntries(params: { plantId?: string | null; year: number; month: number; category?: EsgWorkbookCategory }) {
  return httpRequest<ApiResponse<EsgWorkbookDailyEntry[]>>(`/esg/workbook/daily${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function saveEsgWorkbookDailyEntries(payload: { plantId?: string | null; entryDate: string; entries: Array<{ metricCode: string; value: number; notes?: string | null }> }) {
  return httpRequest<ApiResponse<{ entries: EsgWorkbookDailyEntry[]; summary: unknown[] }>>("/esg/workbook/daily", { method: "POST", body: JSON.stringify(payload) });
}

export function getEsgWorkbookSummary(params: { plantId?: string | null; year: number; month: number }) {
  return httpRequest<ApiResponse<EsgWorkbookSummaryResponse>>(`/esg/workbook/summary${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function getEsgWorkbookOrganizationSummary(params: { year: number; month: number }) {
  return httpRequest<ApiResponse<EsgWorkbookOrganizationSummaryResponse>>(`/esg/workbook/organization-summary${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function listEsgWorkbookPlantTargets(params: { plantId?: string; year?: number } = {}) {
  return httpRequest<ApiResponse<EsgWorkbookPlantTarget[]>>(`/esg/master/workbook-targets/plants${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function saveEsgWorkbookPlantTarget(payload: { plantId: string; year: number; metricCode: string; targetValue: number; notes?: string | null }) {
  return httpRequest<ApiResponse<EsgWorkbookPlantTarget>>("/esg/master/workbook-targets/plants", { method: "POST", body: JSON.stringify(payload) });
}

export function listEsgWorkbookOrganizationTargets(params: { organizationId?: string; year?: number } = {}) {
  return httpRequest<ApiResponse<EsgWorkbookOrganizationTarget[]>>(`/esg/master/workbook-targets/organization${toQueryString(params as ListParams)}`, { method: "GET" });
}

export function saveEsgWorkbookOrganizationTarget(payload: { organizationId?: string | null; year: number; metricCode: string; targetValue: number; notes?: string | null }) {
  return httpRequest<ApiResponse<EsgWorkbookOrganizationTarget>>("/esg/master/workbook-targets/organization", { method: "POST", body: JSON.stringify(payload) });
}

export async function exportEsgReport(params: { plantId?: string | null; year: number; month?: number; reportType?: string; format: "csv" | "pdf" }) {
  const response = await fetch(`${getApiBaseUrl()}/esg/reports${toQueryString(params as ListParams)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStoredAccessToken() || ""}`,
    },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to export ESG report");
  }
  return response.blob();
}
