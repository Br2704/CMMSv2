import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, Camera, Download, DoorOpen, Loader2, LogIn, LogOut, QrCode, ShieldAlert, Truck, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { subscribeGateSync } from "@/lib/gate-sync";
import { useAuthStore } from "@/store/auth.store";
import {
  createGateEntry,
  downloadGateReport,
  exitGateEntry,
  exitGatePass,
  getGateDashboardSummary,
  getGateReport,
  getGateSyncStatus,
  listGateEntries,
  listGates,
  listGateTemplateFields,
  listGateTemplateUsers,
  listGateTemplates,
  type Gate,
  type GateDashboardSummary,
  type GateEntry,
  type GateEntryFieldValue,
  type GateReportResponse,
  type GateTemplate,
  type GateTemplateField,
  type GateTemplateUser,
} from "@/api/gates";

const reportFormats = [
  { value: "csv", label: "Excel CSV" },
  { value: "excel", label: "Excel" },
  { value: "pdf", label: "PDF" },
];

function normalizeKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultSummary(): GateDashboardSummary {
  return {
    visitorsToday: 0,
    vehiclesEntered: 0,
    materialsInward: 0,
    materialsOutward: 0,
    activeVisitors: 0,
    wasteDisposals: 0,
    transportEmissionsKgCo2e: 0,
  };
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function SecurityGate() {
  const { user } = useAuthStore();
  const plantId = user?.plantId || undefined;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);
  const [templates, setTemplates] = useState<GateTemplate[]>([]);
  const [templateFields, setTemplateFields] = useState<GateTemplateField[]>([]);
  const [templateUsers, setTemplateUsers] = useState<GateTemplateUser[]>([]);
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [summary, setSummary] = useState<GateDashboardSummary>(defaultSummary());
  const [selectedGateId, setSelectedGateId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [remarks, setRemarks] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activityGateId, setActivityGateId] = useState("all");
  const [activityTemplateId, setActivityTemplateId] = useState("all");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportStatus, setReportStatus] = useState("all");
  const [reportGateId, setReportGateId] = useState("all");
  const [reportTemplateId, setReportTemplateId] = useState("all");
  const [reportPreview, setReportPreview] = useState<GateReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [createdEntry, setCreatedEntry] = useState<GateEntry | null>(null);
  const [qrImage, setQrImage] = useState("");
  const syncVersionRef = useRef<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );

  const gateOptions = useMemo(
    () => gates.map((gate) => ({ value: gate.id, label: `${gate.gateName} (${gate.gateCode})` })),
    [gates],
  );

  const templateOptions = useMemo(
    () =>
      templates
        .filter((template) => !selectedGateId || template.gateId === selectedGateId)
        .map((template) => ({
          value: template.id,
          label: `${template.templateName} · ${template.visitorType.replace(/_/g, " ")}`,
        })),
    [selectedGateId, templates],
  );

  const reportGateOptions = useMemo(
    () => [{ value: "all", label: "All Gates" }, ...gateOptions],
    [gateOptions],
  );

  const reportTemplateOptions = useMemo(
    () => {
      const filtered = templates.filter((template) => reportGateId === "all" || template.gateId === reportGateId);
      return [{ value: "all", label: "All Templates" }, ...filtered.map((template) => ({
        value: template.id,
        label: `${template.templateName} · ${template.visitorType.replace(/_/g, " ")}`,
      }))];
    },
    [reportGateId, templates],
  );

  const activityGateOptions = useMemo(
    () => [{ value: "all", label: "All Gates" }, ...gateOptions],
    [gateOptions],
  );

  const activityTemplateOptions = useMemo(
    () => {
      const filtered = templates.filter((template) => activityGateId === "all" || template.gateId === activityGateId);
      return [{ value: "all", label: "All Templates" }, ...filtered.map((template) => ({
        value: template.id,
        label: `${template.templateName} · ${template.visitorType.replace(/_/g, " ")}`,
      }))];
    },
    [activityGateId, templates],
  );

  const groupedFields = useMemo(() => {
    const groups = new Map<string, GateTemplateField[]>();
    templateFields.forEach((field) => {
      const key = (field.fieldGroup || "General").trim() || "General";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(field);
    });
    return Array.from(groups.entries());
  }, [templateFields]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        !search ||
        entry.visitorName.toLowerCase().includes(search.toLowerCase()) ||
        entry.visitorType.toLowerCase().includes(search.toLowerCase()) ||
        (entry.vehicleNumber || "").toLowerCase().includes(search.toLowerCase()) ||
        (entry.gate?.gateName || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
      const matchesGate = activityGateId === "all" || entry.gateId === activityGateId;
      const matchesTemplate = activityTemplateId === "all" || entry.templateId === activityTemplateId;
      return matchesSearch && matchesStatus && matchesGate && matchesTemplate;
    });
  }, [entries, search, statusFilter, activityGateId, activityTemplateId]);

  const loadDashboard = async () => {
    const response = await getGateDashboardSummary({ plantId });
    setSummary(response.data);
  };

  const loadEntries = async () => {
    const response = await listGateEntries({
      page: 1,
      limit: 100,
      plantId,
    });
    setEntries(response.data);
  };

  const loadMasterData = async () => {
    const [gatesResponse, templatesResponse] = await Promise.all([
      listGates({ page: 1, limit: 100, plantId }),
      listGateTemplates({ page: 1, limit: 100, plantId }),
    ]);
    setGates(gatesResponse.data);
    setTemplates(templatesResponse.data);

    if (!selectedGateId && gatesResponse.data.length > 0) {
      setSelectedGateId(gatesResponse.data[0].id);
    }
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      await Promise.all([loadMasterData(), loadEntries(), loadDashboard()]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load gate desk");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
  }, [plantId]);

  useEffect(() => {
    const unsubscribe = subscribeGateSync(() => {
      void loadPage();
    });
    return unsubscribe;
  }, [plantId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getGateSyncStatus({ plantId });
          const nextVersion = `${response.data.configVersion || ""}:${response.data.activityVersion || ""}`;
          if (syncVersionRef.current && syncVersionRef.current !== nextVersion) {
            await loadPage();
          }
          syncVersionRef.current = nextVersion;
        } catch {
          // Ignore background refresh failures and keep the current desk state.
        }
      })();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [plantId]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateFields([]);
      setFieldValues({});
      setTemplateUsers([]);
      return;
    }
    void (async () => {
      try {
        const [fieldResponse, usersResponse] = await Promise.all([
          listGateTemplateFields(selectedTemplateId),
          listGateTemplateUsers(selectedTemplateId),
        ]);
        const sorted = fieldResponse.data.slice().sort((left, right) => left.displayOrder - right.displayOrder);
        setTemplateFields(sorted);
        setFieldValues(Object.fromEntries(sorted.filter((field) => field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== "").map((field) => [field.fieldName, field.defaultValue])));
        setTemplateUsers(usersResponse.data);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load template fields");
      }
    })();
  }, [selectedTemplateId]);

  useEffect(() => {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (template) {
      setSelectedGateId(template.gateId);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!createdEntry?.qrCodeValue) {
      setQrImage("");
      return;
    }
    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const image = await QRCode.toDataURL(createdEntry.qrCodeValue, {
          width: 240,
          margin: 1,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        setQrImage(image);
      } catch {
        setQrImage("");
      }
    })();
  }, [createdEntry]);

  useEffect(() => {
    let isActive = true;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          setReportLoading(true);
          const response = await getGateReport({
            format: "json",
            plantId,
            gateId: reportGateId === "all" ? undefined : reportGateId,
            templateId: reportTemplateId === "all" ? undefined : reportTemplateId,
            dateFrom: reportDateFrom || undefined,
            dateTo: reportDateTo || undefined,
            status: reportStatus === "all" ? undefined : reportStatus,
          });
          if (isActive) {
            setReportPreview(response.data);
          }
        } catch {
          if (isActive) {
            setReportPreview(null);
          }
        } finally {
          if (isActive) {
            setReportLoading(false);
          }
        }
      })();
    }, 300);
    return () => {
      isActive = false;
      window.clearTimeout(timeout);
    };
  }, [plantId, reportGateId, reportTemplateId, reportDateFrom, reportDateTo, reportStatus]);

  const handleFieldValueChange = (fieldName: string, value: unknown) => {
    setFieldValues((current) => ({ ...current, [fieldName]: value }));
  };

  const handleFileFieldChange = async (fieldName: string, file: File | null) => {
    if (!file) {
      handleFieldValueChange(fieldName, "");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      handleFieldValueChange(fieldName, dataUrl);
    } catch (error: any) {
      toast.error(error?.message || "Failed to read file");
    }
  };

  const buildFieldPayload = (): GateEntryFieldValue[] =>
    templateFields.map((field) => ({
      fieldId: field.id,
      fieldName: field.fieldName,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      unit: field.unit,
      value: fieldValues[field.fieldName],
    }));

  const validateForm = () => {
    if (!selectedGateId) {
      toast.error("Select a gate");
      return false;
    }
    if (!selectedTemplateId) {
      toast.error("Select an entry type");
      return false;
    }
    const missingRequired = templateFields.find(
      (field) =>
        field.isRequired &&
        (fieldValues[field.fieldName] === undefined ||
          fieldValues[field.fieldName] === null ||
          fieldValues[field.fieldName] === ""),
    );
    if (missingRequired) {
      toast.error(`${missingRequired.fieldLabel} is required`);
      return false;
    }
    return true;
  };

  const handleSubmitEntry = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await createGateEntry({
        gateId: selectedGateId,
        templateId: selectedTemplateId,
        plantId,
        visitorType: selectedTemplate?.visitorType || null,
        remarks: remarks || null,
        fieldValues: buildFieldPayload(),
      });

      toast.success("Gate entry recorded");
      setFieldValues({});
      setRemarks("");
      setCreatedEntry(response.data);
      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to record entry");
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualExit = async (entry: GateEntry) => {
    try {
      await exitGateEntry(entry.id, { exitMethod: "MANUAL", remarks: "Exited at gate" });
      toast.success(`${entry.visitorName} checked out`);
      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update exit");
    }
  };

  const handleQrDecoded = async (token: string) => {
    try {
      await exitGatePass(token, { exitMethod: "QR_SCAN", remarks: "QR exit scan" });
      toast.success("Exit recorded from QR pass");
      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to process QR exit");
    }
  };

  const handleReportDownload = async (formatType: "csv" | "excel" | "pdf") => {
    try {
      const blob = await downloadGateReport({
        format: formatType,
        plantId,
        gateId: reportGateId === "all" ? undefined : reportGateId,
        templateId: reportTemplateId === "all" ? undefined : reportTemplateId,
        dateFrom: reportDateFrom || undefined,
        dateTo: reportDateTo || undefined,
        status: reportStatus === "all" ? undefined : reportStatus,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gate-report-${new Date().toISOString().slice(0, 10)}.${formatType === "excel" ? "xls" : formatType}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Gate report downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download report");
    }
  };

  const handleDownloadQrPass = () => {
    if (!qrImage || !createdEntry) return;
    const anchor = document.createElement("a");
    anchor.href = qrImage;
    anchor.download = `gate-pass-${createdEntry.id.slice(0, 8)}.png`;
    anchor.click();
  };

  const renderField = (field: GateTemplateField) => {
    const value = fieldValues[field.fieldName];
    const label = `${field.fieldLabel}${field.unit ? ` (${field.unit})` : ""}`;

    if (field.fieldType === "TEXTAREA") {
      return (
        <div key={field.id} className="space-y-2">
          <Label>{label}{field.isRequired ? " *" : ""}</Label>
          <Textarea
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder || field.fieldLabel}
            rows={3}
            onChange={(event) => handleFieldValueChange(field.fieldName, event.target.value)}
          />
        </div>
      );
    }

    if (field.fieldType === "DROPDOWN") {
      return (
        <div key={field.id} className="space-y-2">
          <Label>{label}{field.isRequired ? " *" : ""}</Label>
          <Select value={typeof value === "string" ? value : ""} onValueChange={(nextValue) => handleFieldValueChange(field.fieldName, nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || `Select ${field.fieldLabel}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (field.fieldType === "PHOTO" || field.fieldType === "DOCUMENT" || field.fieldType === "SIGNATURE") {
      return (
        <div key={field.id} className="space-y-2">
          <Label>{label}{field.isRequired ? " *" : ""}</Label>
          <Input
            type="file"
            accept={field.fieldType === "DOCUMENT" ? "*" : "image/*"}
            capture={field.fieldType === "DOCUMENT" ? undefined : "environment"}
            onChange={(event) => void handleFileFieldChange(field.fieldName, event.target.files?.[0] || null)}
          />
          {typeof value === "string" && value ? (
            <p className="text-xs text-muted-foreground">File captured</p>
          ) : null}
          {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
        </div>
      );
    }

    if (field.fieldType === "CHECKBOX") {
      return (
        <div key={field.id} className="flex items-center gap-2 rounded-2xl border border-border/70 px-3 py-4">
          <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => handleFieldValueChange(field.fieldName, Boolean(checked))} />
          <div>
            <Label>{label}{field.isRequired ? " *" : ""}</Label>
            {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-2">
        <Label>{label}{field.isRequired ? " *" : ""}</Label>
        <Input
          type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : field.fieldType === "TIME" ? "time" : "text"}
          placeholder={field.placeholder || field.fieldLabel}
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          min={field.allowedMin || undefined}
          max={field.allowedMax || undefined}
          onChange={(event) => handleFieldValueChange(field.fieldName, event.target.value)}
        />
        {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Digital Gate Entry</h1>
          <p className="text-sm text-muted-foreground">Fast gate recording for visitors, vendors, vehicles, and material movement.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setScannerOpen(true)}>
            <QrCode className="h-4 w-4" />
            Scan Exit QR
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => void loadPage()}>
            Refresh
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { title: "Visitors Today", value: summary.visitorsToday, icon: Users, tone: "text-sky-600 bg-sky-500/10" },
          { title: "Active Visitors", value: summary.activeVisitors, icon: UserCheck, tone: "text-emerald-600 bg-emerald-500/10" },
          { title: "Vehicles Entered", value: summary.vehiclesEntered, icon: Truck, tone: "text-amber-600 bg-amber-500/10" },
          { title: "Materials Inward", value: summary.materialsInward, icon: LogIn, tone: "text-violet-600 bg-violet-500/10" },
          { title: "Materials Outward", value: summary.materialsOutward, icon: LogOut, tone: "text-rose-600 bg-rose-500/10" },
          { title: "Transport CO2e", value: Number(summary.transportEmissionsKgCo2e || 0).toFixed(1), icon: ShieldAlert, tone: "text-slate-700 bg-slate-200/80" },
        ].map((item) => (
          <Card key={item.title} className="shadow-card">
            <CardContent className="flex items-center gap-3 py-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="desk" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="desk">Entry Desk</TabsTrigger>
          <TabsTrigger value="activity">Active Log</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="desk" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DoorOpen className="h-5 w-5 text-primary" />
                  New Gate Entry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Gate</Label>
                    <Select value={selectedGateId} onValueChange={setSelectedGateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gate" />
                      </SelectTrigger>
                      <SelectContent>
                        {gateOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Entry Type</Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select visitor type" />
                      </SelectTrigger>
                      <SelectContent>
                        {templateOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedTemplate ? (
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{selectedTemplate.visitorType.replace(/_/g, " ")}</Badge>
                      {selectedTemplate.machine?.name ? <Badge variant="outline">{selectedTemplate.machine.name}</Badge> : null}
                      {selectedTemplate.module?.name ? <Badge variant="outline">{selectedTemplate.module.name}</Badge> : null}
                      {selectedTemplate.securityLevel ? <Badge variant="outline">Level: {selectedTemplate.securityLevel}</Badge> : null}
                      {selectedTemplate.frequency ? <Badge variant="outline">Frequency: {selectedTemplate.frequency}</Badge> : null}
                    </div>
                    {selectedTemplate.allowedRoles && selectedTemplate.allowedRoles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedTemplate.allowedRoles.map((role) => (
                          <Badge key={role} variant="outline">{role}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {templateUsers.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {templateUsers.map((userType) => (
                          <Badge key={userType.id} className="bg-muted text-muted-foreground" variant="secondary">
                            {userType.allowedUserType}{userType.approvalRequired ? " · Approval" : ""}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-3 text-sm text-muted-foreground">
                      Security staff can record entries for this template. Required fields and ESG capture fields appear below.
                    </p>
                  </div>
                ) : null}

                {templateFields.length > 0 ? (
                  <div className="space-y-5">
                    {groupedFields.map(([group, groupFields]) => (
                      <div key={group} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {groupFields.map((field) => renderField(field))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Select an entry type to load its configured fields.
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Security Remarks</Label>
                  <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} placeholder="Optional remarks or approval note" />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="gap-2" onClick={() => void handleSubmitEntry()} disabled={submitting}>
                    <Camera className="h-4 w-4" />
                    {submitting ? "Recording..." : "Submit Entry"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplateId("");
                      setTemplateFields([]);
                      setFieldValues({});
                      setRemarks("");
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg">Gate Ops Highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{entry.visitorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.gate?.gateName || "-"} · {entry.visitorType.replace(/_/g, " ")}
                        </p>
                      </div>
                      <StatusBadge variant={entry.status === "IN" ? "active" : "default"} showDot>
                        {entry.status}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.duplicateDetected ? <Badge variant="secondary">Duplicate</Badge> : null}
                      {entry.blacklistAlert ? <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10">Blacklist</Badge> : null}
                      {entry.watchlistAlert ? <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">Watchlist</Badge> : null}
                      {entry.vehicleNumber ? <Badge variant="outline">{entry.vehicleNumber}</Badge> : null}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Entry {format(new Date(entry.entryTime), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                ))}
                {visibleEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No gate activity recorded yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card className="shadow-card">
            <CardContent className="grid gap-3 py-4 md:grid-cols-5">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visitor, vehicle, or gate..." />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="IN">Inside</SelectItem>
                  <SelectItem value="OUT">Exited</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activityGateId} onValueChange={(value) => {
                setActivityGateId(value);
                if (value !== "all" && activityTemplateId !== "all") {
                  const stillValid = templates.some((template) => template.id === activityTemplateId && template.gateId === value);
                  if (!stillValid) setActivityTemplateId("all");
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Gates" />
                </SelectTrigger>
                <SelectContent>
                  {activityGateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activityTemplateId} onValueChange={setActivityTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Templates" />
                </SelectTrigger>
                <SelectContent>
                  {activityTemplateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadEntries()}>
                Refresh Activity
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {visibleEntries.map((entry) => (
              <Card key={entry.id} className="shadow-card">
                <CardContent className="space-y-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{entry.visitorName}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.gate?.gateName || "-"} · {entry.visitorType.replace(/_/g, " ")}
                      </p>
                    </div>
                    <StatusBadge variant={entry.status === "IN" ? "active" : "default"} showDot>
                      {entry.status}
                    </StatusBadge>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <p>Entry: {format(new Date(entry.entryTime), "dd MMM yyyy, HH:mm")}</p>
                    <p>Exit: {entry.exitTime ? format(new Date(entry.exitTime), "dd MMM yyyy, HH:mm") : "Still inside"}</p>
                    <p>Vehicle: {entry.vehicleNumber || "-"}</p>
                    <p>Company: {entry.visitorCompany || entry.vendorName || "-"}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {entry.duplicateDetected ? <Badge variant="secondary">Duplicate visitor</Badge> : null}
                    {entry.blacklistAlert ? <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10"><ShieldAlert className="mr-1 h-3.5 w-3.5" /> Blacklist alert</Badge> : null}
                    {entry.watchlistAlert ? <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Watchlist alert</Badge> : null}
                    {entry.qrCodeValue ? <Badge variant="outline">{entry.qrCodeValue}</Badge> : null}
                  </div>

                  {entry.status === "IN" ? (
                    <Button className="w-full gap-2" variant="outline" onClick={() => void handleManualExit(entry)}>
                      <LogOut className="h-4 w-4" />
                      Record Exit
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {visibleEntries.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No gate entries match the current filters.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Gate Reports & Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input type="date" value={reportDateFrom} onChange={(event) => setReportDateFrom(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input type="date" value={reportDateTo} onChange={(event) => setReportDateTo(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={reportStatus} onValueChange={setReportStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="IN">Inside</SelectItem>
                      <SelectItem value="OUT">Exited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Gate</Label>
                  <Select value={reportGateId} onValueChange={(value) => {
                    setReportGateId(value);
                    if (value !== "all" && reportTemplateId !== "all") {
                      const stillValid = templates.some((template) => template.id === reportTemplateId && template.gateId === value);
                      if (!stillValid) setReportTemplateId("all");
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Gates" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportGateOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={reportTemplateId} onValueChange={setReportTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Templates" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportTemplateOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {reportFormats.map((formatOption) => (
                  <Button key={formatOption.value} variant="outline" className="gap-2" onClick={() => void handleReportDownload(formatOption.value as "csv" | "excel" | "pdf")}>
                    <Download className="h-4 w-4" />
                    {formatOption.label}
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Report Preview</p>
                    <p className="text-xs text-muted-foreground">Totals and the latest entries for the current filters.</p>
                  </div>
                  {reportLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                </div>
                {reportPreview ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                        <p className="font-semibold text-foreground">{reportPreview.totals.total}</p>
                        <p>Total entries</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                        <p className="font-semibold text-foreground">{reportPreview.totals.activeVisitors}</p>
                        <p>Active visitors</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
                        <p className="font-semibold text-foreground">{Number(reportPreview.totals.transportEmissionsKgCo2e || 0).toFixed(2)}</p>
                        <p>Transport CO2e (kg)</p>
                      </div>
                    </div>
                    {reportPreview.rows.length > 0 ? (
                      <div className="space-y-2">
                        {reportPreview.rows.slice(0, 5).map((row, index) => (
                          <div key={`${row.passId}-${index}`} className="flex flex-col gap-1 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">{row.visitorName}</span>
                              <StatusBadge variant={row.status === "IN" ? "active" : "default"} showDot>{row.status}</StatusBadge>
                            </div>
                            <p className="text-muted-foreground">{row.gate} · {row.visitorType.replace(/_/g, " ")}</p>
                            <p className="text-muted-foreground">{row.entryTime}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No rows match the current filters.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No preview available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MobileQrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title="Scan Gate Pass"
        description="Scan the visitor QR pass to record exit."
        onDecoded={(decoded) => void handleQrDecoded(decoded)}
      />

      <Dialog open={!!createdEntry} onOpenChange={(open) => { if (!open) setCreatedEntry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gate Pass Generated</DialogTitle>
            <DialogDescription>
              Share this QR pass with the visitor for exit scanning at the gate.
            </DialogDescription>
          </DialogHeader>
          {createdEntry ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border p-4 text-center">
                {qrImage ? <img src={qrImage} alt="Gate pass QR" className="mx-auto h-52 w-52 rounded-xl border border-border" /> : null}
                <p className="mt-3 font-semibold">{createdEntry.visitorName}</p>
                <p className="text-sm text-muted-foreground">{createdEntry.gate?.gateName || "-"}</p>
                <p className="mt-2 text-xs text-muted-foreground">{createdEntry.qrCodeValue}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="flex-1" onClick={handleDownloadQrPass} disabled={!qrImage}>
                  <Download className="mr-2 h-4 w-4" />
                  Download QR Pass
                </Button>
                <Button className="flex-1" onClick={() => setCreatedEntry(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
