import { getApiBaseUrl, getStoredAccessToken, httpRequest } from "@/api/http";

export interface SecurityEventRecord {
  id: string;
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  message: string;
  path: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string | null;
  plantId: string | null;
  detectedAt: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  module: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  userId: string | null;
  plantId: string | null;
  createdAt: string;
}

export interface SecurityDashboardResponse {
  openEvents: number;
  criticalEvents: number;
  failedLoginEvents: number;
  auditChangesLast24Hours: number;
  suspiciousIps: Array<{ ipAddress: string; attempts: number }>;
}

export interface SecurityComplianceResponse {
  controls: Array<{
    key: string;
    status: "implemented" | "partial" | "planned";
    isoClause: string;
    description: string;
  }>;
  controlSummary: {
    total: number;
    implemented: number;
    partial: number;
    planned: number;
  };
  score: number;
  maturityLevel: string;
  scope: {
    role: "ROOT_ADMIN" | "SUPERADMIN" | "ADMIN" | null;
    scopeType: "ROOT_ADMIN" | "ORGANIZATION" | "PLANT" | null;
    organizationId: string | null;
    plantIds: string[];
  };
  metrics: {
    openCriticalEvents: number;
    unresolvedHighRiskEvents: number;
    securityEventsLast7Days: number;
    auditChangesLast7Days: number;
    evaluationWindowDays: {
      operational: number;
      trend: number;
    };
    trendBaselineFrom: string;
  };
  configuration: {
    jwtIssuer: string;
    sessionMaxHours: number;
    captchaThreshold: number;
    lockoutThreshold: number;
    requestSignatureEnabled: boolean;
    smtpConfigured: boolean;
    securityAlertEmailsConfigured: boolean;
  };
  recommendations: string[];
}

export type SecurityControlKey = "backup_recovery" | "file_security" | "supplier_security";
export type SecurityReviewResult = "PASS" | "FAIL";
export type SupplierAttestationStatus = "VALID" | "PENDING" | "EXPIRED" | "REJECTED";

export interface SecurityControlOperationsResponse {
  backupRecovery: {
    totalDrills: number;
    passedDrills: number;
    failedDrills: number;
    latestResult: SecurityReviewResult | null;
    lastDrillAt: string | null;
    lastRtoMinutes: number | null;
    lastRpoMinutes: number | null;
  };
  fileSecurity: {
    totalReviews: number;
    passedReviews: number;
    failedReviews: number;
    latestResult: SecurityReviewResult | null;
    lastReviewAt: string | null;
    lastModuleName: string | null;
  };
  supplierSecurity: {
    totalAttestations: number;
    validAttestations: number;
    attentionRequired: number;
    latestStatus: SupplierAttestationStatus | null;
    lastReviewAt: string | null;
    upcomingExpiryCount: number;
    lastVendorName: string | null;
  };
  recent: Array<{
    id: string;
    controlKey: SecurityControlKey;
    status: string;
    summary: string;
    plantId: string | null;
    performedAt: string;
  }>;
}

export interface BackupRecoveryRecordPayload {
  plantId: string;
  performedAt?: string;
  rtoMinutes: number;
  rpoMinutes: number;
  result: SecurityReviewResult;
  notes?: string;
}

export interface FileSecurityRecordPayload {
  plantId: string;
  performedAt?: string;
  moduleName: string;
  result: SecurityReviewResult;
  checks: {
    mimeValidation: boolean;
    sizeLimit: boolean;
    secureStorage: boolean;
    malwareScanning: boolean;
  };
  notes?: string;
}

export interface SupplierSecurityRecordPayload {
  plantId: string;
  performedAt?: string;
  vendorName: string;
  attestationStatus: SupplierAttestationStatus;
  validUntil?: string;
  notes?: string;
}

export interface SecurityCsvDownload {
  blob: Blob;
  fileName: string;
}

export async function fetchSecurityDashboard(): Promise<SecurityDashboardResponse> {
  const response = await httpRequest<{ success: true; data: SecurityDashboardResponse }>("/security/dashboard");
  return response.data;
}

export async function fetchSecurityCompliance(): Promise<SecurityComplianceResponse> {
  const response = await httpRequest<{ success: true; data: SecurityComplianceResponse }>("/security/compliance");
  return response.data;
}

export async function fetchSecurityControlOperations(): Promise<SecurityControlOperationsResponse> {
  const response = await httpRequest<{ success: true; data: SecurityControlOperationsResponse }>("/security/control-operations");
  return response.data;
}

export async function recordBackupRecoveryOperation(payload: BackupRecoveryRecordPayload): Promise<void> {
  await httpRequest("/security/control-operations/backup-recovery", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordFileSecurityOperation(payload: FileSecurityRecordPayload): Promise<void> {
  await httpRequest("/security/control-operations/file-security", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordSupplierSecurityOperation(payload: SupplierSecurityRecordPayload): Promise<void> {
  await httpRequest("/security/control-operations/supplier-security", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function parseFileName(contentDisposition: string | null, fallbackFileName: string): string {
  if (!contentDisposition) return fallbackFileName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackFileName;
}

async function downloadSecurityCsv(path: string, fallbackFileName: string): Promise<SecurityCsvDownload> {
  const headers = new Headers();
  headers.set("Accept", "text/csv");

  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Download failed with status ${response.status}`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // Keep generic message when response is not JSON.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const fileName = parseFileName(response.headers.get("content-disposition"), fallbackFileName);
  return { blob, fileName };
}

export async function fetchSecurityEvents(severity = "ALL"): Promise<SecurityEventRecord[]> {
  const searchParams = new URLSearchParams({ page: "1", limit: "100" });
  if (severity !== "ALL") {
    searchParams.set("severity", severity);
  }
  const response = await httpRequest<{ success: true; data: SecurityEventRecord[] }>(`/security/events?${searchParams.toString()}`);
  return response.data;
}

export async function acknowledgeSecurityEvent(eventId: string): Promise<void> {
  await httpRequest(`/security/events/${eventId}/acknowledge`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export async function downloadSecurityEventsCsv(severity = "ALL"): Promise<SecurityCsvDownload> {
  const params = new URLSearchParams();
  if (severity !== "ALL") {
    params.set("severity", severity);
  }
  const query = params.toString();
  const path = query ? `/security/events/export?${query}` : "/security/events/export";
  return downloadSecurityCsv(path, "security-events.csv");
}

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  const response = await httpRequest<{ success: true; data: AuditLogRecord[] }>("/security/audit-logs?page=1&limit=100");
  return response.data;
}

export async function downloadAuditLogsCsv(): Promise<SecurityCsvDownload> {
  return downloadSecurityCsv("/security/audit-logs/export", "audit-logs.csv");
}
