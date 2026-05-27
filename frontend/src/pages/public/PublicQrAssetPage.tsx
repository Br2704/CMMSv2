import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  Factory,
  Gauge,
  History,
  ListChecks,
  Loader2,
  LogIn,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { resolvePublicMachineCode, resolvePublicQrToken } from "@/api/qr";
import { getAssetOverview, type AssetOverview, type AssetWorkOrder } from "@/api/assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/auth.store";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function formatHierarchyValue(code?: string | null, name?: string | null) {
  if (code && name) return `${code} - ${name}`;
  return code || name || "-";
}

function formatMetricMinutes(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toFixed(1)} min`;
}

function assetStatusVariant(status?: string) {
  if (status === "ACTIVE") return "active" as const;
  if (status === "UNDER_MAINTENANCE") return "in_progress" as const;
  return "inactive" as const;
}

function workOrderStatusVariant(status?: string) {
  if (status === "RAISED") return "warning" as const;
  if (status === "OPENED" || status === "IN_PROGRESS") return "info" as const;
  if (status === "CLOSED" || status === "COMPLETED") return "active" as const;
  return "default" as const;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return format(new Date(value), "MMM dd, yyyy");
  } catch {
    return value;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return format(new Date(value), "MMM dd, yyyy HH:mm");
  } catch {
    return value;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-lg font-black text-foreground">{value}</p>
    </div>
  );
}

function TabCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-4 sm:p-6 shadow-sm", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ overview }: { overview: AssetOverview }) {
  const reliability = overview.analytics.reliability;
  const asset = overview.asset;

  const statusVariant = assetStatusVariant(asset.status);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="relative h-48 sm:h-64 w-full overflow-hidden">
          {asset.machineImageUrl ? (
            <img src={asset.machineImageUrl} alt={asset.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Factory className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">{asset.code}</p>
              <h2 className="text-xl sm:text-2xl font-black text-foreground">{asset.name}</h2>
            </div>
            <StatusBadge variant={statusVariant} className="h-7 px-3 text-[10px] font-black uppercase tracking-wider">
              {asset.status?.replace(/_/g, " ") || "READY"}
            </StatusBadge>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="MTTR" value={formatMetricMinutes(reliability?.mttrMinutes)} icon={Clock} color="text-teal-500" />
        <MetricCard label="MTBF" value={formatMetricMinutes(reliability?.mtbfMinutes)} icon={TrendingUp} color="text-sky-500" />
        <MetricCard label="Criticality" value={asset.criticality || "STABLE"} icon={Gauge} color={asset.criticality === "HIGH" ? "text-rose-500" : "text-slate-500"} />
        <MetricCard label="Work Orders" value={String(overview.workOrders.length)} icon={History} color="text-violet-500" />
      </div>

      {/* Hierarchy */}
      <TabCard>
        <SectionTitle icon={Building2} title="Workcenter Context" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Plant</p>
            <p className="text-sm font-semibold text-foreground">{overview.hierarchy.plant?.plantName || overview.hierarchy.plant?.plantCode || "-"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department</p>
            <p className="text-sm font-semibold text-foreground">{overview.hierarchy.department?.name || "-"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Module</p>
            <p className="text-sm font-semibold text-foreground">{overview.hierarchy.module?.name || "-"}</p>
          </div>
        </div>
      </TabCard>

      {/* Asset Details */}
      <TabCard>
        <SectionTitle icon={ShieldCheck} title="Asset Identity" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: "Serial Number", value: asset.serialNumber },
            { label: "Model", value: asset.model },
            { label: "Make", value: asset.make },
            { label: "Manufacturer", value: asset.manufacturer },
            { label: "Location", value: asset.location },
            { label: "Asset Type", value: asset.assetType },
            { label: "Status", value: asset.status },
            { label: "Vendor", value: asset.vendor?.vendorName || asset.vendor?.name || "-" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between border-b border-border/40 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
              <span className="text-sm font-semibold text-foreground text-right">{value || "-"}</span>
            </div>
          ))}
        </div>
      </TabCard>
    </div>
  );
}

// ─── Work Orders Tab ──────────────────────────────────────────────────────────

function WorkOrdersTab({ workOrders }: { workOrders: AssetWorkOrder[] }) {
  if (workOrders.length === 0) {
    return (
      <TabCard>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <History className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No work orders for this asset</p>
        </div>
      </TabCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground">{workOrders.length} record(s)</p>
      </div>
      {workOrders.slice(0, 20).map((wo) => (
        <div
          key={wo.id}
          className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/20 hover:bg-accent/50"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "mt-1 h-2 w-2 shrink-0 rounded-full",
              wo.status === "CLOSED" || wo.status === "COMPLETED" ? "bg-emerald-500" :
              wo.status === "IN_PROGRESS" || wo.status === "OPENED" ? "bg-amber-500" :
              "bg-slate-400"
            )} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-foreground">{wo.woNumber}</p>
                <StatusBadge variant={workOrderStatusVariant(wo.status)} className="h-5 px-1.5 text-[9px]">
                  {wo.status?.replace(/_/g, " ") || "UNKNOWN"}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{wo.problemDescription || "No description"}</p>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                {wo.createdAt && <span>Created: {formatDateTime(wo.createdAt)}</span>}
                {wo.downtimeMinutes && Number(wo.downtimeMinutes) > 0 && (
                  <span>Downtime: {wo.downtimeMinutes} min</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PM Schedules Tab ─────────────────────────────────────────────────────────

function PMSchedulesTab({ pmSchedules }: { pmSchedules: AssetOverview["pmSchedules"] }) {
  if (!pmSchedules || pmSchedules.length === 0) {
    return (
      <TabCard>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No PM/PD schedules for this asset</p>
        </div>
      </TabCard>
    );
  }

  return (
    <div className="space-y-3">
      {pmSchedules.map((pm) => (
        <div key={pm.id} className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider">
                {pm.maintenanceType || "PM"}
              </Badge>
              <span className="text-sm font-bold text-foreground">{pm.template?.templateName || "Schedule"}</span>
            </div>
            <StatusBadge variant={pm.status === "COMPLETED" ? "active" : pm.status === "OVERDUE" ? "destructive" : "warning"} className="h-5 px-1.5 text-[9px]">
              {pm.status?.replace(/_/g, " ") || "PENDING"}
            </StatusBadge>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next Due</span>
              <p className="font-semibold text-foreground">{formatDate(pm.nextDue)}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Frequency</span>
              <p className="font-semibold text-foreground">{pm.frequency || `${pm.frequencyValue ?? ""} ${pm.frequencyType ?? ""}`.trim() || "-"}</p>
            </div>
            {pm.assignedTeam && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team</span>
                <p className="font-semibold text-foreground">{pm.assignedTeam.teamName}</p>
              </div>
            )}
          </div>
          {pm.lastCompleted && (
            <p className="mt-2 text-[10px] text-muted-foreground">Last completed: {formatDate(pm.lastCompleted)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Calibration Tab ──────────────────────────────────────────────────────────

function CalibrationTab({ calibrationTasks }: { calibrationTasks: AssetOverview["calibrationTasks"] }) {
  if (!calibrationTasks || calibrationTasks.length === 0) {
    return (
      <TabCard>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Gauge className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No calibration tasks for this asset</p>
        </div>
      </TabCard>
    );
  }

  return (
    <div className="space-y-3">
      {calibrationTasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-bold text-foreground">{task.instrument?.instrumentName || "Instrument"}</span>
              <StatusBadge variant={
                task.status === "COMPLETED" ? "active" :
                task.status === "OVERDUE" ? "destructive" :
                task.status === "IN_PROGRESS" ? "in_progress" :
                "warning"
              } className="h-5 px-1.5 text-[9px] shrink-0">
                {task.status?.replace(/_/g, " ") || "PENDING"}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Due Date</span>
              <p className="font-semibold text-foreground">{formatDate(task.dueDate)}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
              <p className="font-semibold text-foreground">{task.calibrationType || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Method</span>
              <p className="font-semibold text-foreground">{task.template?.calibrationMethod || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team</span>
              <p className="font-semibold text-foreground">{task.assignedTeam?.teamName || "-"}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Instruments Tab ──────────────────────────────────────────────────────────

function InstrumentsTab({ instruments }: { instruments: AssetOverview["instruments"] }) {
  if (!instruments || instruments.length === 0) {
    return (
      <TabCard>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ListChecks className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No instruments configured for this asset</p>
        </div>
      </TabCard>
    );
  }

  return (
    <div className="space-y-3">
      {instruments.map((inst) => (
        <div key={inst.id} className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{inst.instrumentName}</span>
              <StatusBadge variant={inst.status === "ACTIVE" ? "active" : "inactive"} className="h-5 px-1.5 text-[9px]">
                {inst.status || "UNKNOWN"}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
              <p className="font-semibold text-foreground">{inst.instrumentType || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Serial</span>
              <p className="font-semibold text-foreground">{inst.serialNumber || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Range</span>
              <p className="font-semibold text-foreground">{inst.rangeMin && inst.rangeMax ? `${inst.rangeMin} - ${inst.rangeMax} ${inst.unit || ""}` : "-"}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AMC Tab ──────────────────────────────────────────────────────────────────

function AMCTab({ amcContracts, amcServiceReports }: { amcContracts: AssetOverview["amcContracts"]; amcServiceReports: AssetOverview["amcServiceReports"] }) {
  if ((!amcContracts || amcContracts.length === 0) && (!amcServiceReports || amcServiceReports.length === 0)) {
    return (
      <TabCard>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No AMC contracts or service reports</p>
        </div>
      </TabCard>
    );
  }

  return (
    <div className="space-y-6">
      {amcContracts && amcContracts.length > 0 && (
        <div>
          <SectionTitle icon={ShieldCheck} title="Active Contracts" />
          <div className="space-y-3">
            {amcContracts.map((contract) => (
              <div key={String(contract.id)} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{String(contract.contractName || contract.contractNumber || "Contract")}</span>
                  <StatusBadge variant={(String(contract.status) === "ACTIVE" ? "active" : "warning") as any} className="h-5 px-1.5 text-[9px]">
                    {String(contract.status || "UNKNOWN")}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {amcServiceReports && amcServiceReports.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Service Reports</h3>
          </div>
          <div className="space-y-3">
            {amcServiceReports.slice(0, 5).map((report) => (
              <div key={String(report.id)} className="rounded-xl border border-border/60 bg-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{String(report.serviceDate ? formatDate(String(report.serviceDate)) : "-")}</span>
                  <StatusBadge variant={String(report.verificationStatus) === "VERIFIED" ? "active" : "warning" as any} className="h-5 px-1.5 text-[9px]">
                    {String(report.verificationStatus || "PENDING")}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{report.workDone ? String(report.workDone).slice(0, 120) : "No details"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────

function PerformanceTab({ analytics }: { analytics: AssetOverview["analytics"] }) {
  const samples = analytics.performance;

  return (
    <div className="space-y-6">
      <TabCard>
        <SectionTitle icon={TrendingUp} title="Reliability Summary" />
        {analytics.reliability ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Failures</p>
              <p className="text-xl font-black text-foreground">{analytics.reliability.failures}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Downtime</p>
              <p className="text-xl font-black text-foreground">{formatMetricMinutes(analytics.reliability.downtimeMinutes)}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">MTTR</p>
              <p className="text-xl font-black text-foreground">{formatMetricMinutes(analytics.reliability.mttrMinutes)}</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/50">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">MTBF</p>
              <p className="text-xl font-black text-foreground">{formatMetricMinutes(analytics.reliability.mtbfMinutes)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No reliability data available</p>
        )}
      </TabCard>

      {samples && samples.length > 0 && (
        <TabCard>
          <SectionTitle icon={TrendingUp} title="Performance Samples" />
          <div className="space-y-3">
            {samples.slice(0, 10).map((sample) => (
              <div key={sample.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                <span className="text-xs text-muted-foreground">{formatDateTime(sample.capturedAt)}</span>
                <div className="flex items-center gap-4 text-xs font-semibold text-foreground">
                  {sample.runtimeHours && <span>Runtime: {sample.runtimeHours}h</span>}
                  {sample.energyKwh && <span>Energy: {sample.energyKwh}kWh</span>}
                  {sample.efficiencyValue && <span>Eff: {sample.efficiencyValue}{sample.efficiencyUnit || "%"}</span>}
                </div>
              </div>
            ))}
          </div>
        </TabCard>
      )}

      {analytics.energyMeterConfigs && analytics.energyMeterConfigs.length > 0 && (
        <TabCard>
          <SectionTitle icon={Gauge} title="Energy Meters" />
          <div className="space-y-2">
            {analytics.energyMeterConfigs.map((meter) => (
              <div key={meter.id} className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{meter.meterName}</p>
                  <p className="text-[10px] text-muted-foreground">{meter.connectionType} · {meter.ipAddress || "N/A"}:{meter.port}</p>
                </div>
                <StatusBadge variant={meter.isActive ? "active" : "inactive"} className="h-5 px-1.5 text-[9px]">
                  {meter.isActive ? "Active" : "Inactive"}
                </StatusBadge>
              </div>
            ))}
          </div>
        </TabCard>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublicQrAssetPage() {
  const { token, machineCode } = useParams<{ token?: string; machineCode?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const tokenFromQuery = searchParams.get("token") || undefined;
  const [activeTab, setActiveTab] = useState("overview");

  const returnTo = useMemo(() => {
    if (token) {
      return `/qr/${encodeURIComponent(token)}`;
    }
    if (machineCode) {
      const query = tokenFromQuery ? `?token=${encodeURIComponent(tokenFromQuery)}` : "";
      return `/assets/${encodeURIComponent(machineCode)}${query}`;
    }
    return "/";
  }, [machineCode, token, tokenFromQuery]);

  // Fetch QR resolve data (public)
  const {
    data: qrData,
    isLoading: qrLoading,
    isError: qrError,
    error: qrErrorObj,
  } = useQuery({
    queryKey: ["public_qr_asset", token || null, machineCode || null, tokenFromQuery || null],
    enabled: Boolean(token || machineCode),
    queryFn: async () => {
      if (token) {
        const response = await resolvePublicQrToken(token);
        return response.data;
      }
      if (machineCode) {
        const response = await resolvePublicMachineCode(machineCode, tokenFromQuery);
        return response.data;
      }
      throw new Error("Missing machine code or QR token");
    },
    retry: false,
  });

  // When authenticated, also fetch full asset overview
  const overviewQuery = useQuery({
    queryKey: ["asset_qr_overview", qrData?.asset?.id],
    enabled: Boolean(isAuthenticated && qrData?.asset?.id),
    queryFn: async () => {
      const response = await getAssetOverview(qrData!.asset.id);
      return response.data;
    },
    retry: false,
  });

  const overview = overviewQuery.data;
  const isLoading = qrLoading || (isAuthenticated && overviewQuery.isLoading);
  const isError = qrError;
  const error = qrErrorObj;

  const statusVariant = useMemo(() => {
    if (qrData?.asset.status === "ACTIVE") return "active" as const;
    if (qrData?.asset.status === "UNDER_MAINTENANCE") return "in_progress" as const;
    if (qrData?.asset.status) return "warning" as const;
    return "default" as const;
  }, [qrData?.asset.status]);

  const tabs = [
    { value: "overview", label: "Overview", icon: Factory },
    { value: "work-orders", label: "Work Orders", icon: History },
    { value: "pm", label: "PM Schedules", icon: Calendar },
    { value: "calibration", label: "Calibration", icon: Gauge },
    { value: "instruments", label: "Instruments", icon: ListChecks },
    { value: "amc", label: "AMC", icon: ShieldCheck },
    { value: "performance", label: "Performance", icon: TrendingUp },
  ];

  // When authenticated with data, show full tabbed page
  if (isAuthenticated && qrData?.asset && overview) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                <ScanLine className="h-3 w-3" />
                QR Asset Access
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">{qrData.asset.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{qrData.asset.code}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-xl"
                onClick={() => navigate(`/assets?assetId=${qrData.asset.id}&view=1&from=qr`)}
              >
                <Factory className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase">Full Console</span>
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex w-max min-w-full sm:w-full">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs sm:text-sm">
                    <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="mt-6">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab overview={overview} />
              </TabsContent>
              <TabsContent value="work-orders" className="mt-0">
                <WorkOrdersTab workOrders={overview.workOrders} />
              </TabsContent>
              <TabsContent value="pm" className="mt-0">
                <PMSchedulesTab pmSchedules={overview.pmSchedules} />
              </TabsContent>
              <TabsContent value="calibration" className="mt-0">
                <CalibrationTab calibrationTasks={overview.calibrationTasks} />
              </TabsContent>
              <TabsContent value="instruments" className="mt-0">
                <InstrumentsTab instruments={overview.instruments} />
              </TabsContent>
              <TabsContent value="amc" className="mt-0">
                <AMCTab amcContracts={overview.amcContracts} amcServiceReports={overview.amcServiceReports} />
              </TabsContent>
              <TabsContent value="performance" className="mt-0">
                <PerformanceTab analytics={overview.analytics} />
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="flex flex-col items-center gap-3 pt-8 opacity-40">
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-border to-transparent" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">TamOptiX Technologies • Intelligent CMMS Platform</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Public (unauthenticated) view ──────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020617] text-slate-50 selection:bg-teal-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.15),transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.15),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-8 sm:py-12 lg:py-20">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header Section */}
          <div className="flex flex-col items-center text-center space-y-3">
             <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400">
               <ScanLine className="h-3.5 w-3.5" />
               Machine Authentication
             </div>
             <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">QR Asset Card</h1>
             <p className="max-w-md text-sm font-medium text-slate-400 leading-relaxed">
               Secure access to maintenance protocols and asset performance data.
             </p>
          </div>

          {isLoading ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-[2.5rem] border border-white/5 bg-white/5 backdrop-blur-2xl">
              <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Retrieving Asset Intelligence</p>
            </div>
          ) : isError || !qrData ? (
            <div className="group relative overflow-hidden rounded-[2.5rem] border border-rose-500/20 bg-rose-500/5 p-8 text-center backdrop-blur-2xl">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Invalid QR Credentials</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {error instanceof Error ? error.message : "The provided token is invalid, expired, or the machine has been decommissioned."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild className="rounded-2xl px-8 h-12 bg-rose-600 hover:bg-rose-700 font-bold">
                  <Link to="/login">Authentication Portal</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-2xl px-8 h-12 border-white/10 bg-white/5 hover:bg-white/10 text-slate-200">
                  <Link to="/">System Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary Asset Card */}
              <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white/5 shadow-2xl backdrop-blur-3xl">
                {/* Hero Machine Image */}
                <div className="relative h-64 w-full overflow-hidden sm:h-80">
                  {qrData.asset.machineImageUrl ? (
                    <img src={qrData.asset.machineImageUrl} alt={qrData.asset.name} className="h-full w-full object-cover transition-transform duration-700 hover:scale-110" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900/50">
                      <Factory className="h-16 w-16 text-slate-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-60" />
                  <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-400">{qrData.asset.code}</p>
                      <h2 className="text-2xl font-black text-white sm:text-3xl">{qrData.asset.name}</h2>
                    </div>
                    <StatusBadge variant={statusVariant} className="h-8 px-4 text-[10px] font-black uppercase tracking-widest">
                      {qrData.asset.status || "READY"}
                    </StatusBadge>
                  </div>
                </div>

                <CardContent className="p-6 sm:p-8">
                  {/* Hierarchy Grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Plant Unit</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">
                        {qrData.hierarchy.plant?.name || qrData.hierarchy.plant?.code || "-"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <QrCode className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Department</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">
                        {qrData.hierarchy.department?.name || qrData.hierarchy.department?.code || "-"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Location</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">{qrData.asset.location || "On-site"}</p>
                    </div>
                  </div>

                  {/* Reliability Snapshot */}
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Performance Metrics</h3>
                      <ShieldCheck className="h-4 w-4 text-teal-500" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">MTTR</p>
                        <p className="text-base font-black text-teal-400">{formatMetricMinutes(qrData.asset.reliability?.mttrMinutes)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">MTBF</p>
                        <p className="text-base font-black text-sky-400">{formatMetricMinutes(qrData.asset.reliability?.mtbfMinutes)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Uptime</p>
                        <p className="text-base font-black text-emerald-400">98.2%</p>
                      </div>
                    </div>
                  </div>

                  {/* Auth Actions */}
                  <div className="mt-10 rounded-[2rem] border border-teal-500/20 bg-teal-500/5 p-6 text-center sm:p-8">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
                      <LogIn className="h-6 w-6" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-100">Elevated Protocol Access</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      Please authenticate to unlock full maintenance controls, history logs, and work order creation for this asset.
                    </p>
                    
                    <div className="mt-8 flex flex-col gap-3">
                      {isAuthLoading ? (
                        <Button disabled className="h-14 rounded-2xl bg-teal-600 font-black uppercase tracking-widest">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Security Validation
                        </Button>
                      ) : (
                        <Button asChild className="h-14 rounded-2xl bg-teal-600 hover:bg-teal-500 font-black uppercase tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                            Continue to Maintenance Console
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        className="h-12 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        onClick={() => window.location.reload()}
                      >
                        Refresh Hardware Sync
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Secondary Info Bento */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">Asset Identity</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    This encrypted QR signature uniquely identifies asset <span className="font-bold text-slate-300">{qrData.asset.code}</span> within the TamOptiX ecosystem.
                  </p>
                  <div className="rounded-xl bg-slate-950/60 p-3 font-mono text-[9px] text-teal-500/70 break-all border border-white/5">
                    {qrData?.links?.publicResolverUrl || window.location.href}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-slate-200">Quick Context</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Scanning this QR provides instant verification of physical presence. All subsequent actions are logged with this location context for audit compliance.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Audit Ready</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="flex flex-col items-center gap-4 pt-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
             <div className="h-px w-24 bg-gradient-to-r from-transparent via-slate-500 to-transparent" />
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">TamOptiX Technologies • Intelligent CMMS Platform</p>
          </div>
        </div>
      </div>
    </div>
  );
}
