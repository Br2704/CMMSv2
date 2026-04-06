import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, Factory, Gauge, History, Image as ImageIcon, Loader2, QrCode, ScanLine, Search, ShieldCheck, Wrench } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createAssetEnergyMeterConfig, getAsset, getAssetOverview, type Asset, type AssetOverview } from "@/api/assets";
import { getMasterDataGraph } from "@/api/master-data";
import { listWorkOrders } from "@/api/workorders";
import { getAssetQr, resolveQrMachineCode, resolveQrToken, type AssetQrData } from "@/api/qr";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ViewDialog } from "@/components/shared/ViewDialog";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { EnterpriseAssetMindmap } from "@/components/assets/EnterpriseAssetMindmap";
import { parseQrContent } from "@/mobile/qr";
import { toast } from "sonner";

interface WorkOrderSummary {
  id: string;
  assetId: string | null;
  status: string | null;
}

interface KpiPreview {
  mttr: string;
  mtbf: string;
  loading: boolean;
}

type AssetStatusFilter = "all" | "ACTIVE" | "UNDER_MAINTENANCE" | "INACTIVE";

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

function formatMinutes(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toFixed(1)} min`;
}

type EnergyMeterFormState = {
  checklistName: string;
  meterName: string;
  connectionType: "MODBUS_TCP" | "MODBUS_RTU_RS485";
  ipAddress: string;
  port: string;
  modbusSlaveId: string;
  modbusRegister: string;
  baudRate: string;
  parity: "NONE" | "EVEN" | "ODD";
  stopBits: string;
  pollIntervalSeconds: string;
  driverType: "DOTNET_RS485_BRIDGE" | "NATIVE_MODBUS_TCP";
  bridgeEndpoint: string;
  notes: string;
};

const defaultEnergyMeterForm: EnergyMeterFormState = {
  checklistName: "Energy Meter Checklist",
  meterName: "",
  connectionType: "MODBUS_TCP",
  ipAddress: "",
  port: "502",
  modbusSlaveId: "1",
  modbusRegister: "40001",
  baudRate: "9600",
  parity: "NONE",
  stopBits: "1",
  pollIntervalSeconds: "60",
  driverType: "DOTNET_RS485_BRIDGE",
  bridgeEndpoint: "",
  notes: "",
};

function parseOptionalInteger(value: string): number | null | "invalid" {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^-?\d+$/.test(normalized)) return "invalid";
  return Number(normalized);
}

function AssetOverviewPanel({
  overview,
  qrData,
  qrImageUrl,
  qrLoading,
  onRaiseWorkOrder,
  onOpenEnergyMeterChecklist,
}: {
  overview: AssetOverview;
  qrData: AssetQrData | null;
  qrImageUrl: string | null;
  qrLoading: boolean;
  onRaiseWorkOrder: () => void;
  onOpenEnergyMeterChecklist: () => void;
}) {
  const reliability = overview.analytics.reliability;
  const resolverUrl = qrData?.publicResolverUrl || "";

  const handleCopyResolverUrl = async () => {
    if (!resolverUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(resolverUrl);
      toast.success("QR link copied");
    } catch {
      toast.error("Failed to copy QR link");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/95">
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex w-full justify-center">
              <div className="flex h-[220px] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm">
                {overview.asset.machineImageUrl ? (
                  <img src={overview.asset.machineImageUrl} alt={overview.asset.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <ImageIcon className="mb-2 h-10 w-10" />
                    <p className="text-sm">No Image Available</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Asset QR</p>
              </div>
              <div className="mt-3 flex min-h-[172px] items-center justify-center rounded-lg border border-border/60 bg-white p-3 shadow-sm">
                {qrLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : qrImageUrl ? (
                  <img src={qrImageUrl} alt={`${overview.asset.code} QR`} className="h-40 w-40 object-contain" />
                ) : (
                  <div className="text-center text-xs text-muted-foreground">
                    QR preview is not available.
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">QR Code ID:</span> {qrData?.qrCodeId || overview.asset.qrCodeId || "-"}
                </p>
                {resolverUrl ? (
                  <>
                    <button
                      type="button"
                      className="break-all text-left transition-colors hover:text-primary"
                      onClick={() => void handleCopyResolverUrl()}
                    >
                      <span className="font-medium text-foreground">Resolver:</span> {resolverUrl}
                    </button>
                    <p className="pt-1 text-[11px] text-muted-foreground">Click the resolver link to copy it to the clipboard.</p>
                  </>
                ) : (
                  <p>
                    <span className="font-medium text-foreground">Resolver:</span> -
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{overview.asset.code}</p>
              <h3 className="truncate text-lg font-semibold">{overview.asset.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {overview.hierarchy.department ? `${overview.hierarchy.department.code} - ${overview.hierarchy.department.name}` : "No Department"} /{" "}
                {overview.hierarchy.module ? `${overview.hierarchy.module.code ? `${overview.hierarchy.module.code} - ` : ""}${overview.hierarchy.module.name}` : "No Module"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge variant={assetStatusVariant(overview.asset.status)}>{overview.asset.status.replace(/_/g, " ")}</StatusBadge>
              <StatusBadge variant={overview.asset.criticality === "HIGH" ? "critical" : overview.asset.criticality === "MEDIUM" ? "warning" : "default"}>
                {overview.asset.criticality}
              </StatusBadge>
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md bg-muted/50 p-2"><p className="text-muted-foreground">Type</p><p className="font-medium">{overview.asset.assetType || overview.asset.type}</p></div>
            <div className="rounded-md bg-muted/50 p-2"><p className="text-muted-foreground">AMC Vendor</p><p className="font-medium">{overview.asset.vendor?.vendorName || overview.asset.vendor?.name || "-"}</p></div>
            <div className="rounded-md bg-muted/50 p-2"><p className="text-muted-foreground">Model</p><p className="font-medium">{overview.asset.model || "-"}</p></div>
            <div className="rounded-md bg-muted/50 p-2"><p className="text-muted-foreground">Location</p><p className="font-medium">{overview.asset.location || "-"}</p></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Reliability</p></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/20 p-2"><p className="text-[11px] text-muted-foreground">MTTR</p><p className="text-sm font-semibold">{formatMinutes(reliability?.mttrMinutes)}</p></div>
                <div className="rounded-md bg-muted/20 p-2"><p className="text-[11px] text-muted-foreground">MTBF</p><p className="text-sm font-semibold">{formatMinutes(reliability?.mtbfMinutes)}</p></div>
                <div className="rounded-md bg-muted/20 p-2"><p className="text-[11px] text-muted-foreground">Downtime</p><p className="text-sm font-semibold">{formatMinutes(reliability?.downtimeMinutes)}</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">AMC Coverage</p></div>
              <div className="mt-3 space-y-2">
                {overview.amcContracts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No AMC contracts linked.</p>
                ) : (
                  overview.amcContracts.slice(0, 3).map((contract, index) => (
                    <div key={String(contract.id || index)} className="rounded-md border border-border/50 bg-muted/20 p-2.5">
                      <p className="text-xs font-semibold text-primary">{String(contract.contractName || contract.contract_name || "AMC Contract")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{String(contract.status || "ACTIVE").replace(/_/g, " ")}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Maintenance Linkage</p></div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>Work orders: {overview.workOrders.length}</p>
                <p>PM / Pd schedules: {overview.pmSchedules.length}</p>
                <p>Calibration tasks: {overview.calibrationTasks.length}</p>
                <p>Service reports: {overview.amcServiceReports.length}</p>
                <p>Spare usage logs: {overview.spareUsage.length}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Energy / ESG Snapshot</p></div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {overview.analytics.performance.slice(0, 3).map((sample) => (
                  <p key={sample.id}>
                    {format(new Date(sample.capturedAt), "dd MMM yyyy, hh:mm a")} | Runtime {sample.runtimeHours || "-"} h | Energy {sample.energyKwh || "-"} kWh
                  </p>
                ))}
                {overview.analytics.performance.length === 0 ? <p>No recent energy samples.</p> : null}
                <p>ESG entries in plant scope: {overview.analytics.esgSample.length}</p>
                {overview.analytics.energyMeterConfigs.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 p-2">
                    {overview.analytics.energyMeterConfigs.slice(0, 3).map((config) => (
                      <p key={config.id}>
                        {config.meterName}: {config.connectionType === "MODBUS_TCP" ? `${config.ipAddress || "-"}:${config.port}` : `Slave ${config.modbusSlaveId || "-"}`}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>No energy meter checklist configured.</p>
                )}
                <Button type="button" variant="outline" size="sm" className="mt-1 gap-2" onClick={onOpenEnergyMeterChecklist}>
                  <Gauge className="h-3.5 w-3.5" />
                  Energy Meter Checklist
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2"><Factory className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Recent Work Orders</p></div>
            <div className="mt-3 space-y-2">
              {overview.workOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No work orders recorded for this machine.</p>
              ) : (
                overview.workOrders.slice(0, 6).map((workOrder) => (
                  <div key={workOrder.id} className="rounded-md border border-border/50 bg-muted/20 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-primary">{workOrder.woNumber}</span>
                      <StatusBadge className="text-[10px]" variant={workOrderStatusVariant(workOrder.status)}>{workOrder.status.replace(/_/g, " ")}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/90">{workOrder.problemDescription || "No problem description"}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-2" onClick={onRaiseWorkOrder}>
              <Wrench className="h-4 w-4" />
              Raise Work Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, activePlantId } = useAuthStore();
  const userIsSuperAdmin = isSuperAdmin(user);
  const [activeTab, setActiveTab] = useState<"flow" | "list">("flow");
  const [search, setSearch] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatusFilter>("all");
  const [flowSearch, setFlowSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [qrBlinkAssetId, setQrBlinkAssetId] = useState<string | null>(null);
  const [assetKpiPreview, setAssetKpiPreview] = useState<Record<string, KpiPreview>>({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [resolvingQr, setResolvingQr] = useState(false);
  const [isEnergyMeterDialogOpen, setIsEnergyMeterDialogOpen] = useState(false);
  const [energyMeterSubmitting, setEnergyMeterSubmitting] = useState(false);
  const [energyMeterForm, setEnergyMeterForm] = useState<EnergyMeterFormState>(defaultEnergyMeterForm);
  const kpiPrefetchInFlightRef = useRef<Set<string>>(new Set());
  const qrBlinkTimeoutRef = useRef<number | null>(null);
  const assetIdFromQuery = searchParams.get("assetId");
  const queryOpenHandledRef = useRef<string | null>(null);

  const masterDataQuery = useQuery({
    queryKey: ["assets_hierarchy_graph", userIsSuperAdmin, user?.plantId, activePlantId],
    queryFn: async () =>
      getMasterDataGraph({
        includeInactive: true,
        plantId: userIsSuperAdmin ? undefined : user?.plantId || activePlantId || undefined,
      }),
  });

  const workOrdersQuery = useQuery({
    queryKey: ["assets_work_order_summary", userIsSuperAdmin, user?.plantId, activePlantId],
    queryFn: async () =>
      listWorkOrders({
        page: 1,
        limit: 1000,
        plantId: userIsSuperAdmin ? undefined : user?.plantId || activePlantId || undefined,
      }),
  });

  const overviewQuery = useQuery({
    queryKey: ["asset_overview", selectedAsset?.id],
    enabled: Boolean(selectedAsset?.id && isViewOpen),
    queryFn: async () => getAssetOverview(selectedAsset!.id),
  });
  const directAssetQuery = useQuery({
    queryKey: ["asset_view_prefill", assetIdFromQuery],
    enabled: Boolean(assetIdFromQuery),
    queryFn: async () => {
      const response = await getAsset(assetIdFromQuery!);
      return response.data;
    },
  });
  const assetQrQuery = useQuery({
    queryKey: ["asset_qr_preview", selectedAsset?.id],
    enabled: Boolean(selectedAsset?.id && isViewOpen),
    queryFn: async () => getAssetQr(selectedAsset!.id),
  });
  const [assetQrImageUrl, setAssetQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qrPayload = assetQrQuery.data?.data?.qrPayload;

    if (!qrPayload) {
      setAssetQrImageUrl(null);
      return;
    }

    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const nextImageUrl = await QRCode.toDataURL(qrPayload, {
          errorCorrectionLevel: "M",
          width: 320,
          margin: 2,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        if (!cancelled) {
          setAssetQrImageUrl(nextImageUrl);
        }
      } catch {
        if (!cancelled) {
          setAssetQrImageUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetQrQuery.data?.data?.qrPayload]);

  useEffect(() => {
    return () => {
      if (qrBlinkTimeoutRef.current) {
        window.clearTimeout(qrBlinkTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const overview = overviewQuery.data?.data;
    if (!overview?.asset?.id) return;

    setAssetKpiPreview((current) => ({
      ...current,
      [overview.asset.id]: {
        mttr: formatMinutes(overview.analytics.reliability?.mttrMinutes),
        mtbf: formatMinutes(overview.analytics.reliability?.mtbfMinutes),
        loading: false,
      },
    }));
  }, [overviewQuery.data?.data]);

  const graph = masterDataQuery.data?.data;
  const plants = useMemo(() => graph?.plants ?? [], [graph?.plants]);
  const departments = useMemo(() => graph?.departments ?? [], [graph?.departments]);
  const modules = useMemo(() => graph?.modules ?? [], [graph?.modules]);
  const assets = useMemo(() => graph?.assets ?? [], [graph?.assets]);
  const workOrders = ((workOrdersQuery.data?.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id || ""),
    assetId: row.assetId ? String(row.assetId) : row.asset_id ? String(row.asset_id) : null,
    status: row.status ? String(row.status) : null,
  })) as WorkOrderSummary[];

  useEffect(() => {
    if (userIsSuperAdmin) {
      if (plants.length === 0 || selectedPlantId) return;
      setSelectedPlantId(plants.find((plant) => plant.id === activePlantId)?.id || "");
      return;
    }
    setSelectedPlantId(user?.plantId || activePlantId || "");
  }, [activePlantId, plants, selectedPlantId, user?.plantId, userIsSuperAdmin]);

  useEffect(() => {
    if (!selectedPlantId) {
      setSelectedDepartmentId("");
      setSelectedModuleId("");
      return;
    }
    if (!departments.some((department) => department.id === selectedDepartmentId && department.plantId === selectedPlantId)) {
      setSelectedDepartmentId("");
    }
  }, [departments, selectedDepartmentId, selectedPlantId]);

  useEffect(() => {
    if (!modules.some((module) => module.id === selectedModuleId && (!selectedDepartmentId || module.departmentId === selectedDepartmentId) && (!selectedPlantId || module.plantId === selectedPlantId))) {
      setSelectedModuleId("");
    }
  }, [modules, selectedDepartmentId, selectedModuleId, selectedPlantId]);

  const selectedPlant = useMemo(() => plants.find((plant) => plant.id === selectedPlantId) || null, [plants, selectedPlantId]);
  const selectedDepartment = useMemo(() => departments.find((department) => department.id === selectedDepartmentId) || null, [departments, selectedDepartmentId]);
  const selectedModule = useMemo(() => modules.find((module) => module.id === selectedModuleId) || null, [modules, selectedModuleId]);

  const departmentsForPlant = useMemo(
    () => departments.filter((department) => department.plantId === selectedPlantId && department.isActive),
    [departments, selectedPlantId],
  );

  const modulesForScope = useMemo(
    () =>
      modules.filter((module) => {
        if (selectedPlantId && module.plantId !== selectedPlantId) return false;
        if (selectedDepartmentId && module.departmentId !== selectedDepartmentId) return false;
        return module.isActive;
      }),
    [modules, selectedDepartmentId, selectedPlantId],
  );

  const visibleAssets = useMemo(
    () =>
      assets
        .filter((asset) => {
          if (selectedPlantId && asset.plantId !== selectedPlantId) return false;
          if (selectedDepartmentId && asset.departmentId !== selectedDepartmentId) return false;
          if (selectedModuleId && asset.moduleId !== selectedModuleId) return false;
          if (statusFilter !== "all" && asset.status !== statusFilter) return false;
          const query = search.trim().toLowerCase();
          if (!query) return true;
          return [asset.code, asset.name, asset.assetType || "", asset.model || "", asset.serialNumber || ""].some((value) => value.toLowerCase().includes(query));
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
    [assets, search, selectedDepartmentId, selectedModuleId, selectedPlantId, statusFilter],
  );

  useEffect(() => {
    if (!assetIdFromQuery) {
      queryOpenHandledRef.current = null;
      return;
    }

    const resolvedAsset =
      visibleAssets.find((asset) => asset.id === assetIdFromQuery) ||
      assets.find((asset) => asset.id === assetIdFromQuery) ||
      directAssetQuery.data ||
      null;

    if (!resolvedAsset || queryOpenHandledRef.current === resolvedAsset.id) return;

    queryOpenHandledRef.current = resolvedAsset.id;
    setSelectedAsset(resolvedAsset);
    setIsViewOpen(true);
    setActiveTab("list");
    if (resolvedAsset.plantId) {
      setSelectedPlantId(resolvedAsset.plantId);
    }
    setSelectedDepartmentId(resolvedAsset.departmentId || "");
    setSelectedModuleId(resolvedAsset.moduleId || "");
  }, [assetIdFromQuery, assets, directAssetQuery.data, visibleAssets]);

  const workOrdersByAsset = useMemo(() => {
    const map = new Map<string, WorkOrderSummary[]>();
    workOrders.forEach((workOrder) => {
      if (!workOrder.assetId) return;
      const bucket = map.get(workOrder.assetId) || [];
      bucket.push(workOrder);
      map.set(workOrder.assetId, bucket);
    });
    return map;
  }, [workOrders]);

  const assetsWithOpenWo = useMemo(
    () =>
      visibleAssets.filter((asset) => (workOrdersByAsset.get(asset.id) || []).some((workOrder) => workOrder.status && workOrder.status !== "CLOSED")).length,
    [visibleAssets, workOrdersByAsset],
  );

  const handlePrefetchAssetKpi = async (assetId: string) => {
    if (!assetId) return;
    if (kpiPrefetchInFlightRef.current.has(assetId)) return;
    if (assetKpiPreview[assetId] && !assetKpiPreview[assetId].loading) return;

    kpiPrefetchInFlightRef.current.add(assetId);
    setAssetKpiPreview((current) => {
      const previous = current[assetId];
      if (previous && !previous.loading) return current;
      return {
        ...current,
        [assetId]: {
          mttr: previous?.mttr || "-",
          mtbf: previous?.mtbf || "-",
          loading: true,
        },
      };
    });

    try {
      const response = await getAssetOverview(assetId);
      setAssetKpiPreview((current) => ({
        ...current,
        [assetId]: {
          mttr: formatMinutes(response.data.analytics.reliability?.mttrMinutes),
          mtbf: formatMinutes(response.data.analytics.reliability?.mtbfMinutes),
          loading: false,
        },
      }));
    } catch {
      setAssetKpiPreview((current) => ({
        ...current,
        [assetId]: {
          mttr: current[assetId]?.mttr || "-",
          mtbf: current[assetId]?.mtbf || "-",
          loading: false,
        },
      }));
    } finally {
      kpiPrefetchInFlightRef.current.delete(assetId);
    }
  };

  const openAssetFromContext = async (
    assetId: string,
    options?: {
      openDialog?: boolean;
      targetTab?: "flow" | "list";
      blinkInMindmap?: boolean;
    },
  ) => {
    let resolvedAsset = assets.find((asset) => asset.id === assetId) || null;
    if (!resolvedAsset) {
      const response = await getAsset(assetId);
      resolvedAsset = response.data;
    }

    if (!resolvedAsset) {
      throw new Error("Machine not found for this QR");
    }

    if (resolvedAsset.plantId) {
      setSelectedPlantId(resolvedAsset.plantId);
    }
    setSelectedDepartmentId(resolvedAsset.departmentId || "");
    setSelectedModuleId(resolvedAsset.moduleId || "");
    setSelectedAsset(resolvedAsset);

    const openDialog = options?.openDialog ?? true;
    const targetTab = options?.targetTab ?? "list";

    setActiveTab(targetTab);
    setIsViewOpen(openDialog);

    if (options?.blinkInMindmap) {
      setQrBlinkAssetId(resolvedAsset.id);
      if (qrBlinkTimeoutRef.current) {
        window.clearTimeout(qrBlinkTimeoutRef.current);
      }
      qrBlinkTimeoutRef.current = window.setTimeout(() => {
        setQrBlinkAssetId((current) => (current === resolvedAsset?.id ? null : current));
      }, 2200);
    }

    return resolvedAsset;
  };

  const handleAssetQrDecoded = async (rawValue: string) => {
    setResolvingQr(true);
    try {
      const parsed = parseQrContent(rawValue);
      let scannedMachineId = parsed.machineId || "";

      if (!scannedMachineId && parsed.machineCode) {
        const resolvedByCode = await resolveQrMachineCode(parsed.machineCode, parsed.token);
        scannedMachineId = resolvedByCode.data.asset?.id || "";
      }

      if (!scannedMachineId && parsed.token) {
        const resolved = await resolveQrToken(parsed.token);
        scannedMachineId = resolved.data.asset?.id || "";
      }

      if (!scannedMachineId) {
        throw new Error("Invalid machine QR. Please rescan.");
      }

      const locatedAsset = await openAssetFromContext(scannedMachineId, {
        openDialog: false,
        targetTab: "flow",
        blinkInMindmap: true,
      });
      setFlowSearch(`${locatedAsset.code} ${locatedAsset.name}`);
      toast.success("Machine located in enterprise mindmap");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to resolve machine QR");
      setIsQrScannerOpen(true);
    } finally {
      setResolvingQr(false);
    }
  };

  const openWorkOrderHistory = (asset: Asset) => {
    navigate(`/work-orders?assetId=${asset.id}`);
  };

  const assetColumns = [
    {
      key: "machine",
      header: "Machine",
      render: (asset: Asset) => <div><p className="font-medium">{asset.code}</p><p className="text-xs text-muted-foreground">{asset.name}</p></div>,
    },
    {
      key: "hierarchy",
      header: "Department / Module",
      render: (asset: Asset) => {
        const department = departments.find((item) => item.id === asset.departmentId);
        const module = modules.find((item) => item.id === asset.moduleId);
        return <div><p className="text-sm">{department ? `${department.code} - ${department.name}` : "-"}</p><p className="text-xs text-muted-foreground">{module ? `${module.code ? `${module.code} - ` : ""}${module.name}` : "-"}</p></div>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (asset: Asset) => <StatusBadge variant={assetStatusVariant(asset.status)}>{asset.status.replace(/_/g, " ")}</StatusBadge>,
    },
    {
      key: "wo",
      header: "WO History",
      render: (asset: Asset) => `${(workOrdersByAsset.get(asset.id) || []).length}`,
      hideOnMobile: true,
    },
    {
      key: "actions",
      header: "Actions",
      render: (asset: Asset) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedAsset(asset); setIsViewOpen(true); }} aria-label={`View ${asset.name}`}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openWorkOrderHistory(asset)} aria-label={`Work order history for ${asset.name}`}>
            <History className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isLoading = masterDataQuery.isLoading || workOrdersQuery.isLoading;
  const handleRaiseWorkOrder = () => {
    if (!selectedAsset?.id) return;
    navigate(`/work-orders?assetId=${selectedAsset.id}&mode=create-breakdown`);
  };
  const clearAssetQueryParams = () => {
    if (!assetIdFromQuery && !searchParams.get("view") && !searchParams.get("from")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("assetId");
    nextParams.delete("view");
    nextParams.delete("from");
    setSearchParams(nextParams, { replace: true });
  };

  const handleOpenEnergyMeterChecklist = () => {
    if (!selectedAsset) {
      toast.error("Select a machine before configuring an energy meter");
      return;
    }

    setEnergyMeterForm({
      ...defaultEnergyMeterForm,
      meterName: `${selectedAsset.code} Energy Meter`,
    });
    setIsEnergyMeterDialogOpen(true);
  };

  const updateEnergyMeterForm = <K extends keyof EnergyMeterFormState>(key: K, value: EnergyMeterFormState[K]) => {
    setEnergyMeterForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmitEnergyMeterChecklist = async () => {
    if (!selectedAsset?.id) {
      toast.error("No machine selected for checklist configuration");
      return;
    }

    const checklistName = energyMeterForm.checklistName.trim() || defaultEnergyMeterForm.checklistName;
    const meterName = energyMeterForm.meterName.trim();
    const ipAddress = energyMeterForm.ipAddress.trim();
    const modbusRegister = energyMeterForm.modbusRegister.trim();
    const bridgeEndpoint = energyMeterForm.bridgeEndpoint.trim();
    const notes = energyMeterForm.notes.trim();

    if (!meterName) {
      toast.error("Meter name is required");
      return;
    }

    if (energyMeterForm.connectionType === "MODBUS_TCP" && !ipAddress) {
      toast.error("IP address is required for Modbus TCP");
      return;
    }

    const port = Number(energyMeterForm.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error("Port must be between 1 and 65535");
      return;
    }

    const pollIntervalSeconds = Number(energyMeterForm.pollIntervalSeconds);
    if (!Number.isInteger(pollIntervalSeconds) || pollIntervalSeconds < 5 || pollIntervalSeconds > 86400) {
      toast.error("Poll interval must be between 5 and 86400 seconds");
      return;
    }

    const modbusSlaveId = parseOptionalInteger(energyMeterForm.modbusSlaveId);
    if (modbusSlaveId === "invalid") {
      toast.error("Slave ID must be a whole number");
      return;
    }
    if (modbusSlaveId !== null && (modbusSlaveId < 1 || modbusSlaveId > 247)) {
      toast.error("Slave ID must be between 1 and 247");
      return;
    }
    if (energyMeterForm.connectionType === "MODBUS_RTU_RS485" && modbusSlaveId === null) {
      toast.error("Slave ID is required for Modbus RTU RS485");
      return;
    }

    const baudRate = parseOptionalInteger(energyMeterForm.baudRate);
    if (baudRate === "invalid") {
      toast.error("Baud rate must be a whole number");
      return;
    }
    if (baudRate !== null && (baudRate < 300 || baudRate > 115200)) {
      toast.error("Baud rate must be between 300 and 115200");
      return;
    }

    const stopBits = parseOptionalInteger(energyMeterForm.stopBits);
    if (stopBits === "invalid") {
      toast.error("Stop bits must be a whole number");
      return;
    }
    if (stopBits !== null && (stopBits < 1 || stopBits > 2)) {
      toast.error("Stop bits must be either 1 or 2");
      return;
    }

    setEnergyMeterSubmitting(true);
    try {
      await createAssetEnergyMeterConfig(selectedAsset.id, {
        checklistName,
        meterName,
        connectionType: energyMeterForm.connectionType,
        ipAddress: energyMeterForm.connectionType === "MODBUS_TCP" ? ipAddress : null,
        port,
        modbusSlaveId,
        modbusRegister: modbusRegister || null,
        baudRate,
        parity: energyMeterForm.connectionType === "MODBUS_RTU_RS485" ? energyMeterForm.parity : null,
        stopBits,
        pollIntervalSeconds,
        driverType: energyMeterForm.driverType,
        bridgeEndpoint: bridgeEndpoint || null,
        notes: notes || null,
        isActive: true,
      });
      toast.success("Energy meter checklist saved");
      setIsEnergyMeterDialogOpen(false);
      setEnergyMeterForm(defaultEnergyMeterForm);
      await overviewQuery.refetch();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save energy meter checklist");
    } finally {
      setEnergyMeterSubmitting(false);
    }
  };

  return (
    <PageShell className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Assets"
        subtitle="Advanced machine hierarchy and QR-assisted machine lookup"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => setIsQrScannerOpen(true)} disabled={resolvingQr}>
            <QrCode className="h-4 w-4" />
            {resolvingQr ? "Resolving QR..." : "QR Scan"}
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "flow" | "list")} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="flow">Machine Flow Chart</TabsTrigger>
          <TabsTrigger value="list">Machine Directory</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="space-y-4">
          <Card className="border-border/70 bg-gradient-to-br from-card to-muted/30 shadow-card">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center gap-2">
                {userIsSuperAdmin ? (
                  <select aria-label="Flow chart plant filter" className="h-9 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm" value={selectedPlantId} onChange={(event) => {
                    setSelectedPlantId(event.target.value);
                    setSelectedDepartmentId("");
                    setSelectedModuleId("");
                  }}>
                    <option value="">All Plants</option>
                    {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantCode || plant.plantName}</option>)}
                  </select>
                ) : (
                  <div className="flex h-9 min-w-[220px] items-center rounded-md border border-input bg-background px-3 text-sm">
                    {selectedPlant ? (selectedPlant.plantCode || selectedPlant.plantName) : "Plant Not Assigned"}
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setSelectedDepartmentId("");
                    setSelectedModuleId("");
                    setFlowSearch("");
                    setQrBlinkAssetId(null);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <EnterpriseAssetMindmap
            plants={plants}
            departments={departments}
            modules={modules}
            assets={assets.filter((asset) => asset.isActive)}
            workOrdersByAsset={workOrdersByAsset}
            selectedPlantId={selectedPlantId}
            selectedDepartmentId={selectedDepartmentId}
            selectedModuleId={selectedModuleId}
            selectedAssetId={selectedAsset?.id || null}
            searchTerm={flowSearch}
            statusFilter="all"
            user={user}
            userIsSuperAdmin={userIsSuperAdmin}
            blinkAssetId={qrBlinkAssetId}
            assetKpiPreview={assetKpiPreview}
            onSearchChange={setFlowSearch}
            onSelectPlant={(plantId) => {
              setSelectedPlantId(plantId);
              setSelectedDepartmentId("");
              setSelectedModuleId("");
            }}
            onSelectDepartment={(departmentId) => {
              setSelectedDepartmentId(departmentId);
              setSelectedModuleId("");
            }}
            onSelectModule={setSelectedModuleId}
            onSelectAsset={(asset) => {
              setSelectedAsset(asset);
              setIsViewOpen(true);
              setActiveTab("flow");
            }}
            onPrefetchAssetKpi={(assetId) => {
              void handlePrefetchAssetKpi(assetId);
            }}
          />
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          <Card className="border-border/70 bg-gradient-to-br from-card to-muted/30 shadow-card">
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="xl:col-span-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search machine code, name, model, serial..." />
                  </div>
                </div>

                {userIsSuperAdmin ? (
                  <select aria-label="Machine list plant filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedPlantId} onChange={(event) => {
                    setSelectedPlantId(event.target.value);
                    setSelectedDepartmentId("");
                    setSelectedModuleId("");
                  }}>
                    <option value="">All Plants</option>
                    {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantCode}</option>)}
                  </select>
                ) : null}

                <select aria-label="Machine list department filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedDepartmentId} onChange={(event) => {
                  setSelectedDepartmentId(event.target.value);
                  setSelectedModuleId("");
                }}>
                  <option value="">All Departments</option>
                  {departmentsForPlant.map((department) => <option key={department.id} value={department.id}>{department.code} - {department.name}</option>)}
                </select>

                <select aria-label="Machine list module filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
                  <option value="">All Modules</option>
                  {modulesForScope.map((module) => <option key={module.id} value={module.id}>{module.code ? `${module.code} - ` : ""}{module.name}</option>)}
                </select>

                <select aria-label="Machine list status filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AssetStatusFilter)}>
                  <option value="all">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="border-border/60"><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Machines In Scope</p><p className="mt-1 text-2xl font-bold">{visibleAssets.length}</p></CardContent></Card>
                <Card className="border-border/60"><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">With Open Work Orders</p><p className="mt-1 text-2xl font-bold">{assetsWithOpenWo}</p></CardContent></Card>
                <Card className="border-border/60"><CardContent className="pt-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Hierarchy Path</p><p className="mt-1 text-sm font-medium">{userIsSuperAdmin && !selectedPlantId ? "ALL-PLANTS" : selectedPlant?.plantCode || "-"} / {selectedDepartment?.code || "ALL-DEPT"} / {selectedModule?.code || "ALL-MOD"}</p></CardContent></Card>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base sm:text-lg">Machines List</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <ResponsiveTable
                  data={visibleAssets}
                  columns={assetColumns}
                  keyExtractor={(asset) => asset.id}
                  emptyMessage="No machines found for the selected hierarchy and filters."
                  mobileCard={(asset) => {
                    const department = departments.find((item) => item.id === asset.departmentId);
                    const module = modules.find((item) => item.id === asset.moduleId);
                    return (
                      <MobileCard
                        onView={() => { setSelectedAsset(asset); setIsViewOpen(true); }}
                        actions={[
                          {
                            label: "Work Order History",
                            icon: <History className="mr-2 h-4 w-4" />,
                            onClick: () => openWorkOrderHistory(asset),
                          },
                        ]}
                      >
                        <MobileCardHeader title={asset.code} subtitle={asset.name} badge={<StatusBadge variant={assetStatusVariant(asset.status)}>{asset.status.replace(/_/g, " ")}</StatusBadge>} />
                        <MobileCardRow label="Department" value={department ? department.code : "-"} />
                        <MobileCardRow label="Module" value={module ? module.code || module.name : "-"} />
                        <MobileCardRow label="Type" value={asset.assetType || "-"} />
                        <MobileCardRow label="WO History" value={(workOrdersByAsset.get(asset.id) || []).length} />
                      </MobileCard>
                    );
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MobileQrScannerDialog
        open={isQrScannerOpen}
        onOpenChange={setIsQrScannerOpen}
        title="Scan Machine QR"
        description="Scan a machine QR code to locate and highlight that machine in the enterprise mindmap."
        onDecoded={(value) => void handleAssetQrDecoded(value)}
      />

      <ViewDialog
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) {
            setSelectedAsset(null);
            clearAssetQueryParams();
          }
        }}
        title={selectedAsset?.code || "Machine"}
        subtitle={selectedAsset?.name}
        contentClassName="sm:max-w-[760px]"
      >
        {overviewQuery.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : overviewQuery.data?.data ? (
          <AssetOverviewPanel
            overview={overviewQuery.data.data}
            qrData={assetQrQuery.data?.data ?? null}
            qrImageUrl={assetQrImageUrl}
            qrLoading={assetQrQuery.isLoading || assetQrQuery.isFetching}
            onRaiseWorkOrder={handleRaiseWorkOrder}
            onOpenEnergyMeterChecklist={handleOpenEnergyMeterChecklist}
          />
        ) : selectedAsset ? (
          <div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">Machine overview could not be loaded.</div>
        ) : null}
      </ViewDialog>

      <FormDialog
        open={isEnergyMeterDialogOpen}
        onOpenChange={(open) => {
          setIsEnergyMeterDialogOpen(open);
          if (!open && !energyMeterSubmitting) {
            setEnergyMeterForm(defaultEnergyMeterForm);
          }
        }}
        title="Energy Meter Checklist"
        description="Configure Modbus TCP or RS485 connectivity for automated energy capture."
        onSubmit={() => {
          void handleSubmitEnergyMeterChecklist();
        }}
        submitLabel="Save Checklist"
        isLoading={energyMeterSubmitting}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="Checklist Name"
            value={energyMeterForm.checklistName}
            onChange={(value) => updateEnergyMeterForm("checklistName", value)}
            required
          />
          <InputField
            label="Meter Name"
            value={energyMeterForm.meterName}
            onChange={(value) => updateEnergyMeterForm("meterName", value)}
            required
            placeholder="Main incomer meter"
          />
          <SelectField
            label="Connection Type"
            value={energyMeterForm.connectionType}
            onChange={(value) => updateEnergyMeterForm("connectionType", value as EnergyMeterFormState["connectionType"])}
            options={[
              { value: "MODBUS_TCP", label: "Modbus TCP" },
              { value: "MODBUS_RTU_RS485", label: "Modbus RTU RS485" },
            ]}
          />
          <SelectField
            label="Driver Type"
            value={energyMeterForm.driverType}
            onChange={(value) => updateEnergyMeterForm("driverType", value as EnergyMeterFormState["driverType"])}
            options={[
              { value: "DOTNET_RS485_BRIDGE", label: ".NET RS485 Bridge" },
              { value: "NATIVE_MODBUS_TCP", label: "Native Modbus TCP" },
            ]}
          />
        </div>

        {energyMeterForm.connectionType === "MODBUS_TCP" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label="IP Address"
              value={energyMeterForm.ipAddress}
              onChange={(value) => updateEnergyMeterForm("ipAddress", value)}
              required
              placeholder="192.168.1.20"
            />
            <InputField
              label="Port"
              type="number"
              value={energyMeterForm.port}
              onChange={(value) => updateEnergyMeterForm("port", value)}
              required
              placeholder="502"
            />
            <InputField
              label="Register"
              value={energyMeterForm.modbusRegister}
              onChange={(value) => updateEnergyMeterForm("modbusRegister", value)}
              placeholder="40001"
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label="Slave ID"
              type="number"
              value={energyMeterForm.modbusSlaveId}
              onChange={(value) => updateEnergyMeterForm("modbusSlaveId", value)}
              required
              placeholder="1"
            />
            <InputField
              label="Baud Rate"
              type="number"
              value={energyMeterForm.baudRate}
              onChange={(value) => updateEnergyMeterForm("baudRate", value)}
              placeholder="9600"
            />
            <SelectField
              label="Parity"
              value={energyMeterForm.parity}
              onChange={(value) => updateEnergyMeterForm("parity", value as EnergyMeterFormState["parity"])}
              options={[
                { value: "NONE", label: "None" },
                { value: "EVEN", label: "Even" },
                { value: "ODD", label: "Odd" },
              ]}
            />
            <InputField
              label="Stop Bits"
              type="number"
              value={energyMeterForm.stopBits}
              onChange={(value) => updateEnergyMeterForm("stopBits", value)}
              placeholder="1"
            />
            <InputField
              label="Register"
              value={energyMeterForm.modbusRegister}
              onChange={(value) => updateEnergyMeterForm("modbusRegister", value)}
              placeholder="40001"
            />
            <InputField
              label="Bridge Endpoint"
              value={energyMeterForm.bridgeEndpoint}
              onChange={(value) => updateEnergyMeterForm("bridgeEndpoint", value)}
              placeholder="http://localhost:5001/rs485/read"
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="Poll Interval (seconds)"
            type="number"
            value={energyMeterForm.pollIntervalSeconds}
            onChange={(value) => updateEnergyMeterForm("pollIntervalSeconds", value)}
            required
            placeholder="60"
          />
          <InputField
            label="Notes"
            value={energyMeterForm.notes}
            onChange={(value) => updateEnergyMeterForm("notes", value)}
            placeholder="Optional configuration notes"
          />
        </div>
      </FormDialog>
    </PageShell>
  );
}
