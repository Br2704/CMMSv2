import { getApiBaseUrl, getStoredAccessToken, getStoredCsrfToken, httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

type ExportFormat = "json" | "csv" | "excel" | "pdf";

async function downloadGateBlob(path: string) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const accessToken = getStoredAccessToken();
  const csrfToken = getStoredCsrfToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || `Request failed with status ${response.status}`);
  }

  return response.blob();
}

export interface PlantSummary {
  id: string;
  plantCode?: string | null;
  plantName?: string | null;
}

export interface Gate {
  id: string;
  gateCode: string;
  gateName: string;
  gateType: string;
  plantId: string | null;
  location: string | null;
  securityUserIds?: string[] | null;
  securityAssignmentsCount?: number;
  isActive: boolean;
  templateCount?: number;
  activeVisitors?: number;
  plant?: PlantSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface GatePayload {
  gateName: string;
  gateType: string;
  plantId?: string | null;
  location?: string | null;
  securityUserIds?: string[];
  isActive?: boolean;
}

export interface GateTemplate {
  id: string;
  gateId: string;
  plantId: string | null;
  templateName: string;
  visitorType: string;
  allowedRoles?: string[] | null;
  frequency?: string | null;
  securityLevel?: string | null;
  departmentId: string | null;
  moduleId: string | null;
  machineId: string | null;
  isActive: boolean;
  fieldCount?: number;
  gate?: Gate | null;
  plant?: PlantSummary | null;
  department?: { id: string; name: string; code?: string | null } | null;
  module?: { id: string; name: string; code?: string | null } | null;
  machine?: { id: string; name: string; code?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GateTemplatePayload {
  gateId: string;
  plantId?: string | null;
  templateName: string;
  visitorType: string;
  allowedRoles?: string[] | null;
  frequency?: string | null;
  securityLevel?: string | null;
  departmentId?: string | null;
  moduleId?: string | null;
  machineId?: string | null;
  isActive?: boolean;
}

export interface GateTemplateUser {
  id: string;
  templateId: string;
  allowedUserType: string;
  departmentId: string | null;
  approvalRequired: boolean;
  department?: { id: string; name: string; code?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GateTemplateUserPayload {
  allowedUserType: string;
  departmentId?: string | null;
  approvalRequired?: boolean;
}

export interface GateTemplateField {
  id: string;
  templateId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  unit: string | null;
  allowedMin: string | null;
  allowedMax: string | null;
  placeholder: string | null;
  fieldGroup?: string | null;
  captureKey?: string | null;
  helpText?: string | null;
  defaultValue?: string | null;
  isEnvironmental?: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GateTemplateFieldPayload {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options?: string[] | null;
  isRequired?: boolean;
  unit?: string | null;
  allowedMin?: string | number | null;
  allowedMax?: string | number | null;
  placeholder?: string | null;
  fieldGroup?: string | null;
  captureKey?: string | null;
  helpText?: string | null;
  defaultValue?: string | null;
  isEnvironmental?: boolean;
  displayOrder?: number;
}

export interface GateEntryFieldValue {
  fieldId?: string | null;
  fieldName?: string | null;
  fieldLabel?: string | null;
  fieldType?: string | null;
  unit?: string | null;
  value?: unknown;
}

export interface GateEntry {
  id: string;
  gateId: string;
  templateId: string | null;
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  machineId: string | null;
  visitorName: string;
  visitorCompany: string | null;
  visitorPhone: string | null;
  visitorType: string;
  purpose: string | null;
  personToMeet: string | null;
  vehicleNumber: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  itemsCarried: string | null;
  vendorName: string | null;
  materialDescription: string | null;
  quantity: string | null;
  gatePassNumber: string | null;
  invoiceNumber: string | null;
  entryData: GateEntryFieldValue[] | null;
  qrCodeValue: string | null;
  duplicateDetected: boolean;
  blacklistAlert: boolean;
  watchlistAlert: boolean;
  entryTime: string;
  exitTime: string | null;
  remarks: string | null;
  exitRemarks: string | null;
  recordedBy: string | null;
  exitApprovedBy: string | null;
  status: string;
  gate?: Gate | null;
  template?: GateTemplate | null;
  plant?: PlantSummary | null;
  recordedByUser?: { id: string; fullName?: string | null; email?: string | null } | null;
  exitApprovedByUser?: { id: string; fullName?: string | null; email?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GateEntryPayload {
  gateId: string;
  templateId?: string | null;
  plantId?: string | null;
  departmentId?: string | null;
  moduleId?: string | null;
  machineId?: string | null;
  visitorName?: string | null;
  visitorCompany?: string | null;
  visitorPhone?: string | null;
  visitorType?: string | null;
  purpose?: string | null;
  personToMeet?: string | null;
  vehicleNumber?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  itemsCarried?: string | null;
  vendorName?: string | null;
  materialDescription?: string | null;
  quantity?: string | number | null;
  gatePassNumber?: string | null;
  invoiceNumber?: string | null;
  remarks?: string | null;
  entryTime?: string | null;
  fieldValues?: GateEntryFieldValue[];
  blacklistAlert?: boolean;
  watchlistAlert?: boolean;
}

export interface GateExitPayload {
  exitTime?: string | null;
  exitMethod?: "MANUAL" | "QR_SCAN" | "GATE_PASS";
  exitApprovedBy?: string | null;
  remarks?: string | null;
}

export interface GateVehicleEntry {
  id: string;
  gateEntryId: string | null;
  gateId: string;
  plantId: string | null;
  templateId: string | null;
  movementType: string;
  vehicleNumber: string | null;
  driverName: string | null;
  driverContact?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
  engineType?: string | null;
  vendorName: string | null;
  materialDescription: string | null;
  quantity: string | null;
  gatePassNumber: string | null;
  invoiceNumber: string | null;
  transportDistanceKm?: string | null;
  transportMode?: string | null;
  loadWeight?: string | null;
  unloadWeight?: string | null;
  idleTimeMinutes?: string | null;
  wasteType?: string | null;
  wasteQuantity?: string | null;
  emissionCategory?: string | null;
  estimatedCo2eKg?: string | null;
  remarks: string | null;
  entryTime: string;
  gate?: Gate | null;
  template?: GateTemplate | null;
  plant?: PlantSummary | null;
}

export interface GateDashboardSummary {
  visitorsToday: number;
  vehiclesEntered: number;
  materialsInward: number;
  materialsOutward: number;
  activeVisitors: number;
  wasteDisposals?: number;
  transportEmissionsKgCo2e?: number;
}

export interface GateMaterialEntry {
  id: string;
  gateEntryId: string | null;
  gateId: string;
  plantId: string | null;
  entryTypeId: string | null;
  materialName: string | null;
  materialCategory: string | null;
  quantity: string | null;
  unitOfMeasurement: string | null;
  vendor: string | null;
  purchaseOrderNumber: string | null;
  gatePassNumber: string | null;
  invoiceNumber: string | null;
  hazardCategory: string | null;
  transportMode: string | null;
  transportDistanceKm: string | null;
  emissionCategory: string | null;
  estimatedCo2eKg: string | null;
  entryTime: string;
  gate?: Gate | null;
  plant?: PlantSummary | null;
  entryType?: GateTemplate | null;
}

export interface GateReportRow {
  gate: string;
  gateCode: string;
  plant: string;
  visitorType: string;
  visitorName: string;
  vehicleNumber: string;
  status: string;
  entryTime: string;
  exitTime: string;
  duplicate: string;
  blacklist: string;
  watchlist: string;
  passId: string;
  transportMode?: string;
  emissionCategory?: string;
  estimatedCo2eKg?: string;
  materialName?: string;
}

export interface GateReportResponse {
  organizationName: string;
  plantName: string;
  reportDate: string;
  rows: GateReportRow[];
  totals: {
    total: number;
    activeVisitors: number;
    vehicles: number;
    blacklistAlerts: number;
    watchlistAlerts: number;
    transportEmissionsKgCo2e?: number;
  };
}

export interface GateSyncStatus {
  configVersion: string | null;
  activityVersion: string | null;
  generatedAt: string;
}

export interface GateListParams extends ListParams {
  gateId?: string;
  templateId?: string;
  visitorType?: string;
  visitorName?: string;
  vehicleNumber?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function listGates(params: ListParams = {}) {
  return httpRequest<ApiListResponse<Gate>>(`/gates${toQueryString(params)}`, { method: "GET" });
}

export function getGate(id: string) {
  return httpRequest<ApiResponse<Gate>>(`/gates/${id}`, { method: "GET" });
}

export function createGate(payload: GatePayload) {
  return httpRequest<ApiResponse<Gate>>("/gates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGate(id: string, payload: Partial<GatePayload>) {
  return httpRequest<ApiResponse<Gate>>(`/gates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteGate(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/gates/${id}`, { method: "DELETE" });
}

export function listGateTemplates(params: GateListParams = {}) {
  return httpRequest<ApiListResponse<GateTemplate>>(`/gate-templates${toQueryString(params)}`, { method: "GET" });
}

export function getGateTemplate(id: string) {
  return httpRequest<ApiResponse<GateTemplate & { fields: GateTemplateField[] }>>(`/gate-templates/${id}`, { method: "GET" });
}

export function createGateTemplate(payload: GateTemplatePayload) {
  return httpRequest<ApiResponse<GateTemplate>>("/gate-templates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGateTemplate(id: string, payload: Partial<GateTemplatePayload>) {
  return httpRequest<ApiResponse<GateTemplate>>(`/gate-templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteGateTemplate(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/gate-templates/${id}`, { method: "DELETE" });
}

export function listGateTemplateFields(templateId: string) {
  return httpRequest<ApiResponse<GateTemplateField[]>>(`/gate-templates/${templateId}/fields`, { method: "GET" });
}

export function createGateTemplateField(templateId: string, payload: GateTemplateFieldPayload) {
  return httpRequest<ApiResponse<GateTemplateField>>(`/gate-templates/${templateId}/fields`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateGateTemplateField(id: string, payload: Partial<GateTemplateFieldPayload>) {
  return httpRequest<ApiResponse<GateTemplateField>>(`/gate-template-fields/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteGateTemplateField(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/gate-template-fields/${id}`, { method: "DELETE" });
}

export function listGateTemplateUsers(templateId: string) {
  return httpRequest<ApiResponse<GateTemplateUser[]>>(`/gate-templates/${templateId}/users`, { method: "GET" });
}

export function createGateTemplateUser(templateId: string, payload: GateTemplateUserPayload) {
  return httpRequest<ApiResponse<GateTemplateUser>>(`/gate-templates/${templateId}/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateGateTemplateUser(id: string, payload: Partial<GateTemplateUserPayload>) {
  return httpRequest<ApiResponse<GateTemplateUser>>(`/gate-template-users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteGateTemplateUser(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/gate-template-users/${id}`, { method: "DELETE" });
}

export function listGateEntries(params: GateListParams = {}) {
  return httpRequest<ApiListResponse<GateEntry>>(`/gate-entries${toQueryString(params)}`, { method: "GET" });
}

export function getGateEntry(id: string) {
  return httpRequest<ApiResponse<GateEntry>>(`/gate-entries/${id}`, { method: "GET" });
}

export function createGateEntry(payload: GateEntryPayload) {
  return httpRequest<ApiResponse<GateEntry>>("/gate-entries", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGateEntry(id: string, payload: Partial<GateEntryPayload> & { status?: string; duplicateDetected?: boolean }) {
  return httpRequest<ApiResponse<GateEntry>>(`/gate-entries/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function exitGateEntry(id: string, payload: GateExitPayload) {
  return httpRequest<ApiResponse<GateEntry>>(`/gate-entries/${id}/exit`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteGateEntry(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/gate-entries/${id}`, { method: "DELETE" });
}

export function getGatePass(token: string) {
  return httpRequest<ApiResponse<GateEntry>>(`/gate-passes/${encodeURIComponent(token)}`, { method: "GET" });
}

export function exitGatePass(token: string, payload: GateExitPayload) {
  return httpRequest<ApiResponse<GateEntry>>(`/gate-passes/${encodeURIComponent(token)}/exit`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listGateVehicleEntries(params: GateListParams = {}) {
  return httpRequest<ApiListResponse<GateVehicleEntry>>(`/gate-vehicle-entries${toQueryString(params)}`, { method: "GET" });
}

export function listGateMaterialEntries(params: GateListParams = {}) {
  return httpRequest<ApiListResponse<GateMaterialEntry>>(`/gate-material-entries${toQueryString(params)}`, { method: "GET" });
}

export function getGateSyncStatus(params: Pick<ListParams, "plantId"> = {}) {
  return httpRequest<ApiResponse<GateSyncStatus>>(`/gate-sync-status${toQueryString(params)}`, { method: "GET" });
}

export function getGateDashboardSummary(params: Pick<ListParams, "plantId"> = {}) {
  return httpRequest<ApiResponse<GateDashboardSummary>>(`/gate-dashboard/summary${toQueryString(params)}`, { method: "GET" });
}

export function getGateReport(params: GateListParams & { format?: "json" }) {
  return httpRequest<ApiResponse<GateReportResponse>>(`/gate-reports${toQueryString(params)}`, { method: "GET" });
}

export function downloadGateReport(params: GateListParams & { format: ExportFormat }) {
  return downloadGateBlob(`/gate-reports${toQueryString(params)}`);
}
