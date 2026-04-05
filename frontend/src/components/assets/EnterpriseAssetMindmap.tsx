import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Blocks,
  ChevronDown,
  ChevronRight,
  Factory,
  Layers3,
  Network,
  Radar,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Asset } from "@/api/assets";
import type { Department } from "@/api/departments";
import type { MachineModule } from "@/api/modules";
import type { Plant } from "@/api/plants";
import type { AppUser } from "@/store/auth.store";

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

type LayoutMode = "tree" | "radial";
type NodeLevel = "plant" | "department" | "module" | "machine" | "overflow";
type AssetStatusFilter = "all" | "ACTIVE" | "UNDER_MAINTENANCE" | "INACTIVE";

interface MindmapNodeData extends Record<string, unknown> {
  nodeId: string;
  level: NodeLevel;
  label: string;
  subtitle?: string;
  status?: string;
  woCount?: number;
  moduleCount?: number;
  totalMachines?: number;
  activeMachines?: number;
  hiddenCount?: number;
  hasChildren?: boolean;
  expanded?: boolean;
  selected?: boolean;
  pathHighlighted?: boolean;
  searchHighlighted?: boolean;
  blink?: boolean;
  kpi?: KpiPreview;
  onClickNode: (nodeId: string, level: NodeLevel) => void;
  onToggleExpand?: (nodeId: string, level: NodeLevel) => void;
  onHoverMachine?: (nodeId: string) => void;
}

type MindmapNodeType = Node<MindmapNodeData>;

interface EnterpriseAssetMindmapProps {
  plants: Plant[];
  departments: Department[];
  modules: MachineModule[];
  assets: Asset[];
  workOrdersByAsset: Map<string, WorkOrderSummary[]>;
  selectedPlantId: string;
  selectedDepartmentId: string;
  selectedModuleId: string;
  selectedAssetId: string | null;
  searchTerm: string;
  statusFilter: AssetStatusFilter;
  user: AppUser | null;
  userIsSuperAdmin: boolean;
  blinkAssetId?: string | null;
  assetKpiPreview: Record<string, KpiPreview>;
  onSearchChange: (value: string) => void;
  onSelectPlant: (plantId: string) => void;
  onSelectDepartment: (departmentId: string) => void;
  onSelectModule: (moduleId: string) => void;
  onSelectAsset: (asset: Asset) => void;
  onPrefetchAssetKpi: (assetId: string) => void;
}

const LEVEL_X = {
  plant: 80,
  department: 430,
  module: 780,
  machine: 1130,
  overflow: 1130,
} as const;

const RADIAL_DEPTH_X = [90, 430, 770, 1110] as const;
const RADIAL_CURVE_X = [0, 28, 52, 72] as const;
const RADIAL_CURVE_Y = [0, 20, 34, 44] as const;

const VERTICAL_GAP = 110;
const MAX_VISIBLE_MACHINES_PER_MODULE = 28;
const MINDMAP_STATE_VERSION = 1;

const isActiveMachineStatus = (status: string | undefined) => status?.toUpperCase() === "ACTIVE";

function normalizeRoleName(role: string) {
  return role.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeStatus(status: string | undefined) {
  return (status || "").trim().toUpperCase();
}

function statusPillClass(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (normalized === "ACTIVE") return "bg-emerald-500";
  if (normalized.includes("MAINT") || normalized === "UNDER_MAINTENANCE") return "bg-orange-500";
  return "bg-slate-400";
}

function levelFrameClass(level: NodeLevel) {
  if (level === "plant") return "border-blue-500/40 bg-blue-500/10";
  if (level === "department") return "border-sky-500/40 bg-sky-500/10";
  if (level === "module") return "border-violet-500/30 bg-violet-500/8";
  if (level === "machine") return "border-border/70 bg-card";
  return "border-dashed border-border/70 bg-muted/20";
}

function nodeIcon(level: NodeLevel) {
  if (level === "plant") return Factory;
  if (level === "department") return Blocks;
  if (level === "module") return Layers3;
  return Wrench;
}

function nodeMinWidthClass(level: NodeLevel) {
  if (level === "plant") return "min-w-[240px]";
  if (level === "department") return "min-w-[250px]";
  if (level === "module") return "min-w-[260px]";
  return "min-w-[210px]";
}

function pathFromNode(parentByNodeId: Map<string, string | null>, nodeId: string | null) {
  const path = new Set<string>();
  let cursor = nodeId;
  while (cursor) {
    path.add(cursor);
    cursor = parentByNodeId.get(cursor) ?? null;
  }
  return path;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

interface PersistedPlantState {
  expandedDepartments?: Record<string, boolean>;
  expandedModules?: Record<string, boolean>;
}

interface PersistedMindmapState {
  version: number;
  layoutMode?: LayoutMode;
  plants?: Record<string, PersistedPlantState>;
}

interface HierarchyDensityProfile {
  estimatedNodeCount: number;
  averageMachinesPerModule: number;
  overviewZoomThreshold: number;
  moduleZoomThreshold: number;
  baseMachineBudget: number;
  maxMachineBudget: number;
  defaultExpandedDepartments: number;
  defaultExpandedModules: number;
}

interface DensityCalibrationPoint {
  nodeCount: number;
  overviewZoomThreshold: number;
  moduleZoomThreshold: number;
  baseMachineBudget: number;
  maxMachineBudget: number;
  defaultExpandedDepartments: number;
  defaultExpandedModules: number;
}

// Calibrated against production-like hierarchy sizes (small -> extra large plants).
const PRODUCTION_DENSITY_POINTS: DensityCalibrationPoint[] = [
  {
    nodeCount: 320,
    overviewZoomThreshold: 0.5,
    moduleZoomThreshold: 0.82,
    baseMachineBudget: 58,
    maxMachineBudget: 128,
    defaultExpandedDepartments: 6,
    defaultExpandedModules: 12,
  },
  {
    nodeCount: 900,
    overviewZoomThreshold: 0.58,
    moduleZoomThreshold: 0.92,
    baseMachineBudget: 46,
    maxMachineBudget: 108,
    defaultExpandedDepartments: 5,
    defaultExpandedModules: 9,
  },
  {
    nodeCount: 1800,
    overviewZoomThreshold: 0.66,
    moduleZoomThreshold: 1.03,
    baseMachineBudget: 34,
    maxMachineBudget: 88,
    defaultExpandedDepartments: 4,
    defaultExpandedModules: 7,
  },
  {
    nodeCount: 3400,
    overviewZoomThreshold: 0.74,
    moduleZoomThreshold: 1.15,
    baseMachineBudget: 24,
    maxMachineBudget: 70,
    defaultExpandedDepartments: 3,
    defaultExpandedModules: 5,
  },
  {
    nodeCount: 5800,
    overviewZoomThreshold: 0.82,
    moduleZoomThreshold: 1.25,
    baseMachineBudget: 16,
    maxMachineBudget: 56,
    defaultExpandedDepartments: 2,
    defaultExpandedModules: 4,
  },
];

function readPersistedMindmapState(storageKey: string): PersistedMindmapState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMindmapState;
    if (!parsed || typeof parsed !== "object") return null;
    if ((parsed.version || 0) < MINDMAP_STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function interpolateDensityPoint(nodeCount: number): DensityCalibrationPoint {
  if (nodeCount <= PRODUCTION_DENSITY_POINTS[0].nodeCount) {
    return PRODUCTION_DENSITY_POINTS[0];
  }

  const last = PRODUCTION_DENSITY_POINTS[PRODUCTION_DENSITY_POINTS.length - 1];
  if (nodeCount >= last.nodeCount) {
    return last;
  }

  for (let index = 1; index < PRODUCTION_DENSITY_POINTS.length; index += 1) {
    const prev = PRODUCTION_DENSITY_POINTS[index - 1];
    const next = PRODUCTION_DENSITY_POINTS[index];

    if (nodeCount <= next.nodeCount) {
      const ratio = (nodeCount - prev.nodeCount) / (next.nodeCount - prev.nodeCount);
      return {
        nodeCount,
        overviewZoomThreshold: lerp(prev.overviewZoomThreshold, next.overviewZoomThreshold, ratio),
        moduleZoomThreshold: lerp(prev.moduleZoomThreshold, next.moduleZoomThreshold, ratio),
        baseMachineBudget: Math.round(lerp(prev.baseMachineBudget, next.baseMachineBudget, ratio)),
        maxMachineBudget: Math.round(lerp(prev.maxMachineBudget, next.maxMachineBudget, ratio)),
        defaultExpandedDepartments: Math.round(lerp(prev.defaultExpandedDepartments, next.defaultExpandedDepartments, ratio)),
        defaultExpandedModules: Math.round(lerp(prev.defaultExpandedModules, next.defaultExpandedModules, ratio)),
      };
    }
  }

  return last;
}

function buildHierarchyDensityProfile(input: {
  plantCount: number;
  departmentCount: number;
  moduleCount: number;
  machineCount: number;
}): HierarchyDensityProfile {
  const estimatedNodeCount = input.plantCount + input.departmentCount + input.moduleCount + input.machineCount;
  const averageMachinesPerModule = input.moduleCount > 0 ? input.machineCount / input.moduleCount : 0;
  const interpolated = interpolateDensityPoint(estimatedNodeCount);

  const machineDensityPenalty = averageMachinesPerModule >= 56
    ? 10
    : averageMachinesPerModule >= 42
      ? 7
      : averageMachinesPerModule >= 30
        ? 4
        : averageMachinesPerModule >= 20
          ? 2
          : 0;

  const modulesPerDepartment = input.departmentCount > 0 ? input.moduleCount / input.departmentCount : 0;
  const branchPenalty = modulesPerDepartment >= 8 ? 3 : modulesPerDepartment >= 6 ? 2 : modulesPerDepartment >= 4 ? 1 : 0;

  const totalPenalty = machineDensityPenalty + branchPenalty;

  const overviewZoomThreshold = clamp(interpolated.overviewZoomThreshold + totalPenalty * 0.01, 0.48, 0.88);
  const moduleZoomThreshold = clamp(interpolated.moduleZoomThreshold + totalPenalty * 0.013, overviewZoomThreshold + 0.2, 1.34);

  const maxMachineBudget = clamp(interpolated.maxMachineBudget - totalPenalty * 2, 36, 140);
  const baseMachineBudget = clamp(interpolated.baseMachineBudget - totalPenalty, 8, maxMachineBudget - 8);

  const defaultExpandedDepartments = clamp(interpolated.defaultExpandedDepartments - (totalPenalty >= 6 ? 1 : 0), 1, 8);
  const defaultExpandedModules = clamp(interpolated.defaultExpandedModules - (totalPenalty >= 5 ? 2 : totalPenalty >= 3 ? 1 : 0), 2, 14);

  return {
    estimatedNodeCount,
    averageMachinesPerModule,
    overviewZoomThreshold,
    moduleZoomThreshold,
    baseMachineBudget,
    maxMachineBudget,
    defaultExpandedDepartments,
    defaultExpandedModules,
  };
}

function machineBudgetFromZoom(zoom: number, profile: HierarchyDensityProfile): number {
  let budget = profile.baseMachineBudget;

  if (zoom >= profile.moduleZoomThreshold + 0.42) {
    budget += 26;
  } else if (zoom >= profile.moduleZoomThreshold + 0.26) {
    budget += 16;
  } else if (zoom >= profile.moduleZoomThreshold + 0.12) {
    budget += 9;
  }

  if (zoom < profile.overviewZoomThreshold - 0.14) {
    budget -= 12;
  } else if (zoom < profile.overviewZoomThreshold) {
    budget -= 7;
  }

  return clamp(Math.round(budget), 8, profile.maxMachineBudget);
}

function useIsMobileBreakpoint() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

function MindmapNode({ id, data }: NodeProps<MindmapNodeType>) {
  const Icon = nodeIcon(data.level);
  const showExpandControl = Boolean(data.hasChildren && data.onToggleExpand);
  const machineStatusDot = data.level === "machine" ? statusPillClass(data.status) : "bg-primary";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group relative rounded-2xl border px-3 py-2 text-left shadow-md transition-all duration-200",
            "hover:scale-[1.03] hover:shadow-xl hover:ring-2 hover:ring-primary/30",
            levelFrameClass(data.level),
            nodeMinWidthClass(data.level),
            data.pathHighlighted && "ring-2 ring-primary/50",
            data.searchHighlighted && "ring-2 ring-amber-400/80",
            data.selected && "ring-2 ring-primary",
            data.blink && "animate-pulse ring-2 ring-emerald-400",
          )}
          onClick={(event) => {
            event.stopPropagation();
            data.onClickNode(id, data.level);
          }}
          onMouseEnter={() => {
            if (data.level === "machine") {
              data.onHoverMachine?.(id);
            }
          }}
        >
          <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-none !bg-muted-foreground" />
          <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-none !bg-muted-foreground" />

          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-background/90 shadow-sm">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", machineStatusDot)} />
              </div>
              {data.subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{data.subtitle}</p> : null}
            </div>
            {showExpandControl ? (
              <button
                type="button"
                className="rounded-md border border-border/70 bg-background/80 p-1 text-muted-foreground transition hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onToggleExpand?.(id, data.level);
                }}
              >
                {data.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {typeof data.moduleCount === "number" ? <Badge variant="outline">{data.moduleCount} Modules</Badge> : null}
            {typeof data.totalMachines === "number" ? <Badge variant="secondary">{data.totalMachines} Machines</Badge> : null}
            {typeof data.activeMachines === "number" ? <Badge variant="outline">{data.activeMachines} Active</Badge> : null}
            {typeof data.woCount === "number" ? <Badge variant="outline">WO {data.woCount}</Badge> : null}
            {typeof data.hiddenCount === "number" && data.hiddenCount > 0 ? <Badge variant="outline">+{data.hiddenCount} hidden</Badge> : null}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px]">
        <div className="space-y-1.5 text-xs">
          <p className="font-semibold">{data.label}</p>
          {data.subtitle ? <p className="text-muted-foreground">{data.subtitle}</p> : null}
          {data.level === "machine" ? (
            <>
              <p>Status: {normalizeStatus(data.status) || "UNKNOWN"}</p>
              <p>Work Orders: {data.woCount ?? 0}</p>
              {data.kpi?.loading ? <p>MTTR / MTBF: Loading...</p> : null}
              {!data.kpi?.loading && data.kpi ? (
                <p>
                  MTTR: {data.kpi.mttr} | MTBF: {data.kpi.mtbf}
                </p>
              ) : null}
            </>
          ) : null}
          {typeof data.totalMachines === "number" ? <p>Total Machines: {data.totalMachines}</p> : null}
          {typeof data.activeMachines === "number" ? <p>Active Machines: {data.activeMachines}</p> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function EnterpriseAssetMindmap({
  plants,
  departments,
  modules,
  assets,
  workOrdersByAsset,
  selectedPlantId,
  selectedDepartmentId,
  selectedModuleId,
  selectedAssetId,
  searchTerm,
  statusFilter,
  user,
  userIsSuperAdmin,
  blinkAssetId,
  assetKpiPreview,
  onSearchChange,
  onSelectPlant,
  onSelectDepartment,
  onSelectModule,
  onSelectAsset,
  onPrefetchAssetKpi,
}: EnterpriseAssetMindmapProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("tree");
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<MindmapNodeType, Edge> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm.trim().toLowerCase());
  const [zoomLevel, setZoomLevel] = useState(1);
  const isMobile = useIsMobileBreakpoint();
  const persistenceKey = useMemo(() => `cmms.assets.mindmap.state.v${MINDMAP_STATE_VERSION}:${user?.id || "anonymous"}`, [user?.id]);
  const plantScopeKey = useMemo(() => selectedPlantId || "__all__", [selectedPlantId]);

  const handleZoomChange = useCallback((nextZoom: number) => {
    if (!Number.isFinite(nextZoom)) return;
    setZoomLevel((current) => (Math.abs(current - nextZoom) >= 0.03 ? nextZoom : current));
  }, []);

  const handleResetView = useCallback(() => {
    if (!flowInstance) return;
    flowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    setZoomLevel(1);
  }, [flowInstance]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const persisted = readPersistedMindmapState(persistenceKey);
    setLayoutMode(persisted?.layoutMode === "radial" ? "radial" : "tree");
    setExpandedDepartments({});
    setExpandedModules({});
  }, [persistenceKey, plantScopeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const current = readPersistedMindmapState(persistenceKey) || { version: MINDMAP_STATE_VERSION, plants: {} };
    const nextState: PersistedMindmapState = {
      version: MINDMAP_STATE_VERSION,
      layoutMode,
      plants: {
        ...(current.plants || {}),
        [plantScopeKey]: {
          expandedDepartments,
          expandedModules,
        },
      },
    };

    try {
      window.localStorage.setItem(persistenceKey, JSON.stringify(nextState));
    } catch {
      // Ignore persistence failures (private browsing / storage quota)
    }
  }, [expandedDepartments, expandedModules, layoutMode, persistenceKey, plantScopeKey]);

  const normalizedRoles = useMemo(() => (user?.roles ?? []).map((role) => normalizeRoleName(role)), [user?.roles]);
  const isVendorScope = normalizedRoles.includes("VENDOR");
  const isAdminScope = normalizedRoles.some((role) => ["ROOT_ADMIN", "SUPERADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_MANAGER"].includes(role));
  const isUserScope = !userIsSuperAdmin && !isAdminScope && !isVendorScope;

  const assignedDepartmentId = useMemo(() => {
    if (!isUserScope) return null;
    const key = (user?.department || "").trim().toLowerCase();
    if (!key) return null;
    return departments.find((department) => department.name.trim().toLowerCase() === key || department.code.trim().toLowerCase() === key)?.id ?? null;
  }, [departments, isUserScope, user?.department]);

  const scopedAssets = useMemo(() => {
    return assets
      .filter((asset) => !selectedPlantId || asset.plantId === selectedPlantId)
      .filter((asset) => !selectedDepartmentId || asset.departmentId === selectedDepartmentId)
      .filter((asset) => !selectedModuleId || asset.moduleId === selectedModuleId)
      .filter((asset) => statusFilter === "all" || asset.status === statusFilter)
      .filter((asset) => {
        if (isVendorScope) {
          return Boolean(asset.vendorId);
        }
        if (isUserScope && assignedDepartmentId) {
          return asset.departmentId === assignedDepartmentId;
        }
        return true;
      })
      .sort((left, right) => left.code.localeCompare(right.code));
  }, [assets, assignedDepartmentId, isUserScope, isVendorScope, selectedDepartmentId, selectedModuleId, selectedPlantId, statusFilter]);

  const assetScopedModuleIds = useMemo(
    () => new Set(scopedAssets.map((asset) => asset.moduleId).filter((moduleId): moduleId is string => Boolean(moduleId))),
    [scopedAssets],
  );

  const assetScopedDepartmentIds = useMemo(
    () => new Set(scopedAssets.map((asset) => asset.departmentId).filter((departmentId): departmentId is string => Boolean(departmentId))),
    [scopedAssets],
  );

  const scopedDepartments = useMemo(() => {
    let filtered = departments
      .filter((department) => department.isActive)
      .filter((department) => !selectedPlantId || department.plantId === selectedPlantId)
      .filter((department) => !selectedDepartmentId || department.id === selectedDepartmentId);

    if (selectedModuleId && !selectedDepartmentId) {
      const moduleDepartmentId = modules.find((module) => module.id === selectedModuleId)?.departmentId ?? null;
      if (moduleDepartmentId) {
        filtered = filtered.filter((department) => department.id === moduleDepartmentId);
      }
    }

    if (isUserScope && assignedDepartmentId) {
      filtered = filtered.filter((department) => department.id === assignedDepartmentId);
    } else if (isVendorScope) {
      filtered = filtered.filter((department) => assetScopedDepartmentIds.has(department.id));
    }

    return filtered.sort((left, right) => left.code.localeCompare(right.code));
  }, [
    departments,
    selectedPlantId,
    selectedDepartmentId,
    selectedModuleId,
    modules,
    isUserScope,
    assignedDepartmentId,
    isVendorScope,
    assetScopedDepartmentIds,
  ]);

  const scopedModules = useMemo(() => {
    const allowedDepartmentIds = new Set(scopedDepartments.map((department) => department.id));
    let filtered = modules
      .filter((module) => module.isActive)
      .filter((module) => !selectedPlantId || module.plantId === selectedPlantId)
      .filter((module) => !selectedDepartmentId || module.departmentId === selectedDepartmentId)
      .filter((module) => !selectedModuleId || module.id === selectedModuleId)
      .filter((module) => !module.departmentId || allowedDepartmentIds.has(module.departmentId));

    if (isUserScope && assignedDepartmentId) {
      filtered = filtered.filter((module) => module.departmentId === assignedDepartmentId);
    } else if (isVendorScope) {
      filtered = filtered.filter((module) => assetScopedModuleIds.has(module.id));
    }

    return filtered.sort((left, right) => (left.code || left.name).localeCompare(right.code || right.name));
  }, [
    scopedDepartments,
    modules,
    selectedPlantId,
    selectedDepartmentId,
    selectedModuleId,
    isUserScope,
    assignedDepartmentId,
    isVendorScope,
    assetScopedModuleIds,
  ]);

  const scopedPlantIds = useMemo(
    () => new Set(scopedDepartments.map((department) => department.plantId).filter((plantId): plantId is string => Boolean(plantId))),
    [scopedDepartments],
  );

  const scopedPlants = useMemo(() => {
    return plants
      .filter((plant) => plant.isActive)
      .filter((plant) => {
        if (selectedPlantId) return plant.id === selectedPlantId;
        if (userIsSuperAdmin) return true;
        return scopedPlantIds.has(plant.id);
      })
      .sort((left, right) => left.plantCode.localeCompare(right.plantCode));
  }, [plants, scopedPlantIds, selectedPlantId, userIsSuperAdmin]);

  const modulesByDepartment = useMemo(() => {
    const map = new Map<string, MachineModule[]>();
    scopedModules.forEach((module) => {
      if (!module.departmentId) return;
      const bucket = map.get(module.departmentId) || [];
      bucket.push(module);
      map.set(module.departmentId, bucket);
    });
    map.forEach((bucket) => bucket.sort((left, right) => (left.code || left.name).localeCompare(right.code || right.name)));
    return map;
  }, [scopedModules]);

  const machinesByModule = useMemo(() => {
    const map = new Map<string, Asset[]>();
    scopedAssets.forEach((asset) => {
      if (!asset.moduleId) return;
      const bucket = map.get(asset.moduleId) || [];
      bucket.push(asset);
      map.set(asset.moduleId, bucket);
    });
    map.forEach((bucket) => bucket.sort((left, right) => left.code.localeCompare(right.code)));
    return map;
  }, [scopedAssets]);

  const departmentsByPlant = useMemo(() => {
    const map = new Map<string, Department[]>();
    scopedDepartments.forEach((department) => {
      if (!department.plantId) return;
      const bucket = map.get(department.plantId) || [];
      bucket.push(department);
      map.set(department.plantId, bucket);
    });
    map.forEach((bucket) => bucket.sort((left, right) => left.code.localeCompare(right.code)));
    return map;
  }, [scopedDepartments]);

  const hierarchyDensityProfile = useMemo(
    () =>
      buildHierarchyDensityProfile({
        plantCount: scopedPlants.length,
        departmentCount: scopedDepartments.length,
        moduleCount: scopedModules.length,
        machineCount: scopedAssets.length,
      }),
    [scopedAssets.length, scopedDepartments.length, scopedModules.length, scopedPlants.length],
  );

  const machineRenderBudget = useMemo(
    () => machineBudgetFromZoom(zoomLevel, hierarchyDensityProfile),
    [hierarchyDensityProfile, zoomLevel],
  );

  useEffect(() => {
    setExpandedDepartments((current) => {
      const next = { ...current };
      const visibleIds = new Set(scopedDepartments.map((department) => department.id));
      scopedDepartments.forEach((department) => {
        if (next[department.id] === undefined) {
          next[department.id] = department.id === selectedDepartmentId;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!visibleIds.has(id)) delete next[id];
      });
      return next;
    });
  }, [scopedDepartments, selectedDepartmentId]);

  useEffect(() => {
    setExpandedModules((current) => {
      const next = { ...current };
      const visibleIds = new Set(scopedModules.map((module) => module.id));
      scopedModules.forEach((module) => {
        if (next[module.id] === undefined) {
          next[module.id] = module.id === selectedModuleId;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!visibleIds.has(id)) delete next[id];
      });
      return next;
    });
  }, [scopedModules, selectedModuleId]);

  useEffect(() => {
    const activeDepartmentId = selectedDepartmentId
      || scopedModules.find((module) => module.id === selectedModuleId)?.departmentId
      || "";

    if (!activeDepartmentId) return;

    setExpandedDepartments(() => {
      const next: Record<string, boolean> = {};
      scopedDepartments.forEach((department) => {
        next[department.id] = department.id === activeDepartmentId;
      });
      return next;
    });
  }, [scopedDepartments, scopedModules, selectedDepartmentId, selectedModuleId]);

  useEffect(() => {
    if (!selectedModuleId) return;

    setExpandedModules(() => {
      const next: Record<string, boolean> = {};
      scopedModules.forEach((module) => {
        next[module.id] = module.id === selectedModuleId;
      });
      return next;
    });
  }, [scopedModules, selectedModuleId]);

  const openExclusiveDepartment = useCallback((departmentId: string) => {
    setExpandedDepartments(() => {
      const next: Record<string, boolean> = {};
      scopedDepartments.forEach((department) => {
        next[department.id] = department.id === departmentId;
      });
      return next;
    });

    setExpandedModules(() => {
      const next: Record<string, boolean> = {};
      scopedModules.forEach((module) => {
        next[module.id] = false;
      });
      return next;
    });
  }, [scopedDepartments, scopedModules]);

  const openExclusiveModule = useCallback((moduleId: string) => {
    const parentDepartmentId = scopedModules.find((module) => module.id === moduleId)?.departmentId || "";

    setExpandedDepartments(() => {
      const next: Record<string, boolean> = {};
      scopedDepartments.forEach((department) => {
        next[department.id] = Boolean(parentDepartmentId && department.id === parentDepartmentId);
      });
      return next;
    });

    setExpandedModules(() => {
      const next: Record<string, boolean> = {};
      scopedModules.forEach((module) => {
        next[module.id] = module.id === moduleId;
      });
      return next;
    });
  }, [scopedDepartments, scopedModules]);

  const toggleExclusiveDepartment = useCallback((departmentId: string) => {
    const shouldExpand = !expandedDepartments[departmentId];
    if (!shouldExpand) {
      setExpandedDepartments(() => {
        const next: Record<string, boolean> = {};
        scopedDepartments.forEach((department) => {
          next[department.id] = false;
        });
        return next;
      });
      setExpandedModules(() => {
        const next: Record<string, boolean> = {};
        scopedModules.forEach((module) => {
          next[module.id] = false;
        });
        return next;
      });
      return;
    }

    openExclusiveDepartment(departmentId);
  }, [expandedDepartments, openExclusiveDepartment, scopedDepartments, scopedModules]);

  const toggleExclusiveModule = useCallback((moduleId: string) => {
    const shouldExpand = !expandedModules[moduleId];
    if (!shouldExpand) {
      setExpandedModules(() => {
        const next: Record<string, boolean> = {};
        scopedModules.forEach((module) => {
          next[module.id] = false;
        });
        return next;
      });
      return;
    }

    openExclusiveModule(moduleId);
  }, [expandedModules, openExclusiveModule, scopedModules]);

  const matchingMachineNodeIds = useMemo(() => {
    if (!debouncedSearch) return [] as string[];

    return scopedAssets
      .filter((asset) => {
        const haystack = [asset.code, asset.name, asset.assetType || "", asset.model || "", asset.serialNumber || ""].join(" ").toLowerCase();
        return haystack.includes(debouncedSearch);
      })
      .map((asset) => `machine:${asset.id}`);
  }, [debouncedSearch, scopedAssets]);

  useEffect(() => {
    if (!debouncedSearch || matchingMachineNodeIds.length === 0) return;

    const firstMatchAssetId = matchingMachineNodeIds[0].replace("machine:", "");
    const matchedAsset = scopedAssets.find((asset) => asset.id === firstMatchAssetId);
    if (!matchedAsset) return;

    if (matchedAsset.moduleId) {
      openExclusiveModule(matchedAsset.moduleId);
      return;
    }

    if (matchedAsset.departmentId) {
      openExclusiveDepartment(matchedAsset.departmentId);
    }
  }, [debouncedSearch, matchingMachineNodeIds, openExclusiveDepartment, openExclusiveModule, scopedAssets]);

  const hierarchyBuild = useMemo(() => {
    const parentByNodeId = new Map<string, string | null>();
    const nodeMap = new Map<string, MindmapNodeType>();
    const edges: Edge[] = [];
    const levelsByNode = new Map<string, NodeLevel>();
    let cursorY = 40;

    const ensureEdge = (source: string, target: string) => {
      edges.push({
        id: `edge:${source}->${target}`,
        source,
        target,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      });
    };

    scopedPlants.forEach((plant) => {
      const plantNodeId = `plant:${plant.id}`;
      levelsByNode.set(plantNodeId, "plant");
      const departmentRows = departmentsByPlant.get(plant.id) || [];
      const departmentCenters: number[] = [];

      if (departmentRows.length === 0) {
        departmentCenters.push(cursorY);
        cursorY += VERTICAL_GAP;
      }

      departmentRows.forEach((department) => {
        const departmentNodeId = `department:${department.id}`;
        parentByNodeId.set(departmentNodeId, plantNodeId);
        levelsByNode.set(departmentNodeId, "department");

        const moduleRows = modulesByDepartment.get(department.id) || [];
        const manualDepartmentExpanded = expandedDepartments[department.id] !== false;
        const isDepartmentExpanded = manualDepartmentExpanded;
        const moduleCenters: number[] = [];

        if (!isDepartmentExpanded || moduleRows.length === 0) {
          const y = cursorY;
          moduleCenters.push(y);
          cursorY += VERTICAL_GAP;
        }

        moduleRows.forEach((module) => {
          if (!isDepartmentExpanded) return;

          const moduleNodeId = `module:${module.id}`;
          parentByNodeId.set(moduleNodeId, departmentNodeId);
          levelsByNode.set(moduleNodeId, "module");

          const moduleMachines = machinesByModule.get(module.id) || [];
          const machineRows = debouncedSearch
            ? moduleMachines.filter((asset) => matchingMachineNodeIds.includes(`machine:${asset.id}`))
            : moduleMachines;

          const renderLimit = selectedModuleId === module.id || debouncedSearch ? 120 : machineRenderBudget;
          const visibleMachineRows = machineRows.slice(0, renderLimit);
          const hiddenCount = Math.max(0, machineRows.length - visibleMachineRows.length);

          const manualModuleExpanded = expandedModules[module.id] !== false;
          const isModuleExpanded = manualModuleExpanded;
          const leafCenters: number[] = [];

          if (!isModuleExpanded || visibleMachineRows.length === 0) {
            const y = cursorY;
            leafCenters.push(y);
            cursorY += VERTICAL_GAP;
          }

          if (isModuleExpanded) {
            visibleMachineRows.forEach((asset) => {
              const machineNodeId = `machine:${asset.id}`;
              parentByNodeId.set(machineNodeId, moduleNodeId);
              levelsByNode.set(machineNodeId, "machine");

              const y = cursorY;
              leafCenters.push(y);
              cursorY += VERTICAL_GAP;

              nodeMap.set(machineNodeId, {
                id: machineNodeId,
                type: "mindmapNode",
                position: { x: LEVEL_X.machine, y },
                data: {
                  nodeId: machineNodeId,
                  level: "machine",
                  label: `${asset.code} - ${asset.name}`,
                  subtitle: `${asset.assetType || asset.type} • ${asset.status.replace(/_/g, " ")}`,
                  status: asset.status,
                  woCount: (workOrdersByAsset.get(asset.id) || []).length,
                  kpi: assetKpiPreview[asset.id],
                  onClickNode: () => undefined,
                  onHoverMachine: () => undefined,
                },
              });
              ensureEdge(moduleNodeId, machineNodeId);
            });

            if (hiddenCount > 0) {
              const overflowNodeId = `overflow:${module.id}`;
              parentByNodeId.set(overflowNodeId, moduleNodeId);
              levelsByNode.set(overflowNodeId, "overflow");

              const y = cursorY;
              leafCenters.push(y);
              cursorY += VERTICAL_GAP;

              nodeMap.set(overflowNodeId, {
                id: overflowNodeId,
                type: "mindmapNode",
                position: { x: LEVEL_X.overflow, y },
                data: {
                  nodeId: overflowNodeId,
                  level: "overflow",
                  label: `+${hiddenCount} more machines`,
                  subtitle: "Use search or module selection to load all leaf nodes",
                  hiddenCount,
                  onClickNode: () => undefined,
                },
              });
              ensureEdge(moduleNodeId, overflowNodeId);
            }
          }

          const moduleY = average(leafCenters);
          moduleCenters.push(moduleY);

          const activeMachines = moduleMachines.filter((asset) => isActiveMachineStatus(asset.status)).length;
          nodeMap.set(moduleNodeId, {
            id: moduleNodeId,
            type: "mindmapNode",
            position: { x: LEVEL_X.module, y: moduleY },
            data: {
              nodeId: moduleNodeId,
              level: "module",
              label: `${module.code ? `${module.code} - ` : ""}${module.name}`,
              subtitle: module.description || "Sub-branch module",
              hasChildren: moduleMachines.length > 0,
              expanded: isModuleExpanded,
              totalMachines: moduleMachines.length,
              activeMachines,
              hiddenCount,
              onClickNode: () => undefined,
              onToggleExpand: () => undefined,
            },
          });
          ensureEdge(departmentNodeId, moduleNodeId);
        });

        const departmentY = average(moduleCenters);
        departmentCenters.push(departmentY);

        const departmentModuleRows = modulesByDepartment.get(department.id) || [];
        const departmentMachineCount = departmentModuleRows.reduce((sum, module) => sum + (machinesByModule.get(module.id)?.length || 0), 0);
        const departmentActiveMachines = departmentModuleRows.reduce(
          (sum, module) => sum + (machinesByModule.get(module.id) || []).filter((asset) => isActiveMachineStatus(asset.status)).length,
          0,
        );

        nodeMap.set(departmentNodeId, {
          id: departmentNodeId,
          type: "mindmapNode",
          position: { x: LEVEL_X.department, y: departmentY },
          data: {
            nodeId: departmentNodeId,
            level: "department",
            label: `${department.code} - ${department.name}`,
            subtitle: "Branch",
            hasChildren: departmentModuleRows.length > 0,
            expanded: isDepartmentExpanded,
            moduleCount: departmentModuleRows.length,
            totalMachines: departmentMachineCount,
            activeMachines: departmentActiveMachines,
            onClickNode: () => undefined,
            onToggleExpand: () => undefined,
          },
        });
        ensureEdge(plantNodeId, departmentNodeId);
      });

      const plantY = average(departmentCenters);
      const plantDepartmentRows = departmentsByPlant.get(plant.id) || [];
      const plantModuleCount = plantDepartmentRows.reduce((sum, department) => sum + (modulesByDepartment.get(department.id)?.length || 0), 0);
      const plantMachineCount = plantDepartmentRows.reduce((sum, department) => {
        const moduleRows = modulesByDepartment.get(department.id) || [];
        return sum + moduleRows.reduce((moduleSum, module) => moduleSum + (machinesByModule.get(module.id)?.length || 0), 0);
      }, 0);
      const plantActiveMachineCount = plantDepartmentRows.reduce((sum, department) => {
        const moduleRows = modulesByDepartment.get(department.id) || [];
        return (
          sum +
          moduleRows.reduce(
            (moduleSum, module) => moduleSum + (machinesByModule.get(module.id) || []).filter((asset) => isActiveMachineStatus(asset.status)).length,
            0,
          )
        );
      }, 0);

      nodeMap.set(plantNodeId, {
        id: plantNodeId,
        type: "mindmapNode",
        position: { x: LEVEL_X.plant, y: plantY },
        data: {
          nodeId: plantNodeId,
          level: "plant",
          label: `${plant.plantCode} - ${plant.plantName}`,
          subtitle: plant.location || "Root node",
          hasChildren: plantDepartmentRows.length > 0,
          expanded: true,
          moduleCount: plantModuleCount,
          totalMachines: plantMachineCount,
          activeMachines: plantActiveMachineCount,
          onClickNode: () => undefined,
        },
      });

      cursorY += 20;
      parentByNodeId.set(plantNodeId, null);
    });

    const treeNodes = Array.from(nodeMap.values());

    const byDepth = new Map<number, MindmapNodeType[]>();
    const depthMap = new Map<string, number>();
    treeNodes.forEach((node) => {
      const level = levelsByNode.get(node.id) || "machine";
      const depth = level === "plant" ? 0 : level === "department" ? 1 : level === "module" ? 2 : 3;
      depthMap.set(node.id, depth);
      const bucket = byDepth.get(depth) || [];
      bucket.push(node);
      byDepth.set(depth, bucket);
    });

    let positionedNodes = treeNodes;

    if (layoutMode === "radial") {
      // Left-anchored fan layout: preserves radial feel while keeping plant as the root on the left.
      positionedNodes = treeNodes.map((node) => {
        const depth = depthMap.get(node.id) || 0;
        const group = (byDepth.get(depth) || []).sort((left, right) => left.position.y - right.position.y);
        const firstY = group[0]?.position.y ?? node.position.y;
        const lastY = group[group.length - 1]?.position.y ?? node.position.y;
        const centerY = (firstY + lastY) / 2;
        const spread = Math.max((lastY - firstY) / 2, 1);
        const normalized = clamp((node.position.y - centerY) / spread, -1, 1);
        const depthIndex = Math.min(depth, RADIAL_DEPTH_X.length - 1);

        return {
          ...node,
          position: {
            x: RADIAL_DEPTH_X[depthIndex] + Math.abs(normalized) * RADIAL_CURVE_X[depthIndex] + (depth > 0 ? (1 - Math.abs(normalized)) * 14 : 0),
            y: node.position.y + normalized * RADIAL_CURVE_Y[depthIndex],
          },
        };
      });
    }

    return {
      nodes: positionedNodes,
      edges,
      parentByNodeId,
    };
  }, [
    assetKpiPreview,
    debouncedSearch,
    departmentsByPlant,
    expandedDepartments,
    expandedModules,
    layoutMode,
    machineRenderBudget,
    matchingMachineNodeIds,
    machinesByModule,
    modulesByDepartment,
    scopedPlants,
    selectedModuleId,
    workOrdersByAsset,
  ]);

  const selectedNodeId = useMemo(() => {
    if (selectedAssetId) return `machine:${selectedAssetId}`;
    if (selectedModuleId) return `module:${selectedModuleId}`;
    if (selectedDepartmentId) return `department:${selectedDepartmentId}`;
    if (selectedPlantId) return `plant:${selectedPlantId}`;
    return null;
  }, [selectedAssetId, selectedDepartmentId, selectedModuleId, selectedPlantId]);

  const highlightPath = useMemo(() => pathFromNode(hierarchyBuild.parentByNodeId, selectedNodeId), [hierarchyBuild.parentByNodeId, selectedNodeId]);

  const searchPath = useMemo(() => {
    if (matchingMachineNodeIds.length === 0) return new Set<string>();
    return pathFromNode(hierarchyBuild.parentByNodeId, matchingMachineNodeIds[0]);
  }, [hierarchyBuild.parentByNodeId, matchingMachineNodeIds]);

  const flowData = useMemo(() => {
    const machineMap = new Map(scopedAssets.map((asset) => [asset.id, asset]));

    const nodes = hierarchyBuild.nodes.map((node) => {
      const isSearchHit = matchingMachineNodeIds.includes(node.id);
      const isBlink = Boolean(blinkAssetId && node.id === `machine:${blinkAssetId}`);

      const onClickNode = (_nodeId: string, level: NodeLevel) => {
        if (level === "plant") {
          onSelectPlant(node.id.replace("plant:", ""));
          return;
        }
        if (level === "department") {
          const departmentId = node.id.replace("department:", "");
          openExclusiveDepartment(departmentId);
          onSelectDepartment(departmentId);
          return;
        }
        if (level === "module") {
          const moduleId = node.id.replace("module:", "");
          openExclusiveModule(moduleId);
          onSelectModule(moduleId);
          return;
        }
        if (level === "machine") {
          const assetId = node.id.replace("machine:", "");
          const asset = machineMap.get(assetId);
          if (asset) {
            onSelectAsset(asset);
          }
        }
      };

      const onToggleExpand = (_nodeId: string, level: NodeLevel) => {
        if (level === "department") {
          const id = node.id.replace("department:", "");
          toggleExclusiveDepartment(id);
          return;
        }
        if (level === "module") {
          const id = node.id.replace("module:", "");
          toggleExclusiveModule(id);
        }
      };

      const hoverMachine = (nodeId: string) => {
        if (!nodeId.startsWith("machine:")) return;
        onPrefetchAssetKpi(nodeId.replace("machine:", ""));
      };

      return {
        ...node,
        style: {
          ...node.style,
          transition: "transform 260ms ease, opacity 220ms ease, box-shadow 220ms ease",
        },
        data: {
          ...node.data,
          selected: selectedNodeId === node.id,
          pathHighlighted: highlightPath.has(node.id),
          searchHighlighted: isSearchHit || searchPath.has(node.id),
          blink: isBlink,
          onClickNode,
          onToggleExpand,
          onHoverMachine: hoverMachine,
        },
      } satisfies MindmapNodeType;
    });

    const edges = hierarchyBuild.edges.map((edge) => {
      const highlighted = highlightPath.has(edge.source) && highlightPath.has(edge.target);
      return {
        ...edge,
        animated: true,
        style: {
          stroke: highlighted ? "#0ea5e9" : "#64748b",
          strokeWidth: highlighted ? 2.4 : 1.4,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: highlighted ? "#0ea5e9" : "#64748b",
        },
      } satisfies Edge;
    });

    return { nodes, edges };
  }, [
    blinkAssetId,
    hierarchyBuild.edges,
    hierarchyBuild.nodes,
    highlightPath,
    matchingMachineNodeIds,
    openExclusiveDepartment,
    openExclusiveModule,
    onPrefetchAssetKpi,
    onSelectAsset,
    onSelectDepartment,
    onSelectModule,
    onSelectPlant,
    scopedAssets,
    searchPath,
    selectedNodeId,
    toggleExclusiveDepartment,
    toggleExclusiveModule,
  ]);

  const focusNodeId = useMemo(() => {
    const hasExplicitSelection = Boolean(selectedAssetId || selectedModuleId || selectedDepartmentId);
    if (blinkAssetId) return `machine:${blinkAssetId}`;
    if (matchingMachineNodeIds.length > 0) return matchingMachineNodeIds[0];
    if (!hasExplicitSelection) return null;
    return selectedNodeId;
  }, [blinkAssetId, matchingMachineNodeIds, selectedAssetId, selectedDepartmentId, selectedModuleId, selectedNodeId]);

  useEffect(() => {
    if (!flowInstance || !focusNodeId) return;
    const targetNode = flowData.nodes.find((node) => node.id === focusNodeId);
    if (!targetNode) return;

    const centerX = targetNode.position.x + 120;
    const centerY = targetNode.position.y + 44;
    flowInstance.setCenter(centerX, centerY, {
      duration: 550,
    });
  }, [flowData.nodes, focusNodeId, flowInstance]);

  useEffect(() => {
    if (!flowInstance || focusNodeId || flowData.nodes.length === 0) return;

    const plantNodes = flowData.nodes.filter((node) => {
      const data = node.data as MindmapNodeData;
      return data.level === "plant";
    });
    const anchors = plantNodes.length > 0 ? plantNodes : flowData.nodes;

    const minX = Math.min(...anchors.map((node) => node.position.x));
    const minY = Math.min(...anchors.map((node) => node.position.y));
    const zoom = flowInstance.getZoom();

    flowInstance.setViewport(
      {
        x: 120 - minX * zoom,
        y: 110 - minY * zoom,
        zoom,
      },
      { duration: 420 },
    );
  }, [flowData.nodes, focusNodeId, flowInstance]);

  const nodeTypes = useMemo(() => ({ mindmapNode: MindmapNode }), []);

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border/70 bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                className="pl-9"
                placeholder="Search machine and focus"
              />
            </div>
            <Badge variant="outline">Mobile Accordion Mode</Badge>
          </div>
        </div>

        <div className="space-y-2">
          {scopedPlants.map((plant) => {
            const departmentRows = departmentsByPlant.get(plant.id) || [];
            return (
              <details key={plant.id} open className="rounded-2xl border border-border/70 bg-card p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{plant.plantCode} - {plant.plantName}</p>
                    <Badge variant="secondary">{departmentRows.length} Departments</Badge>
                  </div>
                </summary>
                <div className="mt-3 space-y-2">
                  {departmentRows.map((department) => {
                    const moduleRows = modulesByDepartment.get(department.id) || [];
                    return (
                      <details key={department.id} className="rounded-xl border border-border/60 bg-muted/20 p-2">
                        <summary className="cursor-pointer list-none text-sm font-medium">{department.code} - {department.name}</summary>
                        <div className="mt-2 space-y-2">
                          {moduleRows.map((module) => {
                            const machineRows = machinesByModule.get(module.id) || [];
                            return (
                              <details key={module.id} className="rounded-lg border border-border/60 bg-background p-2">
                                <summary className="cursor-pointer list-none text-sm">
                                  {module.code ? `${module.code} - ` : ""}
                                  {module.name}
                                </summary>
                                <div className="mt-2 space-y-1.5">
                                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                                    {machineRows.slice(0, 35).map((asset) => (
                                      <button
                                        key={asset.id}
                                        type="button"
                                        className="w-full rounded-md border border-border/70 px-2 py-1.5 text-left text-xs"
                                        onClick={() => onSelectAsset(asset)}
                                      >
                                        <p className="font-medium">{asset.code} - {asset.name}</p>
                                        <p className="text-muted-foreground">{asset.status.replace(/_/g, " ")}</p>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
          {scopedPlants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-card p-5 text-center text-sm text-muted-foreground">
              No hierarchy data available for this scope.
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/70 bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[250px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} className="pl-9" placeholder="Search machine to auto-focus in mindmap" />
          </div>

          <div className="inline-flex rounded-xl border border-border/70 bg-muted/20 p-1">
            <Button type="button" size="sm" variant={layoutMode === "tree" ? "default" : "ghost"} onClick={() => setLayoutMode("tree")} className="gap-1.5">
              <Network className="h-4 w-4" />
              Tree
            </Button>
            <Button type="button" size="sm" variant={layoutMode === "radial" ? "default" : "ghost"} onClick={() => setLayoutMode("radial")} className="gap-1.5">
              <Radar className="h-4 w-4" />
              Radial
            </Button>
          </div>

          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleResetView} disabled={!flowInstance}>
            <RotateCcw className="h-4 w-4" />
            Reset View 100%
          </Button>

        </div>
      </div>

      <div className="h-[690px] overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-slate-50 to-slate-100/40">
        <ReactFlow<MindmapNodeType, Edge>
          nodes={flowData.nodes}
          edges={flowData.edges}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.25}
          maxZoom={2.3}
          panOnDrag={[2]}
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          onInit={(instance) => {
            setFlowInstance(instance);
            handleZoomChange(instance.getZoom());
          }}
          onMove={(_event, viewport) => {
            handleZoomChange(viewport.zoom);
          }}
        >
          <Background gap={22} size={1} color="#cbd5e1" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}
