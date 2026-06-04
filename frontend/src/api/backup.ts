import { getApiBaseUrl, httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface BackupHistory {
  id: string;
  name: string;
  type: string;
  status: string;
  sizeBytes: number;
  createdAt: string;
  isEncrypted: boolean;
  initiatedBy?: { name: string; email: string };
  progressPercent?: number;
}

export interface BackupHistoryResponse {
  backups: BackupHistory[];
  total: number;
  page: number;
  limit: number;
}

export interface BackupJobStatusResponse {
  backup: BackupHistory;
}

export interface DeleteJobStatusResponse {
  jobId: string;
  state: string;
  progress: number;
  attemptsMade: number;
  failedReason: string | null;
  returnValue: unknown;
}

export interface CreateBackupInput {
  name: string;
  description?: string;
  type: string;
  isEncrypted?: boolean;
  isCompressed?: boolean;
}

export async function listBackups(page = 1, limit = 10): Promise<ApiResponse<BackupHistoryResponse>> {
  return httpRequest<ApiResponse<BackupHistoryResponse>>(`/backup?page=${page}&limit=${limit}`, { method: "GET" });
}

export async function getBackupStatus(backupId: string): Promise<ApiResponse<BackupJobStatusResponse>> {
  return httpRequest<ApiResponse<BackupJobStatusResponse>>(`/backup/${backupId}/status`, { method: "GET" });
}

export async function createBackup(input: CreateBackupInput): Promise<ApiResponse<any>> {
  return httpRequest<ApiResponse<any>>("/backup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getBackupDownloadUrl(backupId: string): string {
  return `${getApiBaseUrl()}/backup/${backupId}/download`;
}

export async function restoreFromBackup(formData: FormData): Promise<ApiResponse<any>> {
  return httpRequest<ApiResponse<any>>("/backup/restore", {
    method: "POST",
    body: formData as any,
  });
}

export async function deleteAllData(scope: "ALL" | "ORGANIZATION" | "PLANT", params: { organizationId?: string; plantId?: string } = {}): Promise<ApiResponse<any>> {
  const body = JSON.stringify({ scope, ...params });
  return httpRequest<ApiResponse<any>>("/backup/delete-all", {
    method: "POST",
    body,
    timeoutMs: 30000,
  });
}

export async function getDeleteJobStatus(jobId: string): Promise<ApiResponse<DeleteJobStatusResponse>> {
  return httpRequest<ApiResponse<DeleteJobStatusResponse>>(`/backup/delete-all/${jobId}/status`, { method: "GET" });
}
