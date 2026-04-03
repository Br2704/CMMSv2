import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface AmcContract {
  id: string;
  contractNumber: string;
  contractName: string;
  vendorId: string;
  plantId: string | null;
  contractType: string | null;
  startDate: string;
  endDate: string;
  visitFrequency: string | null;
  responseTimeSla: number | null;
  resolutionTimeSla: number | null;
  contractValue: number | null;
  amount: number | null;
  status: string;
  terms: string | null;
  machineGroups: AmcMachineGroup[];
  notificationSettings: AmcNotificationSettings;
  assetId: string;
  asset?: { id: string; code: string; name: string } | null;
  vendor?: { id: string; code: string; name: string; email: string | null } | null;
  plant?: { id: string; plantCode: string; plantName: string } | null;
  machineIds: string[];
  machines: Array<{ id: string; code: string; name: string; status: string; criticality: string }>;
  vendorUserIds: string[];
  vendorUsers: Array<{ id: string; fullName: string; email: string }>;
  nextVisitDate: string | null;
}

export interface AmcMachineGroup {
  id: string;
  name: string;
  groupType: "MODULE" | "CUSTOM";
  moduleIds: string[];
  assetIds: string[];
  description: string | null;
}

export interface AmcNotificationSettings {
  notifyEmail: boolean;
  notifyInApp: boolean;
  notifyOnVisitScheduled: boolean;
  notifyOnBreakdown: boolean;
  notifyOnRenewal: boolean;
  notifyOnServiceReportSubmitted: boolean;
  notifyOnServiceReportVerified: boolean;
  escalationEmails: string[];
  notifyBeforeDays: number[];
}

export interface AmcContractPayload {
  contractName: string;
  contractNumber?: string;
  vendorId: string;
  plantId?: string | null;
  contractType: string;
  startDate: string;
  endDate: string;
  visitFrequency: string;
  responseTimeSla?: number | null;
  resolutionTimeSla?: number | null;
  contractValue?: number | null;
  status: string;
  machineIds: string[];
  machineGroups?: AmcMachineGroup[];
  vendorUserIds?: string[];
  notificationSettings?: AmcNotificationSettings;
  terms?: string | null;
}

export interface AmcVisit {
  id: string;
  contractId: string;
  assetId: string;
  vendorId: string;
  visitDate: string;
  status: string;
  serviceTaskId: string | null;
  notificationSentAt: string | null;
  contractName: string;
  contractNumber: string;
  assetName: string;
  assetCode: string;
  vendorName: string;
  workOrder: { id: string; woNumber: string; status: string } | null;
  latestReport: { id: string; serviceDate: string; verificationStatus: string } | null;
}

export interface AmcServiceReport {
  id: string;
  visitScheduleId: string | null;
  contractId: string;
  assetId: string;
  vendorId: string;
  workOrderId: string | null;
  serviceDate: string;
  workDone: string;
  partsReplaced: string | null;
  observations: string | null;
  recommendations: string | null;
  nextServiceDate: string | null;
  attachments: string[];
  sourceType: string;
  verificationStatus: string;
  verificationRemarks: string | null;
  verifiedAt: string | null;
  responseTimeMinutes: number | null;
  resolutionTimeMinutes: number | null;
  contractName: string;
  assetName: string;
  assetCode: string;
  vendorName: string;
  visitDate: string | null;
  workOrder: { id: string; woNumber: string; status: string } | null;
  verifiedByUser: { id: string; fullName: string; email: string } | null;
}

export interface AmcDashboard {
  amcCompliance: number;
  pendingVisits: number;
  missedVisits: number;
  vendorResponseTimeHours: number;
  machineAmcCoverage: number;
  activeContracts: number;
}

export interface AmcPortalData {
  assignedMachines: Array<{ id: string; code: string; name: string; status: string; criticality: string }>;
  upcomingVisits: AmcVisit[];
  breakdownRequests: Array<{ id: string; woNumber: string; assetId: string; status: string; problemDescription: string; createdAt: string | null }>;
  serviceHistory: AmcServiceReport[];
}

export interface AssetAmcSummary {
  covered: boolean;
  contract: {
    id: string;
    contractNumber: string;
    contractName: string;
    status: string;
    vendorId: string;
    startDate: string;
    endDate: string;
    visitFrequency: string | null;
  } | null;
  nextVisit: { id: string; visitDate: string; status: string } | null;
  pendingBreakdowns: number;
  recentReports: AmcServiceReport[];
}

export interface AmcQueryParams extends ListParams {
  status?: string;
  contractId?: string;
  assetId?: string;
  verificationStatus?: string;
}

function toAmcQueryString(params: AmcQueryParams = {}) {
  const base = toQueryString(params);
  return base;
}

export function listAmcContracts(params: AmcQueryParams = {}) {
  return httpRequest<ApiListResponse<AmcContract>>(`/amc${toAmcQueryString(params)}`, { method: "GET" });
}

export function getAmcContract(id: string) {
  return httpRequest<ApiResponse<AmcContract>>(`/amc/${id}`, { method: "GET" });
}

export function createAmcContract(payload: AmcContractPayload) {
  return httpRequest<ApiResponse<AmcContract>>("/amc", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAmcContract(id: string, payload: Partial<AmcContractPayload>) {
  return httpRequest<ApiResponse<AmcContract>>(`/amc/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteAmcContract(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/amc/${id}`, { method: "DELETE" });
}

export function getAmcDashboard(params: AmcQueryParams = {}) {
  return httpRequest<ApiResponse<AmcDashboard>>(`/amc/dashboard${toAmcQueryString(params)}`, { method: "GET" });
}

export function getAmcPortal() {
  return httpRequest<ApiResponse<AmcPortalData>>("/amc/portal", { method: "GET" });
}

export function listAmcVisits(params: AmcQueryParams = {}) {
  return httpRequest<ApiListResponse<AmcVisit>>(`/amc/visits${toAmcQueryString(params)}`, { method: "GET" });
}

export function listAmcServiceReports(params: AmcQueryParams = {}) {
  return httpRequest<ApiListResponse<AmcServiceReport>>(`/amc/service-reports${toAmcQueryString(params)}`, { method: "GET" });
}

export function createAmcServiceReport(payload: {
  visitScheduleId?: string | null;
  workOrderId?: string | null;
  serviceDate: string;
  workDone: string;
  partsReplaced?: string | null;
  observations?: string | null;
  recommendations?: string | null;
  nextServiceDate?: string | null;
  attachments?: string[];
}) {
  return httpRequest<ApiResponse<AmcServiceReport>>("/amc/service-reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyAmcServiceReport(id: string, payload: { verificationStatus: "VERIFIED" | "REJECTED"; verificationRemarks?: string | null }) {
  return httpRequest<ApiResponse<AmcServiceReport>>(`/amc/service-reports/${id}/verify`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function generateAmcVisitTask(id: string) {
  return httpRequest<ApiResponse<{ serviceTaskId: string | null }>>(`/amc/visits/${id}/generate-task`, {
    method: "POST",
  });
}

export function getAssetAmcSummary(assetId: string) {
  return httpRequest<ApiResponse<AssetAmcSummary>>(`/amc/assets/${assetId}/summary`, { method: "GET" });
}

export function notifyAmcVendor(payload: { to?: string[]; subject?: string; message?: string }) {
  return httpRequest<ApiResponse<{ sent?: boolean; emailsSent?: number }>>("/amc/notify-vendor", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
