import { getStoredAccessToken, httpRequest, isCurrentlyRateLimited } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface LogEntry {
  id: string;
  action: string;
  module: string | null;
  method: string | null;
  path: string | null;
  plantId: string | null;
  statusCode: number | null;
  createdAt: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
  userName?: string | null;
  ip?: string | null;
  duration?: number | null;
}

export interface LogTemplate {
  id: string;
  templateName: string;
  description: string | null;
  plantId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LogTemplateField {
  id: string;
  templateId: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  sortOrder: number;
  options: string[] | null;
}

export interface LogTemplateAssignment {
  id: string;
  templateId: string;
  assetId: string;
  shiftId: string | null;
  isActive: boolean;
}

type WebappLogPayload = {
  level: "INFO" | "WARN" | "ERROR";
  action: string;
  message: string;
  path?: string | null;
  plantId?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
};

const recentWebappLogSignatures = new Map<string, number>();

function shouldSkipDuplicateLog(signature: string) {
  const now = Date.now();
  const lastSeen = recentWebappLogSignatures.get(signature) ?? 0;
  recentWebappLogSignatures.set(signature, now);

  for (const [key, value] of recentWebappLogSignatures.entries()) {
    if (now - value > 15_000) {
      recentWebappLogSignatures.delete(key);
    }
  }

  return now - lastSeen < 5_000;
}

export function listLogs(params: ListParams = {}) {
  return httpRequest<ApiListResponse<LogEntry>>(`/logs${toQueryString(params)}`, { method: "GET" });
}
export function getLog(id: string) {
  return httpRequest<ApiResponse<LogEntry>>(`/logs/${id}`, { method: "GET" });
}
export function createLog(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogEntry>>("/logs", { method: "POST", body: JSON.stringify(payload) });
}
export function updateLog(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogEntry>>(`/logs/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteLog(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/logs/${id}`, { method: "DELETE" });
}

export function listLogTemplates(params: ListParams = {}) {
  return httpRequest<ApiListResponse<LogTemplate>>(`/log-templates${toQueryString(params)}`, { method: "GET" });
}

export function createLogTemplate(payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogTemplate>>("/log-templates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateLogTemplate(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogTemplate>>(`/log-templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteLogTemplate(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/log-templates/${id}`, { method: "DELETE" });
}

export function listLogTemplateFields(templateId: string) {
  return httpRequest<ApiResponse<LogTemplateField[]>>(`/log-templates/${templateId}/fields`, { method: "GET" });
}

export function createLogTemplateField(templateId: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogTemplateField>>(`/log-templates/${templateId}/fields`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLogTemplateField(id: string, payload: Record<string, unknown>) {
  return httpRequest<ApiResponse<LogTemplateField>>(`/log-template-fields/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteLogTemplateField(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/log-template-fields/${id}`, { method: "DELETE" });
}

export function listLogTemplateAssignments(templateId?: string) {
  const suffix = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return httpRequest<ApiResponse<LogTemplateAssignment[]>>(`/log-template-assignments${suffix}`, { method: "GET" });
}

export function createLogTemplateAssignment(payload: { templateId: string; userId: string }) {
  return httpRequest<ApiResponse<LogTemplateAssignment>>("/log-template-assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteLogTemplateAssignment(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/log-template-assignments/${id}`, { method: "DELETE" });
}

export function listWebappLogs(params: ListParams = {}) {
  return httpRequest<ApiListResponse<LogEntry>>(`/webapp-logs${toQueryString(params)}`, { method: "GET" });
}

export function createWebappLog(payload: WebappLogPayload) {
  return httpRequest<ApiResponse<{ logged: boolean }>>("/webapp-logs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function queueWebappLog(payload: WebappLogPayload) {
  if (!getStoredAccessToken()) {
    return;
  }
  if (isCurrentlyRateLimited()) {
    return;
  }

  const signature = JSON.stringify([
    payload.level,
    payload.action,
    payload.message,
    payload.path ?? "",
    payload.statusCode ?? "",
  ]);
  if (shouldSkipDuplicateLog(signature)) {
    return;
  }

  void createWebappLog(payload).catch(() => {
    // Ignore client log transport failures to avoid cascading UI errors.
  });
}
