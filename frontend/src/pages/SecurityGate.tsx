import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, Camera, Download, DoorOpen, FileScan, Loader2, LogIn, LogOut, QrCode, ShieldAlert, Truck, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { subscribeGateSync } from "@/lib/gate-sync";
import { useAuthStore } from "@/store/auth.store";
import { listProfiles, type UserProfile } from "@/api/users";
import { createSmartVisitor, getVisitorInsights, type SmartVisitorCreateResponse, type VisitorInsights } from "@/api/visitorExperience";
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

function isSecurityRole(role: string) {
  const normalized = role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized === "SECURITY" || normalized === "SECURITY_USER";
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

function defaultVisitorInsights(): VisitorInsights {
  return {
    pendingApprovals: 0,
    approvedToday: 0,
    rejectedToday: 0,
    activeVisitors: 0,
    navigationEnabled: 0,
    requestsToday: 0,
    liveTracked: 0,
    visitorsPerEmployee: [],
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return fallback;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function toDateTimeLocalInput(value: Date) {
  const timezoneOffsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

type CameraCaptureMode = "PHOTO" | "DOCUMENT";

const visitorDurationOptions = [1, 2, 3, 4, 6, 8, 12, 24].map((hours) => ({
  value: String(hours),
  label: `${hours} hour${hours > 1 ? "s" : ""}`,
}));

export default function SecurityGate() {
  const { user } = useAuthStore();
  const plantId = user?.plantId || undefined;
  const canCreateTemporaryVisitor = useMemo(
    () => (user?.roles ?? []).some((role) => isSecurityRole(role)),
    [user?.roles],
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);
  const [templates, setTemplates] = useState<GateTemplate[]>([]);
  const [templateFields, setTemplateFields] = useState<GateTemplateField[]>([]);
  const [templateUsers, setTemplateUsers] = useState<GateTemplateUser[]>([]);
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [summary, setSummary] = useState<GateDashboardSummary>(defaultSummary());
  const [visitorInsights, setVisitorInsights] = useState<VisitorInsights>(defaultVisitorInsights());
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
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [creatingSmartVisitor, setCreatingSmartVisitor] = useState(false);
  const [createdSmartVisitor, setCreatedSmartVisitor] = useState<SmartVisitorCreateResponse | null>(null);
  const [smartVisitorForm, setSmartVisitorForm] = useState({
    gateId: "",
    personToMeetUserId: "",
    visitorName: "",
    visitorPhone: "",
    purpose: "",
    durationHours: "2",
  });
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [cameraCaptureMode, setCameraCaptureMode] = useState<CameraCaptureMode>("PHOTO");
  const [cameraCaptureField, setCameraCaptureField] = useState<GateTemplateField | null>(null);
  const [cameraCaptureStatus, setCameraCaptureStatus] = useState<"idle" | "starting" | "ready">("idle");
  const [cameraCaptureError, setCameraCaptureError] = useState("");
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const syncVersionRef = useRef<string | null>(null);

  const selectedGateTemplates = useMemo(
    () => templates.filter((template) => template.gateId === selectedGateId),
    [selectedGateId, templates],
  );

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
      selectedGateTemplates
        .map((template) => ({
          value: template.id,
          label: `${template.templateName} · ${template.visitorType.replace(/_/g, " ")}`,
        })),
    [selectedGateTemplates],
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

  const employeeOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.isActive)
        .map((employee) => ({
          value: employee.userId,
          label: `${employee.fullName} (${employee.userCode})`,
        })),
    [employees],
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

  const loadDashboard = useCallback(async () => {
    const [gateSummaryResponse, visitorInsightsResponse] = await Promise.all([
      getGateDashboardSummary({ plantId }),
      getVisitorInsights({ plantId }),
    ]);
    setSummary(gateSummaryResponse.data);
    setVisitorInsights(visitorInsightsResponse.data);
  }, [plantId]);

  const loadEntries = useCallback(async () => {
    const response = await listGateEntries({
      page: 1,
      limit: 100,
      plantId,
    });
    setEntries(response.data);
  }, [plantId]);

  const loadMasterData = useCallback(async () => {
    const [gatesResponse, templatesResponse, profilesResponse] = await Promise.all([
      listGates({ page: 1, limit: 100, plantId }),
      listGateTemplates({ page: 1, limit: 100, plantId }),
      listProfiles({ page: 1, limit: 300, plantId, includeInactive: false }),
    ]);
    setGates(gatesResponse.data);
    setTemplates(templatesResponse.data);

    const employeeProfiles = profilesResponse.data.filter(
      (profile) =>
        !(profile.roles ?? []).some((role) => {
          const normalized = role.toUpperCase();
          return normalized === "VISITOR" || normalized === "TEMPORARY_VISITOR";
        }),
    );
    setEmployees(employeeProfiles);

    if (gatesResponse.data.length > 0) {
      setSelectedGateId((current) => current || gatesResponse.data[0].id);
    }

    setSmartVisitorForm((current) => ({
      ...current,
      gateId: current.gateId || gatesResponse.data[0]?.id || "",
      personToMeetUserId: current.personToMeetUserId || employeeProfiles[0]?.userId || "",
    }));
  }, [plantId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadMasterData(), loadEntries(), loadDashboard()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load gate desk"));
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadEntries, loadMasterData]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const unsubscribe = subscribeGateSync(() => {
      void loadPage();
    });
    return unsubscribe;
  }, [loadPage]);

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
  }, [loadPage, plantId]);

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
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load template fields"));
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
    if (!selectedGateId) {
      setSelectedTemplateId("");
      setTemplateFields([]);
      setTemplateUsers([]);
      setFieldValues({});
      return;
    }

    const scopedTemplates = templates.filter((template) => template.gateId === selectedGateId);
    if (scopedTemplates.length === 0) {
      setSelectedTemplateId("");
      setTemplateFields([]);
      setTemplateUsers([]);
      setFieldValues({});
      return;
    }

    if (!scopedTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(scopedTemplates[0].id);
    }
  }, [selectedGateId, selectedTemplateId, templates]);

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

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5MB");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      handleFieldValueChange(fieldName, dataUrl);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to read file"));
    }
  };

  const stopCameraStream = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;
  }, []);

  useEffect(() => {
    if (!cameraCaptureOpen) {
      setCameraCaptureStatus("idle");
      setCameraCaptureError("");
      stopCameraStream();
      return;
    }

    let disposed = false;
    setCameraCaptureStatus("starting");
    setCameraCaptureError("");

    const startCamera = async () => {
      if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        throw new Error("Camera access needs HTTPS or localhost.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support camera access.");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { ideal: "environment" },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStreamRef.current = stream;
      const videoElement = cameraVideoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.muted = true;
        videoElement.playsInline = true;
        await videoElement.play().catch(() => undefined);
      }
      setCameraCaptureStatus("ready");
    };

    void startCamera().catch((error: unknown) => {
      if (disposed) return;
      setCameraCaptureStatus("idle");
      setCameraCaptureError(getErrorMessage(error, "Unable to start camera. Ensure permission is granted and no other app uses it."));
      stopCameraStream();
    });

    return () => {
      disposed = true;
      stopCameraStream();
    };
  }, [cameraCaptureOpen, stopCameraStream]);

  const openFieldCameraCapture = (field: GateTemplateField, mode: CameraCaptureMode) => {
    setCameraCaptureField(field);
    setCameraCaptureMode(mode);
    setCameraCaptureError("");
    setCameraCaptureOpen(true);
  };

  const captureFieldFromCamera = () => {
    if (!cameraCaptureField) {
      toast.error("No template field selected for camera capture");
      return;
    }

    const videoElement = cameraVideoRef.current;
    if (!videoElement || videoElement.readyState < 2) {
      toast.error("Camera feed is not ready yet");
      return;
    }

    const width = videoElement.videoWidth || 1280;
    const height = videoElement.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      toast.error("Unable to capture image from camera");
      return;
    }

    context.drawImage(videoElement, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", cameraCaptureMode === "DOCUMENT" ? 0.95 : 0.9);
    handleFieldValueChange(cameraCaptureField.fieldName, dataUrl);
    toast.success(`${cameraCaptureField.fieldLabel} captured`);
    setCameraCaptureOpen(false);
    stopCameraStream();
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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to record entry"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualExit = async (entry: GateEntry) => {
    try {
      await exitGateEntry(entry.id, { exitMethod: "MANUAL", remarks: "Exited at gate" });
      toast.success(`${entry.visitorName} checked out`);
      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update exit"));
    }
  };

  const handleQrDecoded = async (token: string) => {
    try {
      await exitGatePass(token, { exitMethod: "QR_SCAN", remarks: "QR exit scan" });
      toast.success("Exit recorded from QR pass");
      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to process QR exit"));
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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to download report"));
    }
  };

  const handleCreateSmartVisitor = async () => {
    if (!canCreateTemporaryVisitor) {
      toast.error("Only security users can create temporary visitor access");
      return;
    }
    if (!plantId) {
      toast.error("Plant context is missing for this user");
      return;
    }
    if (!smartVisitorForm.gateId || !smartVisitorForm.personToMeetUserId || !smartVisitorForm.visitorName.trim() || !smartVisitorForm.purpose.trim()) {
      toast.error("Gate, employee, visitor name and purpose are required");
      return;
    }

    const durationHours = Number.parseInt(smartVisitorForm.durationHours, 10);
    if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 24) {
      toast.error("Select visit duration between 1 and 24 hours");
      return;
    }

    setCreatingSmartVisitor(true);
    try {
      const response = await createSmartVisitor({
        gateId: smartVisitorForm.gateId,
        plantId,
        personToMeetUserId: smartVisitorForm.personToMeetUserId,
        visitorName: smartVisitorForm.visitorName.trim(),
        visitorPhone: smartVisitorForm.visitorPhone.trim() || null,
        purpose: smartVisitorForm.purpose.trim(),
        durationHours,
      });

      setCreatedSmartVisitor(response.data);
      toast.success("Visitor session created and sent for approval");
      setSmartVisitorForm((current) => ({
        ...current,
        visitorName: "",
        visitorPhone: "",
        purpose: "",
        durationHours: "2",
      }));

      await Promise.all([loadEntries(), loadDashboard()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create smart visitor session"));
    } finally {
      setCreatingSmartVisitor(false);
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
      const usesDocumentCapture = field.fieldType === "DOCUMENT";
      const hasImagePreview = typeof value === "string" && value.startsWith("data:image");

      return (
        <div key={field.id} className="space-y-2">
          <Label>{label}{field.isRequired ? " *" : ""}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => openFieldCameraCapture(field, usesDocumentCapture ? "DOCUMENT" : "PHOTO")}
            >
              {usesDocumentCapture ? <FileScan className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              {usesDocumentCapture ? "Open Camera Scanner" : "Capture from Camera"}
            </Button>
          </div>
          <Input
            type="file"
            accept={field.fieldType === "DOCUMENT" ? "*" : "image/*"}
            capture={field.fieldType === "DOCUMENT" ? undefined : "environment"}
            onChange={(event) => void handleFileFieldChange(field.fieldName, event.target.files?.[0] || null)}
          />
          {typeof value === "string" && value ? (
            <p className="text-xs text-muted-foreground">Secure file captured and queued for entry submission.</p>
          ) : null}
          {hasImagePreview ? (
            <img src={value} alt={`${field.fieldLabel} preview`} className="max-h-28 rounded-xl border border-border/70" />
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

                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-sm font-semibold">Configured Entry Options for Selected Gate</p>
                  {selectedGateTemplates.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedGateTemplates.map((template) => (
                        <Badge key={template.id} variant="outline">
                          {template.visitorType.replace(/_/g, " ")} · {template.templateName}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No entry types configured for this gate in Gate Master.</p>
                  )}
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

            <div className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg">Approval-Based Visitor Access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Create a temporary visitor request with only core details. Access is activated after host approval.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Gate</Label>
                      <Select value={smartVisitorForm.gateId} onValueChange={(value) => setSmartVisitorForm((current) => ({ ...current, gateId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gate" />
                        </SelectTrigger>
                        <SelectContent>
                          {gateOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Employee to Visit</Label>
                      <Select value={smartVisitorForm.personToMeetUserId} onValueChange={(value) => setSmartVisitorForm((current) => ({ ...current, personToMeetUserId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employeeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Visitor Name</Label>
                      <Input value={smartVisitorForm.visitorName} onChange={(event) => setSmartVisitorForm((current) => ({ ...current, visitorName: event.target.value }))} placeholder="Visitor full name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Visitor Phone</Label>
                      <Input value={smartVisitorForm.visitorPhone} onChange={(event) => setSmartVisitorForm((current) => ({ ...current, visitorPhone: event.target.value }))} placeholder="Phone number" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Textarea value={smartVisitorForm.purpose} onChange={(event) => setSmartVisitorForm((current) => ({ ...current, purpose: event.target.value }))} rows={2} placeholder="Why is this visitor coming?" />
                  </div>

                  <div className="space-y-2">
                    <Label>Allowed Access Duration (Starts After Employee Approval)</Label>
                    <Select value={smartVisitorForm.durationHours} onValueChange={(value) => setSmartVisitorForm((current) => ({ ...current, durationHours: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {visitorDurationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Access timer begins only after the host employee approves this visitor request.</p>
                  </div>

                  <Button className="w-full" onClick={() => void handleCreateSmartVisitor()} disabled={creatingSmartVisitor || !canCreateTemporaryVisitor}>
                    {creatingSmartVisitor ? "Creating Visitor Session..." : "Create Temporary Visitor + Approval Window"}
                  </Button>

                  {!canCreateTemporaryVisitor ? (
                    <p className="text-xs text-rose-600">
                      Temporary visitor creation is restricted to security users.
                    </p>
                  ) : null}

                  {createdSmartVisitor ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
                      <p className="font-semibold text-emerald-700">Visitor Session Created</p>
                      <p className="mt-1 text-xs text-muted-foreground">Session: {createdSmartVisitor.session.id}</p>
                      <p className="text-xs text-muted-foreground">QR Token: {createdSmartVisitor.visitorCredentials.qrToken}</p>
                      <p className="text-xs text-muted-foreground">Login: {createdSmartVisitor.visitorCredentials.loginEmail}</p>
                      <p className="text-xs text-muted-foreground">Temp Password: {createdSmartVisitor.visitorCredentials.temporaryPassword}</p>
                      <p className="text-xs text-muted-foreground">Duration: {createdSmartVisitor.visitorCredentials.durationHours || smartVisitorForm.durationHours} hour(s), starts on approval.</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Pending Visitor Approvals", value: visitorInsights.pendingApprovals, icon: AlertTriangle, tone: "text-amber-600 bg-amber-500/10" },
              { title: "Visitor Approvals Today", value: visitorInsights.approvedToday, icon: UserCheck, tone: "text-emerald-600 bg-emerald-500/10" },
              { title: "Visitor Rejections Today", value: visitorInsights.rejectedToday, icon: ShieldAlert, tone: "text-rose-600 bg-rose-500/10" },
              {
                title: "Top Host Visits",
                value: visitorInsights.visitorsPerEmployee[0]?.total || 0,
                icon: Users,
                tone: "text-slate-700 bg-slate-200/80",
              },
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

      <Dialog open={cameraCaptureOpen} onOpenChange={setCameraCaptureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {cameraCaptureMode === "DOCUMENT" ? <FileScan className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {cameraCaptureMode === "DOCUMENT" ? "Scan Visitor Document" : "Capture Visitor Photo"}
            </DialogTitle>
            <DialogDescription>
              Camera capture is enabled only on secure contexts (HTTPS/localhost). Captured image is stored locally until gate entry submission.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border bg-black/90">
              <video ref={cameraVideoRef} className="min-h-72 w-full object-cover" autoPlay muted playsInline />
            </div>

            {cameraCaptureStatus === "starting" ? <p className="text-xs text-muted-foreground">Starting secure camera stream...</p> : null}
            {cameraCaptureStatus === "ready" ? <p className="text-xs text-muted-foreground">Camera ready. Align and capture the image.</p> : null}
            {cameraCaptureError ? <p className="text-xs text-destructive">{cameraCaptureError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCameraCaptureOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={captureFieldFromCamera} disabled={cameraCaptureStatus !== "ready"}>
              Capture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
