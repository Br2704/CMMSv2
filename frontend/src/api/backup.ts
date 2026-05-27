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
}

export interface BackupHistoryResponse {
  backups: BackupHistory[];
  total: number;
  page: number;
  limit: number;
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
