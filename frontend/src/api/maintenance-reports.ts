import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface MaintenanceReport {
  id: string;
  workOrderId: string;
  woNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  assetCategory: string | null;
  plantId: string;
  plantName: string;
  departmentId: string | null;
  departmentName: string | null;
  area: string | null;
  line: string | null;
  raisedBy: string | null;
  raisedByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  closureDate: string;
  issueTitle: string | null;
  problemDescription: string | null;
  actualFailureCategory: string | null;
  failureCode: string | null;
  rootCause: string | null;
  subRootCause: string | null;
  operatorFault: boolean;
  repeatFailure: boolean;
  amcCovered: boolean;
  breakdownType: string | null;
  initialAssessment: string | null;
  actualCorrectiveAction: string | null;
  preventiveRecommendation: string | null;
  followUpRequired: boolean;
  followUpTeamId: string | null;
  whyWhyAnalysis: Record<string, string> | null;
  technicianRemarks: string | null;
  closureRemarks: string | null;
  startTime: string | null;
  responseTime: number;
  openTime: number;
  completionTime: string | null;
  approvalTime: string | null;
  totalDowntime: number;
  actualRepairTime: number;
  waitingTime: number;
  manpowerUsed: string | null;
  manpowerCount: number;
  spareConsumption: Array<Record<string, any>> | null;
  totalSpareCost: string;
  outsideVendorInvolved: boolean;
  attachments: Array<Record<string, any>> | null;
  createdAt: string;
  updatedAt: string;
}

export function listMaintenanceReports(params: ListParams & { plantId?: string; search?: string } = {}) {
  return httpRequest<ApiListResponse<MaintenanceReport>>(`/maintenance-reports${toQueryString(params)}`, { method: "GET" });
}

export function getMaintenanceReport(id: string) {
  return httpRequest<ApiResponse<MaintenanceReport>>(`/maintenance-reports/${id}`, { method: "GET" });
}
