import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Clock3, Download, RefreshCw, ShieldAlert, Siren, Verified } from "lucide-react";
import {
  acknowledgeSecurityEvent,
  downloadAuditLogsCsv,
  downloadSecurityEventsCsv,
  fetchAuditLogs,
  fetchSecurityCompliance,
  fetchSecurityControlOperations,
  fetchSecurityDashboard,
  fetchSecurityEvents,
  recordBackupRecoveryOperation,
  recordFileSecurityOperation,
  recordSupplierSecurityOperation,
  type AuditLogRecord,
  type SecurityComplianceResponse,
  type SecurityControlOperationsResponse,
  type SecurityDashboardResponse,
  type SecurityEventRecord,
  type SecurityReviewResult,
  type SupplierAttestationStatus,
} from "@/api/security";
import { listPlants } from "@/api/plants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { isSuperAdmin, useAuthStore } from "@/store/auth.store";

function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "CRITICAL" || severity === "HIGH") return "destructive";
  if (severity === "MEDIUM") return "secondary";
  return "outline";
}

type ComplianceControl = SecurityComplianceResponse["controls"][number];

const CONTROL_LABELS: Record<string, string> = {
  access_control: "Access Control",
  logging_monitoring: "Logging and Monitoring",
  secure_configuration: "Secure Configuration",
  incident_management: "Incident Management",
  backup_recovery: "Backup Recovery",
  file_security: "File Security",
  supplier_security: "Supplier Security",
};

function controlStatusVariant(status: ComplianceControl["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "implemented") return "default";
  if (status === "partial") return "secondary";
  return "outline";
}

function controlLabel(key: string) {
  return CONTROL_LABELS[key] || key.replace(/_/g, " ");
}

function operationStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "FAIL" || status === "EXPIRED" || status === "REJECTED") return "destructive";
  if (status === "PENDING") return "secondary";
  if (status === "PASS" || status === "VALID") return "default";
  return "outline";
}

function boolFromCheckbox(value: boolean | "indeterminate") {
  return value === true;
}

interface BackupRecoveryFormState {
  plantId: string;
  performedAt: string;
  rtoMinutes: string;
  rpoMinutes: string;
  result: SecurityReviewResult;
  notes: string;
}

interface FileSecurityFormState {
  plantId: string;
  performedAt: string;
  moduleName: string;
  result: SecurityReviewResult;
  mimeValidation: boolean;
  sizeLimit: boolean;
  secureStorage: boolean;
  malwareScanning: boolean;
  notes: string;
}

interface SupplierSecurityFormState {
  plantId: string;
  performedAt: string;
  vendorName: string;
  attestationStatus: SupplierAttestationStatus;
  validUntil: string;
  notes: string;
}

interface PlantOption {
  value: string;
  label: string;
}

function triggerFileDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export default function SecurityCenter() {
  const defaultDateTimeLocal = () => new Date().toISOString().slice(0, 16);

  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingEvents, setIsDownloadingEvents] = useState(false);
  const [isDownloadingAudit, setIsDownloadingAudit] = useState(false);
  const [isSubmittingOperation, setIsSubmittingOperation] = useState(false);
  const [workflowPlants, setWorkflowPlants] = useState<PlantOption[]>([]);
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [dashboard, setDashboard] = useState<SecurityDashboardResponse | null>(null);
  const [compliance, setCompliance] = useState<SecurityComplianceResponse | null>(null);
  const [controlOperations, setControlOperations] = useState<SecurityControlOperationsResponse | null>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [backupForm, setBackupForm] = useState<BackupRecoveryFormState>({
    plantId: "",
    performedAt: defaultDateTimeLocal(),
    rtoMinutes: "",
    rpoMinutes: "",
    result: "PASS",
    notes: "",
  });
  const [fileForm, setFileForm] = useState<FileSecurityFormState>({
    plantId: "",
    performedAt: defaultDateTimeLocal(),
    moduleName: "",
    result: "PASS",
    mimeValidation: true,
    sizeLimit: true,
    secureStorage: true,
    malwareScanning: true,
    notes: "",
  });
  const [supplierForm, setSupplierForm] = useState<SupplierSecurityFormState>({
    plantId: "",
    performedAt: defaultDateTimeLocal(),
    vendorName: "",
    attestationStatus: "VALID",
    validUntil: "",
    notes: "",
  });
  const user = useAuthStore((state) => state.user);
  const userIsSuperAdmin = isSuperAdmin(user);
  const canViewCompliance = true;
  const scopeLabel = user?.scopeType === "ROOT_ADMIN"
    ? "Global scope"
    : user?.scopeType === "ORGANIZATION"
      ? "Organization scope"
      : "Plant scope";
  const { toast } = useToast();

  const load = useCallback(async (severity = severityFilter) => {
    setIsLoading(true);
    try {
      const [dashboardData, eventData, auditData, complianceData, controlOperationData] = await Promise.all([
        fetchSecurityDashboard(),
        fetchSecurityEvents(severity),
        fetchAuditLogs(),
        canViewCompliance ? fetchSecurityCompliance() : Promise.resolve(null),
        canViewCompliance ? fetchSecurityControlOperations() : Promise.resolve(null),
      ]);
      setDashboard(dashboardData);
      setCompliance(complianceData);
      setControlOperations(controlOperationData);
      setEvents(eventData);
      setAuditLogs(auditData);
    } catch (error) {
      toast({
        title: "Security data unavailable",
        description: error instanceof Error ? error.message : "Failed to load security center data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [canViewCompliance, severityFilter, toast]);

  useEffect(() => {
    void load(severityFilter);
  }, [load, severityFilter]);

  useEffect(() => {
    let cancelled = false;

    const fetchWorkflowPlants = async () => {
      try {
        const response = await listPlants({ page: 1, limit: 300 });
        if (cancelled) return;
        const options = (response.data || [])
          .filter((plant) => plant.isActive)
          .map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` }));
        setWorkflowPlants(options);
      } catch {
        if (!cancelled) {
          setWorkflowPlants([]);
        }
      }
    };

    void fetchWorkflowPlants();

    return () => {
      cancelled = true;
    };
  }, []);

  const availablePlantOptions = useMemo(() => {
    if (workflowPlants.length > 0) {
      return workflowPlants;
    }

    const scopedPlantIds = compliance?.scope.plantIds || [];
    return scopedPlantIds.map((plantId) => ({ value: plantId, label: plantId }));
  }, [compliance?.scope.plantIds, workflowPlants]);

  const lockedPlantId = user?.plantId || "";
  const allowPlantSelection = userIsSuperAdmin || availablePlantOptions.length > 1;
  const fallbackPlantId = allowPlantSelection ? "" : (lockedPlantId || availablePlantOptions[0]?.value || "");

  useEffect(() => {
    if (!fallbackPlantId) return;

    setBackupForm((current) => (current.plantId ? current : { ...current, plantId: fallbackPlantId }));
    setFileForm((current) => (current.plantId ? current : { ...current, plantId: fallbackPlantId }));
    setSupplierForm((current) => (current.plantId ? current : { ...current, plantId: fallbackPlantId }));
  }, [fallbackPlantId]);

  const resolveOperationPlantId = (plantIdFromForm: string) => {
    return plantIdFromForm || fallbackPlantId;
  };

  const plantSelectOptions = useMemo(() => {
    const options = [...availablePlantOptions];
    const scopedFallbackPlantId = lockedPlantId || fallbackPlantId;

    if (scopedFallbackPlantId && !options.some((option) => option.value === scopedFallbackPlantId)) {
      options.unshift({ value: scopedFallbackPlantId, label: `${scopedFallbackPlantId} (Scoped Plant)` });
    }

    return options;
  }, [availablePlantOptions, fallbackPlantId, lockedPlantId]);

  const handleAcknowledge = async (eventId: string) => {
    try {
      await acknowledgeSecurityEvent(eventId);
      toast({ title: "Security event acknowledged" });
      await load();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unable to acknowledge security event.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadEvents = async () => {
    setIsDownloadingEvents(true);
    try {
      const result = await downloadSecurityEventsCsv(severityFilter);
      triggerFileDownload(result.blob, result.fileName);
      toast({
        title: "Security events exported",
        description: `${result.fileName} downloaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unable to download security events.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingEvents(false);
    }
  };

  const handleDownloadAudit = async () => {
    setIsDownloadingAudit(true);
    try {
      const result = await downloadAuditLogsCsv();
      triggerFileDownload(result.blob, result.fileName);
      toast({
        title: "Audit logs exported",
        description: `${result.fileName} downloaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unable to download audit logs.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingAudit(false);
    }
  };

  const toIsoOrUndefined = (value: string) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return undefined;
    return parsed.toISOString();
  };

  const handleRecordBackupRecovery = async () => {
    const rtoMinutes = Number(backupForm.rtoMinutes);
    const rpoMinutes = Number(backupForm.rpoMinutes);
    const plantId = resolveOperationPlantId(backupForm.plantId);

    if (!plantId) {
      toast({ title: "Plant required", description: "Select a plant before recording backup recovery drill.", variant: "destructive" });
      return;
    }

    if (!Number.isFinite(rtoMinutes) || rtoMinutes < 0) {
      toast({ title: "Invalid RTO", description: "Enter a valid RTO in minutes.", variant: "destructive" });
      return;
    }

    if (!Number.isFinite(rpoMinutes) || rpoMinutes < 0) {
      toast({ title: "Invalid RPO", description: "Enter a valid RPO in minutes.", variant: "destructive" });
      return;
    }

    setIsSubmittingOperation(true);
    try {
      await recordBackupRecoveryOperation({
        plantId,
        performedAt: toIsoOrUndefined(backupForm.performedAt),
        rtoMinutes,
        rpoMinutes,
        result: backupForm.result,
        notes: backupForm.notes.trim() || undefined,
      });
      toast({ title: "Backup recovery record saved" });
      setBackupDialogOpen(false);
      setBackupForm((current) => ({
        plantId: current.plantId || plantId,
        performedAt: defaultDateTimeLocal(),
        rtoMinutes: "",
        rpoMinutes: "",
        result: "PASS",
        notes: "",
      }));
      await load();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to record backup recovery drill.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  const handleRecordFileSecurity = async () => {
    const plantId = resolveOperationPlantId(fileForm.plantId);

    if (!plantId) {
      toast({ title: "Plant required", description: "Select a plant before recording file security review.", variant: "destructive" });
      return;
    }

    if (!fileForm.moduleName.trim()) {
      toast({ title: "Module required", description: "Enter a module name for file security review.", variant: "destructive" });
      return;
    }

    setIsSubmittingOperation(true);
    try {
      await recordFileSecurityOperation({
        plantId,
        performedAt: toIsoOrUndefined(fileForm.performedAt),
        moduleName: fileForm.moduleName.trim(),
        result: fileForm.result,
        checks: {
          mimeValidation: fileForm.mimeValidation,
          sizeLimit: fileForm.sizeLimit,
          secureStorage: fileForm.secureStorage,
          malwareScanning: fileForm.malwareScanning,
        },
        notes: fileForm.notes.trim() || undefined,
      });
      toast({ title: "File security review saved" });
      setFileDialogOpen(false);
      setFileForm((current) => ({
        plantId: current.plantId || plantId,
        performedAt: defaultDateTimeLocal(),
        moduleName: "",
        result: "PASS",
        mimeValidation: true,
        sizeLimit: true,
        secureStorage: true,
        malwareScanning: true,
        notes: "",
      }));
      await load();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to record file security review.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  const handleRecordSupplierSecurity = async () => {
    const plantId = resolveOperationPlantId(supplierForm.plantId);

    if (!plantId) {
      toast({ title: "Plant required", description: "Select a plant before recording supplier attestation.", variant: "destructive" });
      return;
    }

    if (!supplierForm.vendorName.trim()) {
      toast({ title: "Supplier required", description: "Enter a supplier name.", variant: "destructive" });
      return;
    }

    setIsSubmittingOperation(true);
    try {
      await recordSupplierSecurityOperation({
        plantId,
        performedAt: toIsoOrUndefined(supplierForm.performedAt),
        vendorName: supplierForm.vendorName.trim(),
        attestationStatus: supplierForm.attestationStatus,
        validUntil: toIsoOrUndefined(supplierForm.validUntil),
        notes: supplierForm.notes.trim() || undefined,
      });
      toast({ title: "Supplier attestation saved" });
      setSupplierDialogOpen(false);
      setSupplierForm((current) => ({
        plantId: current.plantId || plantId,
        performedAt: defaultDateTimeLocal(),
        vendorName: "",
        attestationStatus: "VALID",
        validUntil: "",
        notes: "",
      }));
      await load();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to record supplier security attestation.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Center</h1>
          <p className="text-sm text-muted-foreground">
            Security events, audit logs, and ISO 27001 control intelligence for your authorized scope.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{scopeLabel}</Badge>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All severities</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Open Security Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.openEvents ?? 0}</p>
            </div>
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Critical Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.criticalEvents ?? 0}</p>
            </div>
            <Siren className="h-8 w-8 text-destructive" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Failed Auth Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.failedLoginEvents ?? 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Audit Changes 24h</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.auditChangesLast24Hours ?? 0}</p>
            </div>
            <Clock3 className="h-8 w-8 text-sky-600" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          {canViewCompliance ? <TabsTrigger value="compliance">Compliance</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Live Security Events</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void handleDownloadEvents()} disabled={isDownloadingEvents}>
                <Download className="mr-2 h-4 w-4" />
                {isDownloadingEvents ? "Exporting..." : "Download CSV"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboard?.suspiciousIps?.length ? (
                <div className="flex flex-wrap gap-2">
                  {dashboard.suspiciousIps.map((row) => (
                    <Badge key={row.ipAddress} variant="outline">
                      {row.ipAddress}: {row.attempts}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="font-medium">{event.eventType}</div>
                        <div className="text-xs text-muted-foreground">{event.message}</div>
                      </TableCell>
                      <TableCell><Badge variant={severityVariant(event.severity)}>{event.severity}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{event.ipAddress ?? "n/a"}</TableCell>
                      <TableCell>{format(new Date(event.detectedAt), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell className="text-right">
                        {event.status === "OPEN" ? (
                          <Button size="sm" variant="outline" onClick={() => void handleAcknowledge(event.id)}>
                            Acknowledge
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Handled</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No security events matched the current filter.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Audit Trail</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void handleDownloadAudit()} disabled={isDownloadingAudit}>
                <Download className="mr-2 h-4 w-4" />
                {isDownloadingAudit ? "Exporting..." : "Download CSV"}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.action}</div>
                        <div className="text-xs text-muted-foreground">{row.path ?? "n/a"}</div>
                      </TableCell>
                      <TableCell>{row.module ?? "n/a"}</TableCell>
                      <TableCell>{row.method ?? "n/a"}</TableCell>
                      <TableCell>{row.statusCode ?? "n/a"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ipAddress ?? "n/a"}</TableCell>
                      <TableCell>{format(new Date(row.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No audit records available.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewCompliance ? (
          <TabsContent value="compliance">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">ISO 27001 Score</p>
                  <p className="mt-2 text-3xl font-semibold">{compliance?.score ?? 0}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Maturity</p>
                  <p className="mt-2 text-3xl font-semibold">{compliance?.maturityLevel ?? "n/a"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Implemented Controls</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {compliance?.controlSummary.implemented ?? 0}/{compliance?.controlSummary.total ?? 0}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Open High/Critical Alerts</p>
                  <p className="mt-2 text-3xl font-semibold">{compliance?.metrics.unresolvedHighRiskEvents ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Operational Control Workflows</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Record and track implementation evidence for backup recovery, file security, and supplier security.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Backup Recovery</p>
                        <p className="text-xs text-muted-foreground">ISO Clause A.8.13</p>
                      </div>
                      <Badge variant={operationStatusVariant(controlOperations?.backupRecovery.latestResult || "")}>{controlOperations?.backupRecovery.latestResult || "No records"}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Total drills: {controlOperations?.backupRecovery.totalDrills ?? 0}</p>
                      <p>Pass / Fail: {(controlOperations?.backupRecovery.passedDrills ?? 0)} / {(controlOperations?.backupRecovery.failedDrills ?? 0)}</p>
                      <p>Last drill: {controlOperations?.backupRecovery.lastDrillAt ? format(new Date(controlOperations?.backupRecovery.lastDrillAt), "dd MMM yyyy HH:mm") : "n/a"}</p>
                    </div>
                    <Button className="mt-3 w-full" size="sm" onClick={() => setBackupDialogOpen(true)}>Record Restore Drill</Button>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">File Security</p>
                        <p className="text-xs text-muted-foreground">ISO Clause A.8.12</p>
                      </div>
                      <Badge variant={operationStatusVariant(controlOperations?.fileSecurity.latestResult || "")}>{controlOperations?.fileSecurity.latestResult || "No records"}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Total reviews: {controlOperations?.fileSecurity.totalReviews ?? 0}</p>
                      <p>Pass / Fail: {(controlOperations?.fileSecurity.passedReviews ?? 0)} / {(controlOperations?.fileSecurity.failedReviews ?? 0)}</p>
                      <p>Last module: {controlOperations?.fileSecurity.lastModuleName || "n/a"}</p>
                    </div>
                    <Button className="mt-3 w-full" size="sm" onClick={() => setFileDialogOpen(true)}>Record File Validation Review</Button>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Supplier Security</p>
                        <p className="text-xs text-muted-foreground">ISO Clause A.5.19, A.5.20</p>
                      </div>
                      <Badge variant={operationStatusVariant(controlOperations?.supplierSecurity.latestStatus || "")}>{controlOperations?.supplierSecurity.latestStatus || "No records"}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Total attestations: {controlOperations?.supplierSecurity.totalAttestations ?? 0}</p>
                      <p>Attention required: {controlOperations?.supplierSecurity.attentionRequired ?? 0}</p>
                      <p>Expiring in 30 days: {controlOperations?.supplierSecurity.upcomingExpiryCount ?? 0}</p>
                    </div>
                    <Button className="mt-3 w-full" size="sm" onClick={() => setSupplierDialogOpen(true)}>Record Supplier Attestation</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Recent Operational Records</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Control</TableHead>
                        <TableHead>Plant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(controlOperations?.recent || []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{controlLabel(row.controlKey)}</TableCell>
                          <TableCell className="font-mono text-xs">{row.plantId || "n/a"}</TableCell>
                          <TableCell><Badge variant={operationStatusVariant(row.status)}>{row.status}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.summary}</TableCell>
                          <TableCell>{format(new Date(row.performedAt), "dd MMM yyyy HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                      {!(controlOperations?.recent || []).length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No operational records captured yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>ISO 27001 Control Coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {compliance?.controls.map((control) => (
                    <div key={control.key} className="rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{controlLabel(control.key)}</div>
                          <div className="text-xs text-muted-foreground">ISO Clause {control.isoClause}</div>
                        </div>
                        <Badge variant={controlStatusVariant(control.status)}>
                          {control.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{control.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Configuration and Scope Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Scope Type</span>
                    <span className="font-medium">{compliance?.scope.scopeType ?? user?.scopeType ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Security Events (7 days)</span>
                    <span className="font-medium">{compliance?.metrics.securityEventsLast7Days ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Audit Changes (7 days)</span>
                    <span className="font-medium">{compliance?.metrics.auditChangesLast7Days ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">JWT Issuer</span>
                    <span className="font-medium">{compliance?.configuration.jwtIssuer ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Session Max Hours</span>
                    <span className="font-medium">{compliance?.configuration.sessionMaxHours ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Captcha Threshold</span>
                    <span className="font-medium">{compliance?.configuration.captchaThreshold ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Lockout Threshold</span>
                    <span className="font-medium">{compliance?.configuration.lockoutThreshold ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">SMTP Configured</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.smtpConfigured ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Security Alert Emails</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.securityAlertEmailsConfigured ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Signed Critical APIs</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.requestSignatureEnabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>ISO 27001 Improvement Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {compliance?.recommendations?.map((recommendation, index) => (
                  <div key={`${index}-${recommendation}`} className="rounded-lg border border-border p-3 text-sm">
                    {recommendation}
                  </div>
                ))}
                {!compliance?.recommendations?.length ? (
                  <p className="text-sm text-muted-foreground">No recommendations available.</p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record Backup Recovery Drill</DialogTitle>
            <DialogDescription>Capture restore evidence for ISO 27001 A.8.13.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Plant</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={allowPlantSelection ? backupForm.plantId : resolveOperationPlantId(backupForm.plantId)}
                onChange={(event) => setBackupForm((current) => ({ ...current, plantId: event.target.value }))}
                disabled={!allowPlantSelection}
              >
                <option value="">{allowPlantSelection ? "Select Plant" : "Scoped Plant"}</option>
                {plantSelectOptions.map((plant) => (
                  <option key={plant.value} value={plant.value}>{plant.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Performed At</p>
              <Input
                type="datetime-local"
                value={backupForm.performedAt}
                onChange={(event) => setBackupForm((current) => ({ ...current, performedAt: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">RTO (minutes)</p>
                <Input
                  type="number"
                  min={0}
                  value={backupForm.rtoMinutes}
                  onChange={(event) => setBackupForm((current) => ({ ...current, rtoMinutes: event.target.value }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">RPO (minutes)</p>
                <Input
                  type="number"
                  min={0}
                  value={backupForm.rpoMinutes}
                  onChange={(event) => setBackupForm((current) => ({ ...current, rpoMinutes: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Result</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={backupForm.result}
                onChange={(event) => setBackupForm((current) => ({ ...current, result: event.target.value as SecurityReviewResult }))}
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Notes</p>
              <Textarea
                value={backupForm.notes}
                onChange={(event) => setBackupForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional restore drill notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupDialogOpen(false)} disabled={isSubmittingOperation}>Cancel</Button>
            <Button onClick={() => void handleRecordBackupRecovery()} disabled={isSubmittingOperation}>
              {isSubmittingOperation ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record File Security Review</DialogTitle>
            <DialogDescription>Capture secure file handling validation for ISO 27001 A.8.12.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Plant</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={allowPlantSelection ? fileForm.plantId : resolveOperationPlantId(fileForm.plantId)}
                onChange={(event) => setFileForm((current) => ({ ...current, plantId: event.target.value }))}
                disabled={!allowPlantSelection}
              >
                <option value="">{allowPlantSelection ? "Select Plant" : "Scoped Plant"}</option>
                {plantSelectOptions.map((plant) => (
                  <option key={plant.value} value={plant.value}>{plant.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Performed At</p>
              <Input
                type="datetime-local"
                value={fileForm.performedAt}
                onChange={(event) => setFileForm((current) => ({ ...current, performedAt: event.target.value }))}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Module Name</p>
              <Input
                value={fileForm.moduleName}
                onChange={(event) => setFileForm((current) => ({ ...current, moduleName: event.target.value }))}
                placeholder="e.g. QR, Assets, Workorders"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Result</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fileForm.result}
                onChange={(event) => setFileForm((current) => ({ ...current, result: event.target.value as SecurityReviewResult }))}
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fileForm.mimeValidation} onCheckedChange={(value) => setFileForm((current) => ({ ...current, mimeValidation: boolFromCheckbox(value) }))} />
                MIME validation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fileForm.sizeLimit} onCheckedChange={(value) => setFileForm((current) => ({ ...current, sizeLimit: boolFromCheckbox(value) }))} />
                Size limits
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fileForm.secureStorage} onCheckedChange={(value) => setFileForm((current) => ({ ...current, secureStorage: boolFromCheckbox(value) }))} />
                Secure storage
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fileForm.malwareScanning} onCheckedChange={(value) => setFileForm((current) => ({ ...current, malwareScanning: boolFromCheckbox(value) }))} />
                Malware scanning
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Notes</p>
              <Textarea
                value={fileForm.notes}
                onChange={(event) => setFileForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional validation notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)} disabled={isSubmittingOperation}>Cancel</Button>
            <Button onClick={() => void handleRecordFileSecurity()} disabled={isSubmittingOperation}>
              {isSubmittingOperation ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record Supplier Security Attestation</DialogTitle>
            <DialogDescription>Capture third-party attestation status for ISO 27001 A.5.19 and A.5.20.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Plant</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={allowPlantSelection ? supplierForm.plantId : resolveOperationPlantId(supplierForm.plantId)}
                onChange={(event) => setSupplierForm((current) => ({ ...current, plantId: event.target.value }))}
                disabled={!allowPlantSelection}
              >
                <option value="">{allowPlantSelection ? "Select Plant" : "Scoped Plant"}</option>
                {plantSelectOptions.map((plant) => (
                  <option key={plant.value} value={plant.value}>{plant.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Performed At</p>
              <Input
                type="datetime-local"
                value={supplierForm.performedAt}
                onChange={(event) => setSupplierForm((current) => ({ ...current, performedAt: event.target.value }))}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Supplier Name</p>
              <Input
                value={supplierForm.vendorName}
                onChange={(event) => setSupplierForm((current) => ({ ...current, vendorName: event.target.value }))}
                placeholder="Supplier / vendor name"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Attestation Status</p>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={supplierForm.attestationStatus}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, attestationStatus: event.target.value as SupplierAttestationStatus }))}
                >
                  <option value="VALID">VALID</option>
                  <option value="PENDING">PENDING</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Valid Until (optional)</p>
                <Input
                  type="datetime-local"
                  value={supplierForm.validUntil}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, validUntil: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Notes</p>
              <Textarea
                value={supplierForm.notes}
                onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional attestation notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)} disabled={isSubmittingOperation}>Cancel</Button>
            <Button onClick={() => void handleRecordSupplierSecurity()} disabled={isSubmittingOperation}>
              {isSubmittingOperation ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
