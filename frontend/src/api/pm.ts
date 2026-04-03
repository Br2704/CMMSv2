import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface PMTemplate {
  id: string;
  plantId: string | null;
  templateName: string;
  maintenanceType: "PM" | "PD";
  discipline: string | null;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: number;
  estimatedDuration: number;
  checklistTasks: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMTemplatePayload {
  plantId?: string | null;
  templateName: string;
  maintenanceType: "PM" | "PD";
  discipline?: string | null;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: number;
  estimatedDuration: number;
  checklistTasks: string[];
  isActive?: boolean;
}

export interface PMAssetLink {
  id: string;
  templateId: string;
  plantId: string | null;
  departmentId: string | null;
  assetId: string;
  startDate: string;
  assignedTeamId: string | null;
  responsibleUserId: string | null;
  nextDueDate: string;
  lastGeneratedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  template: {
    id: string;
    templateName: string;
    maintenanceType: "PM" | "PD";
    discipline: string | null;
    frequencyType: string;
    frequencyValue: number;
    estimatedDuration: number;
  } | null;
  asset: {
    id: string;
    code: string;
    name: string;
    plantId: string | null;
    departmentId: string | null;
    moduleId: string | null;
  } | null;
  assignedTeam: {
    id: string;
    teamName: string;
  } | null;
  responsibleUser: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface PMAssetLinkPayload {
  templateId: string;
  plantId?: string | null;
  departmentId?: string | null;
  assetId: string;
  startDate: string;
  assignedTeamId?: string | null;
  responsibleUserId?: string | null;
  isActive?: boolean;
}

export interface PMChecklistTaskResult {
  id: string;
  title: string;
  taskStatus: string;
  condition: string;
  remarks: string;
  photos: Array<{ name: string; dataUrl: string }>;
}

export interface PMScheduleChecklist {
  taskSummary?: string;
  maintenanceType?: string;
  discipline?: string | null;
  estimatedDuration?: string;
  dueDate?: string;
  checklistTasks?: PMChecklistTaskResult[];
  spareUsage?: Array<Record<string, unknown>>;
}

export interface PMSchedule {
  id: string;
  pmId: string;
  plantId: string | null;
  assetId: string;
  templateId: string | null;
  templateLinkId: string | null;
  maintenanceType: string;
  discipline: string | null;
  frequency: string;
  frequencyType: string | null;
  frequencyValue: number | null;
  estimatedDuration: number | null;
  checklist: PMScheduleChecklist | string | null;
  assignedTo: string | null;
  assignedTeamId: string | null;
  lastCompleted: string | null;
  nextDue: string;
  completedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  asset: {
    id: string;
    code: string;
    name: string;
    assetType?: string | null;
    plantId: string | null;
    departmentId: string | null;
    moduleId: string | null;
  } | null;
  template: {
    id: string;
    templateName: string;
    maintenanceType: string;
    discipline: string | null;
    frequencyType: string;
    frequencyValue: number;
    estimatedDuration: number;
  } | null;
  assignedTeam: {
    id: string;
    teamName: string;
    discipline: string;
  } | null;
  responsibleUser: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export function listPMSchedules(params: ListParams & { assetId?: string; templateId?: string; status?: string } = {}) {
  return httpRequest<ApiListResponse<PMSchedule>>(`/pm-schedules${toQueryString(params)}`, { method: "GET" });
}

export function getPMSchedule(id: string) {
  return httpRequest<ApiResponse<PMSchedule>>(`/pm-schedules/${id}`, { method: "GET" });
}

export function createPMSchedule(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<PMSchedule>>("/pm-schedules", { method: "POST", body: JSON.stringify(payload) });
}

export function updatePMSchedule(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<PMSchedule>>(`/pm-schedules/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deletePMSchedule(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/pm-schedules/${id}`, { method: "DELETE" });
}

export function listPMTemplates(params: ListParams = {}) {
  return httpRequest<ApiListResponse<PMTemplate>>(`/pm-templates${toQueryString(params)}`, { method: "GET" });
}

export function createPMTemplate(payload: PMTemplatePayload) {
  return httpRequest<ApiResponse<PMTemplate>>("/pm-templates", { method: "POST", body: JSON.stringify(payload) });
}

export function updatePMTemplate(id: string, payload: Partial<PMTemplatePayload>) {
  return httpRequest<ApiResponse<PMTemplate>>(`/pm-templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deletePMTemplate(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/pm-templates/${id}`, { method: "DELETE" });
}

export function listPMAssetLinks(params: ListParams & { templateId?: string; assetId?: string } = {}) {
  return httpRequest<ApiListResponse<PMAssetLink>>(`/pm-template-links${toQueryString(params)}`, { method: "GET" });
}

export function createPMAssetLink(payload: PMAssetLinkPayload) {
  return httpRequest<ApiResponse<PMAssetLink>>("/pm-template-links", { method: "POST", body: JSON.stringify(payload) });
}

export function updatePMAssetLink(id: string, payload: Partial<PMAssetLinkPayload>) {
  return httpRequest<ApiResponse<PMAssetLink>>(`/pm-template-links/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deletePMAssetLink(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/pm-template-links/${id}`, { method: "DELETE" });
}
