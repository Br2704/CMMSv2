import { httpRequest } from "@/api/http";

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
  controls: Array<{ key: string; status: string; description: string }>;
  configuration: {
    jwtIssuer: string;
    sessionMaxHours: number;
    captchaThreshold: number;
    lockoutThreshold: number;
    requestSignatureEnabled: boolean;
    smtpConfigured: boolean;
    securityAlertEmailsConfigured: boolean;
  };
}

export async function fetchSecurityDashboard(): Promise<SecurityDashboardResponse> {
  const response = await httpRequest<{ success: true; data: SecurityDashboardResponse }>("/security/dashboard");
  return response.data;
}

export async function fetchSecurityCompliance(): Promise<SecurityComplianceResponse> {
  const response = await httpRequest<{ success: true; data: SecurityComplianceResponse }>("/security/compliance");
  return response.data;
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

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  const response = await httpRequest<{ success: true; data: AuditLogRecord[] }>("/security/audit-logs?page=1&limit=100");
  return response.data;
}
