import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, Factory, Gauge, History, Image as ImageIcon, Loader2, QrCode, RotateCcw, ScanLine, Search, ShieldCheck, Wrench } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAsset, getAssetOverview, type Asset, type AssetOverview } from "@/api/assets";
import { getMasterDataGraph } from "@/api/master-data";
import { listWorkOrders } from "@/api/workorders";
import { getAssetQr, resolveQrMachineCode, resolveQrToken, type AssetQrData } from "@/api/qr";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ViewDialog } from "@/components/shared/ViewDialog";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { parseQrContent } from "@/mobile/qr";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WorkOrderSummary {
  id: string;
  assetId: string | null;
  relatedAssetId?: string | null;
  status: string | null;
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

function AssetOverviewPanel({
  overview,
  qrData,
  qrImageUrl,
  qrLoading,
  onRaiseWorkOrder,
}: {
  overview: AssetOverview;
  qrData: AssetQrData | null;
  qrImageUrl: string | null;
  qrLoading: boolean;
  onRaiseWorkOrder: () => void;
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
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden rounded-[2rem] border-none bg-slate-50 shadow-inner">
           {overview.asset.machineImageUrl ? (
             <div className="relative h-64 w-full overflow-hidden">
               <img src={overview.asset.machineImageUrl} alt={overview.asset.name} className="h-full w-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
             </div>
           ) : (
             <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-300">
               <ImageIcon className="h-12 w-12" />
               <p className="text-[10px] font-black uppercase tracking-widest">No Intelligence Image</p>
             </div>
           )}
           <CardContent className="p-6">
             <div className="flex items-center justify-between mb-4">
                <div className="space-y-0.5">
                   <p className="text-[9px] font-black uppercase tracking-widest text-primary">Node Core</p>
                   <h3 className="text-lg font-black text-slate-900 tracking-tight">{overview.asset.name}</h3>
                </div>
                <StatusBadge variant={assetStatusVariant(overview.asset.status)}>{overview.asset.status.replace(/_/g, " ")}</StatusBadge>
             </div>
             
             <div className="grid grid-cols-2 gap-3 mb-6">
               <div className="rounded-2xl bg-white p-3 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">MTTR</p>
                  <p className="text-sm font-bold text-slate-900">{formatMinutes(reliability?.mttrMinutes)}</p>
               </div>
               <div className="rounded-2xl bg-white p-3 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Criticality</p>
                  <StatusBadge variant={overview.asset.criticality === "HIGH" ? "critical" : "default"} className="h-5 px-2 text-[9px]">{overview.asset.criticality || "STABLE"}</StatusBadge>
               </div>
             </div>

             <div className="space-y-3">
               <div className="flex items-center justify-between pb-2 border-b border-slate-100/50">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Serial Number</span>
                 <span className="text-xs font-black text-slate-700">{overview.asset.serialNumber || "-"}</span>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</span>
                 <span className="text-xs font-black text-slate-700">{overview.asset.model || "-"}</span>
               </div>
             </div>
           </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
             <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Operations Context</h4>
             <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><Factory className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Department</p>
                    <p className="text-sm font-bold text-slate-900">{overview.hierarchy?.department?.name || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600"><Gauge className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Module Mapping</p>
                    <p className="text-sm font-bold text-slate-900">{overview.hierarchy?.module?.name || "-"}</p>
                  </div>
                </div>
             </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm overflow-hidden">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quick Actions & Identity</h4>
             </div>
             
             <div className="flex gap-4">
                <div className="grid grid-cols-1 gap-3 flex-1">
                  <Button className="h-14 rounded-2xl flex-row gap-2 shadow-glow" onClick={onRaiseWorkOrder}>
                    <Wrench className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase">Raise Incident</span>
                  </Button>
                  <Button variant="outline" className="h-14 rounded-2xl flex-row gap-2 border-slate-100" onClick={() => toast.info("History download initiated")}>
                    <History className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase">Logbook</span>
                  </Button>
                </div>

                <div 
                  className="group relative h-32 w-32 shrink-0 cursor-pointer rounded-2xl border border-slate-100 bg-slate-50 p-2 transition-all hover:bg-slate-100"
                  onClick={handleCopyResolverUrl}
                >
                   {qrLoading ? (
                     <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                     </div>
                   ) : qrImageUrl ? (
                     <>
                        <img src={qrImageUrl} alt="Asset QR" className="h-full w-full object-contain mix-blend-multiply" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 rounded-2xl">
                           <span className="text-[8px] font-black text-white uppercase tracking-widest">Copy Link</span>
                        </div>
                     </>
                   ) : (
                     <div className="flex h-full items-center justify-center text-slate-300">
                        <QrCode className="h-8 w-8" />
                     </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
         <div className="flex items-center justify-between mb-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Maintenance History</h4>
            <div className="h-1 w-12 bg-slate-100 rounded-full" />
         </div>
         <div className="space-y-3">
           {overview.workOrders.length === 0 ? (
             <div className="py-12 text-center border-2 border-dashed border-slate-50 rounded-3xl">
               <p className="text-xs font-bold text-slate-300">Operational Log Stable</p>
             </div>
           ) : (
             overview.workOrders.slice(0, 5).map((wo) => (
               <div key={wo.id} className="group flex items-center justify-between p-4 rounded-2xl border border-slate-50 hover:border-primary/20 hover:bg-primary/5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={cn("h-2 w-2 rounded-full", workOrderStatusVariant(wo.status) === "active" ? "bg-emerald-500" : "bg-rose-500")} />
                    <div>
                      <p className="text-xs font-black text-slate-900">{wo.woNumber}</p>
                      <p className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">{wo.problemDescription || "Routine maintenance"}</p>
                    </div>
                  </div>
                  <StatusBadge className="text-[8px]" variant={workOrderStatusVariant(wo.status)}>{wo.status.replace(/_/g, " ")}</StatusBadge>
               </div>
             ))
           )}
         </div>
      </div>
    </div>
  );
}

export default function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, activePlantId } = useAuthStore();
  const userIsSuperAdmin = isSuperAdmin(user);
  const [search, setSearch] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatusFilter>("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [resolvingQr, setResolvingQr] = useState(false);
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


  const graph = masterDataQuery.data?.data;
  const plants = useMemo(() => graph?.plants ?? [], [graph?.plants]);
  const departments = useMemo(() => graph?.departments ?? [], [graph?.departments]);
  const modules = useMemo(() => graph?.modules ?? [], [graph?.modules]);
  const assets = useMemo(() => graph?.assets ?? [], [graph?.assets]);
  const workOrders = ((workOrdersQuery.data?.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id || ""),
    assetId: row.assetId ? String(row.assetId) : row.asset_id ? String(row.asset_id) : null,
    relatedAssetId: row.relatedAssetId
      ? String(row.relatedAssetId)
      : row.related_asset_id
        ? String(row.related_asset_id)
        : row.linkedAssetId
          ? String(row.linkedAssetId)
          : null,
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


  const openAssetFromContext = async (
    assetId: string,
    options?: {
      openDialog?: boolean;
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

    setIsViewOpen(openDialog);

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

      await openAssetFromContext(scannedMachineId, {
        openDialog: true,
      });
      toast.success("Machine located");
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

  const columns = [
    {
      key: "machine",
      header: "Identified Node",
      render: (asset: Asset) => (
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest text-primary">{asset.code}</span>
          <span className="text-sm font-bold text-slate-700 tracking-tight">{asset.name}</span>
        </div>
      ),
    },
    {
      key: "hierarchy",
      header: "Workcenter Context",
      render: (asset: Asset) => {
        const department = departments.find((item) => item.id === asset.departmentId);
        const module = modules.find((item) => item.id === asset.moduleId);
        return (
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-600">{department ? department.name : "-"}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {module ? module.name : "Unmapped Module"}
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Operational Health",
      render: (asset: Asset) => (
        <div className="flex flex-col gap-1.5">
          <StatusBadge variant={assetStatusVariant(asset.status)} className="h-5 px-2 text-[10px]">{asset.status.replace(/_/g, " ")}</StatusBadge>
          <div className="flex items-center gap-1 opacity-60">
            <div className={cn("h-1.5 w-1.5 rounded-full", asset.criticality === "HIGH" ? "bg-rose-500" : "bg-slate-300")} />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{asset.criticality || "STABLE"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "wo",
      header: "Log Count",
      render: (asset: Asset) => (
        <div className="flex items-center gap-2">
           <span className="text-xs font-black text-slate-700">{(workOrdersByAsset.get(asset.id) || []).length}</span>
           <span className="text-[9px] font-bold text-slate-400 uppercase">Records</span>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: "actions",
      header: "",
      render: (asset: Asset) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-primary"
            onClick={() => {
              setSelectedAsset(asset);
              setIsViewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg hover:bg-slate-50 text-slate-400"
            onClick={() => openWorkOrderHistory(asset)}
          >
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

  return (
    <PageShell className="safe-area-inset space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader
          title="Machine Directory"
          subtitle="Enterprise asset catalog and operational intelligence"
          className="lg:mb-0"
        />
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="h-11 gap-2 rounded-2xl border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-all" 
            onClick={() => setIsQrScannerOpen(true)} 
            disabled={resolvingQr}
          >
            <QrCode className="h-4 w-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-widest">{resolvingQr ? "Resolving..." : "QR Scanner"}</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
           <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white shadow-industrial-sm">
             <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Total Inventory</p>
                  <div className="h-8 w-8 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600"><Wrench className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">{visibleAssets.length}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">Registered assets in scope</p>
             </CardContent>
           </Card>
           <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white shadow-industrial-sm">
             <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Active Alerts</p>
                  <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600"><ScanLine className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">{assetsWithOpenWo}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">Nodes requiring attention</p>
             </CardContent>
           </Card>
           <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white shadow-industrial-sm">
             <CardContent className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Deployment</p>
                  <div className="h-8 w-8 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600"><Factory className="h-4 w-4" /></div>
                </div>
                <p className="text-sm font-black text-slate-900 tracking-tight truncate">
                  {userIsSuperAdmin && !selectedPlantId ? "GLOBAL JK FENNER" : selectedPlant?.plantCode || "PRIMARY UNIT"}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedDepartment?.code || "ALL DEPARTMENTS"}</p>
             </CardContent>
           </Card>
        </div>

        <Card className="rounded-[3rem] border-none bg-white shadow-industrial overflow-hidden">
          <CardContent className="space-y-8 p-10">
            {/* Professional Filter Bar */}
            <div className="flex flex-wrap items-end gap-6 pb-6 border-b border-slate-50">
              <div className="flex-1 min-w-[300px] space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Search Identifier</label>
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-12 rounded-2xl border-slate-100 bg-slate-50/50 pl-11 focus-visible:ring-primary/20 shadow-none hover:bg-slate-50 transition-all text-sm font-medium"
                    placeholder="Search by code, name or model..."
                  />
                </div>
              </div>

              <div className="w-[200px] space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Plant Context</label>
                {userIsSuperAdmin ? (
                  <select
                    className="h-12 w-full rounded-2xl border-slate-100 bg-slate-50/50 px-4 text-xs font-black uppercase tracking-wider shadow-none focus:ring-primary/20"
                    value={selectedPlantId}
                    onChange={(event) => {
                      setSelectedPlantId(event.target.value);
                      setSelectedDepartmentId("");
                      setSelectedModuleId("");
                    }}
                  >
                    <option value="">Global Overview</option>
                    {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantCode}</option>)}
                  </select>
                ) : (
                  <div className="flex h-12 w-full items-center rounded-2xl border border-slate-100 bg-slate-50/30 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {selectedPlant?.plantCode || "Default Unit"}
                  </div>
                )}
              </div>

              <div className="w-[200px] space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Workcenter</label>
                <select
                  className="h-12 w-full rounded-2xl border-slate-100 bg-slate-50/50 px-4 text-xs font-black uppercase tracking-wider shadow-none focus:ring-primary/20"
                  value={selectedDepartmentId}
                  onChange={(event) => {
                    setSelectedDepartmentId(event.target.value);
                    setSelectedModuleId("");
                  }}
                >
                  <option value="">All Areas</option>
                  {departmentsForPlant.map((dept) => <option key={dept.id} value={dept.id}>{dept.code}</option>)}
                </select>
              </div>

              <div className="w-[180px] space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Health Filter</label>
                <select
                  className="h-12 w-full rounded-2xl border-slate-100 bg-slate-50/50 px-4 text-xs font-black uppercase tracking-wider shadow-none focus:ring-primary/20"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AssetStatusFilter)}
                >
                  <option value="all">Any Status</option>
                  <option value="ACTIVE">Stable Only</option>
                  <option value="UNDER_MAINTENANCE">In Maintenance</option>
                  <option value="INACTIVE">Decommissioned</option>
                </select>
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                className="h-12 w-12 rounded-2xl hover:bg-slate-50 text-slate-400"
                onClick={() => {
                  setSearch("");
                  setSelectedPlantId("");
                  setSelectedDepartmentId("");
                  setStatusFilter("all");
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synchronizing Directory</p>
              </div>
            ) : (
              <div className="rounded-[2rem] border border-slate-50 bg-white shadow-sm overflow-hidden">
                <ResponsiveTable
                  data={visibleAssets}
                  columns={columns}
                  keyExtractor={(asset) => asset.id}
                  emptyMessage="No machines found for the selected filters."
                  mobileCard={(asset) => {
                    const department = departments.find((item) => item.id === asset.departmentId);
                    const module = modules.find((item) => item.id === asset.moduleId);
                    return (
                      <MobileCard
                        onView={() => { setSelectedAsset(asset); setIsViewOpen(true); }}
                        actions={[
                          {
                            label: "Log History",
                            icon: <History className="mr-2 h-4 w-4" />,
                            onClick: () => openWorkOrderHistory(asset),
                          },
                        ]}
                      >
                        <MobileCardHeader 
                          title={asset.code} 
                          subtitle={asset.name} 
                          badge={<StatusBadge variant={assetStatusVariant(asset.status)} className="h-4 px-1.5 text-[9px] uppercase tracking-wider">{asset.status.replace(/_/g, " ")}</StatusBadge>} 
                        />
                        <MobileCardRow label="Dept" value={department ? department.code : "-"} />
                        <MobileCardRow label="Type" value={asset.assetType || "-"} />
                        <MobileCardRow label="Records" value={(workOrdersByAsset.get(asset.id) || []).length} />
                      </MobileCard>
                    );
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MobileQrScannerDialog
        open={isQrScannerOpen}
        onOpenChange={setIsQrScannerOpen}
        title="Quick Node Access"
        description="Scan machine QR code for immediate diagnostic intelligence and incident logging."
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
        title={selectedAsset?.code || "Operational Node"}
        subtitle={selectedAsset?.name}
        contentClassName="sm:max-w-[860px] rounded-[3.5rem] border-none bg-white/95 backdrop-blur-2xl shadow-2xl"
      >
        {overviewQuery.isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
          </div>
        ) : overviewQuery.data?.data ? (
          <AssetOverviewPanel
            overview={overviewQuery.data.data}
            qrData={assetQrQuery.data?.data ?? null}
            qrImageUrl={assetQrImageUrl}
            qrLoading={assetQrQuery.isLoading || assetQrQuery.isFetching}
            onRaiseWorkOrder={handleRaiseWorkOrder}
          />
        ) : selectedAsset ? (
          <div className="rounded-[2.5rem] border-2 border-dashed border-slate-100 p-20 text-center">
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Diagnostic Snapshot Offline</p>
          </div>
        ) : null}
      </ViewDialog>
    </PageShell>
  );
}
