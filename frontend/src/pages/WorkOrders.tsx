import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow, subHours } from "date-fns";
import {
  Plus, Search, Eye, MoreHorizontal, Play, CheckCircle, Loader2, RefreshCw,
  ClipboardList, Clock, CheckSquare, AlertTriangle, Send, Wrench, QrCode,
  Bell, BellOff, History, MessageCircle, XCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { MaterialsUsageEditor, type MaterialDraft } from "@/components/spares/MaterialsUsageEditor";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useAuthStore, isAdmin, isIncharge, isSuperAdmin, isMaintenanceManager, isMaintenanceUser, isProductionUser } from "@/store/auth.store";
import { getStoredAccessToken } from "@/api/http";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { listPlants, type Plant } from "@/api/plants";
import { listDepartments, type Department } from "@/api/departments";
import { listModules, type MachineModule } from "@/api/modules";
import { getAsset, listAssets } from "@/api/assets";
import { listSpareItems, type SpareItem } from "@/api/inventory";
import { listWorkOrderMasters, type WorkOrderMaster, type WorkOrderMasterOptionType } from "@/api/workOrderMasters";
import { listWorkOrderTeamMappings, type WorkOrderTeamMapping } from "@/api/workOrderTeamMappings";
import { listMaintenanceTeams } from "@/api/maintenanceTeams";
import { listUsers, type UserProfile } from "@/api/users";
import {
  approveWorkOrder,
  createWorkOrder,
  listWorkOrderActivity,
  listWorkOrders,
  rejectWorkOrder,
  startWorkOrder,
  submitWorkOrderForApproval,
  addWorkOrderActivity,
  exportWorkOrdersCSV,
  bulkUpdateWorkOrders,
} from "@/api/workorders";
import { humanizeWorkOrderCode, normalizeWorkOrderCode, resolveWorkOrderLabel } from "@/config/work-order-masters";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { parseQrContent } from "@/mobile/qr";
import { resolveQrMachineCode, resolveQrToken, type QrResolveData } from "@/api/qr";
import { compressImage } from "@/mobile/media";
import { hoursToMinutes } from "@/lib/time";
import { broadcastWorkOrderSync, subscribeWorkOrderSync } from "@/lib/work-order-sync";
import { cn } from "@/lib/utils";

const INCHARGE_CATEGORY_MAP: Record<string, string> = {
  MECHANICAL_INCHARGE: "MECHANICAL",
  ELECTRICAL_INCHARGE: "ELECTRICAL",
  UTILITY_INCHARGE: "UTILITY",
  TOOLCHANGE_INCHARGE: "TOOL_CHANGE",
  CALIBRATION_INCHARGE: "CALIBRATION",
};

interface PhotoAttachment {
  name: string;
  mime_type: string;
  data_url: string;
  captured_at: string;
}

interface CloseDraftSnapshot {
  closeData?: typeof EMPTY_CLOSE_DATA;
  closeSpareUsage?: MaterialDraft[];
  closeAttachments?: PhotoAttachment[];
}

function normalizeDraftAttachments(input: unknown): PhotoAttachment[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const dataUrl = typeof item.data_url === "string" ? item.data_url : "";
      if (!dataUrl.startsWith("data:image/")) return null;

      return {
        name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name : "photo",
        mime_type: typeof item.mime_type === "string" && item.mime_type.startsWith("image/") ? item.mime_type : "image/jpeg",
        data_url: dataUrl,
        captured_at: typeof item.captured_at === "string" ? item.captured_at : new Date().toISOString(),
      };
    })
    .filter((item): item is PhotoAttachment => Boolean(item));
}

function getInchargeCategories(roles: string[]): string[] {
  return roles.filter((r) => INCHARGE_CATEGORY_MAP[r]).map((r) => INCHARGE_CATEGORY_MAP[r]);
}

const WorkflowTimeline = ({ status, createdAt, openedAt, closedAt }: { status: string, createdAt: string, openedAt?: string | null, closedAt?: string | null }) => {
  const steps = [
    { label: "Raised", date: createdAt, active: true },
    { label: "Assigned", date: openedAt, active: !!openedAt || ["IN_PROGRESS", "USER_VERIFICATION", "APPROVAL_PENDING", "CLOSED"].includes(status) },
    { label: "In Progress", date: openedAt, active: ["IN_PROGRESS", "USER_VERIFICATION", "APPROVAL_PENDING", "CLOSED"].includes(status) },
    { label: "Resolved", date: closedAt, active: ["USER_VERIFICATION", "APPROVAL_PENDING", "CLOSED"].includes(status) },
    { label: "Verified", date: closedAt, active: status === "CLOSED" },
  ];

  return (
    <div className="flex items-center justify-between w-full px-4 py-8">
      {steps.map((step, idx) => (
        <div key={step.label} className="flex flex-col items-center relative flex-1">
          <div className={`h-10 w-10 rounded-2xl flex items-center justify-center z-10 transition-all duration-500 shadow-sm ${
            step.active ? "bg-primary text-white shadow-glow" : "bg-muted text-muted-foreground"
          }`}>
            {step.active ? <CheckCircle className="h-5 w-5" /> : <div className="h-2 w-2 rounded-full bg-current" />}
          </div>
          <span className={`mt-3 text-[10px] font-black uppercase tracking-widest ${step.active ? "text-primary" : "text-muted-foreground"}`}>
            {step.label}
          </span>
          {step.date && <span className="mt-1 text-[9px] font-bold text-muted-foreground">{format(new Date(step.date), "dd MMM, HH:mm")}</span>}
          {idx < steps.length - 1 && (
            <div className={`absolute top-5 left-1/2 w-full h-[2px] -z-0 ${
              steps[idx+1].active ? "bg-primary" : "bg-muted"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
};

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Production Line stoppage" },
  { value: "MEDIUM", label: "No production line stoppage" },
];

const formatPriorityLabel = (priority: string) => {
  if (priority === "CRITICAL") return "Production Line stoppage";
  return "No production line stoppage";
};

interface RaiseFormData {
  plant_id: string;
  department_id: string;
  module_id: string;
  asset_id: string;
  issue_title: string;
  problem_description: string;
  priority: string;
  reported_location: string;
  remarks: string;
  category: string;
  wo_type: string;
}
const getInitialRaiseFormData = (plantId = ""): RaiseFormData => ({
  plant_id: plantId,
  department_id: "",
  module_id: "",
  asset_id: "",
  issue_title: "",
  problem_description: "",
  priority: "MEDIUM",
  reported_location: "",
  remarks: "",
  category: "",
  wo_type: "",
});

const EMPTY_OPEN_DATA = {
  initial_assessment: "",
  category: "",
  assigned_to: "",
  estimated_minutes: "",
  expected_downtime_minutes: "",
  assessment_remarks: "",
  assigned_to_notes: "",
};

const EMPTY_WHY_WHY = {
  why_1: "",
  why_2: "",
  why_3: "",
  why_4: "",
  why_5: "",
  root_reason: "",
  corrective_prevention: "",
  recurrence_prevention: "",
};

const EMPTY_CLOSE_DATA = {
  wo_type: "BREAKDOWN",
  root_cause: "",
  action_taken: "",
  corrective_action: "",
  failure_code: "",
  actual_failure_category: "",
  why_why: { ...EMPTY_WHY_WHY },
  preventive_recommendation: "",
  manpower_used: "",
  parts_replaced: "",
  spare_used: false,
  downtime_minutes: "",
  completion_at: "",
  operator_fault: false,
  follow_up_required: false,
  follow_up_team_id: "",
  follow_up_notes: "",
  follow_up_support_category: "MECHANICAL",
  follow_up_urgency: "MEDIUM",
  remarks: "",
};

const EMPTY_REVIEW_DATA = {
  approve_comments: "",
  reject_comments: "",
};

const CLOSE_DRAFT_STORAGE_KEY_PREFIX = "cmms:wo-close-draft:";

function getCloseDraftStorageKey(workOrderId: string) {
  return `${CLOSE_DRAFT_STORAGE_KEY_PREFIX}${workOrderId}`;
}

function getStatusVariant(status: string) {
  if (status === "CLOSED") return "completed" as const;
  if (status === "CANCELLED") return "error" as const;
  if (status === "IN_PROGRESS") return "in_progress" as const;
  if (status === "USER_VERIFICATION") return "approval_pending" as const;
  if (status === "APPROVAL_PENDING") return "approval_pending" as const;
  if (status === "REASSIGNED") return "warning" as const;
  if (status === "ASSIGNED") return "primary" as const;
  if (status === "TRIAGED") return "info" as const;
  if (status === "REJECTED") return "error" as const;
  if (status === "OPENED") return "opened" as const;
  if (status === "RAISED") return "warning" as const;
  return "default" as const;
}

function safeReadCloseDraft(workOrderId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getCloseDraftStorageKey(workOrderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloseDraftSnapshot;
    return {
      closeData: parsed.closeData,
      closeSpareUsage: parsed.closeSpareUsage,
      closeAttachments: normalizeDraftAttachments(parsed.closeAttachments),
    };
  } catch {
    return null;
  }
}

function clearCloseDraft(workOrderId: string | null) {
  if (!workOrderId || typeof window === "undefined") return;
  window.localStorage.removeItem(getCloseDraftStorageKey(workOrderId));
}

function buildSpareUsagePayload(rows: MaterialDraft[], availableSpares: SpareItem[]) {
  const spareById = new Map(availableSpares.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const quantity = Number.parseInt(row.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      if (row.isManual) {
        const spareName = (row.itemName || "").trim();
        if (!spareName) return null;
        return {
          spare_item_id: `manual-${spareName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          quantity,
          spare_name: spareName,
          is_manual: true,
        };
      }

      const spare = spareById.get(row.itemId);
      if (!spare) return null;
      return {
        spare_item_id: spare.id,
        quantity,
        spare_name: spare.name,
        spare_code: spare.code,
        is_manual: false,
      };
    })
    .filter((item): item is { spare_item_id: string; quantity: number; spare_name: string; spare_code: string; is_manual: boolean } => Boolean(item));
}

function sortWorkOrderMasters(left: WorkOrderMaster, right: WorkOrderMaster) {
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label);
}

function dedupeOptions(options: Array<{ value: string; label: string }>) {
  const byValue = new Map<string, string>();
  options.forEach((option) => {
    if (!option.value || byValue.has(option.value)) return;
    byValue.set(option.value, option.label);
  });

  return Array.from(byValue.entries()).map(([value, label]) => ({ value, label }));
}

function getScopedWorkOrderOptions(
  masters: WorkOrderMaster[],
  optionType: WorkOrderMasterOptionType,
  plantId?: string | null,
) {
  const scoped = masters
    .filter((item) => item.isActive && item.optionType === optionType && (!plantId || item.plantId === plantId))
    .sort(sortWorkOrderMasters)
    .map((item) => ({ value: item.code, label: item.label }));

  return dedupeOptions(scoped);
}

function getUnionWorkOrderOptions(masters: WorkOrderMaster[], optionType: WorkOrderMasterOptionType) {
  const union = masters
    .filter((item) => item.isActive && item.optionType === optionType)
    .sort(sortWorkOrderMasters)
    .map((item) => ({ value: item.code, label: item.label }));

  return dedupeOptions(union);
}

export default function WorkOrders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, session, isLoading: authLoading, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [raiseDateTime, setRaiseDateTime] = useState(() => new Date());

  const userIsAdmin = isAdmin(user);
  const userIsSuperAdmin = isSuperAdmin(user);
  const userIsIncharge = isIncharge(user);
  const inchargeCategories = useMemo(() => getInchargeCategories(user?.roles || []), [user?.roles]);
  const assetPrefillApplied = useRef<string | null>(null);
  const activeTabInitializedRef = useRef(false);
  const assetIdFromQuery = searchParams.get("assetId");
  const authEnabled = !authLoading && isAuthenticated && Boolean(getStoredAccessToken());
  const workOrderRefetchInterval: number | false = authEnabled ? 15_000 : false;

  const activePlantIds = user?.plantId ? [user.plantId] : [];
  const actorIds = useMemo(
    () => new Set([user?.authId, user?.id].filter((value): value is string => Boolean(value))),
    [user?.authId, user?.id],
  );

  const { data: workOrderMasters = [], isLoading: isWorkOrderConfigLoading } = useQuery({
    queryKey: ["work_order_masters", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listWorkOrderMasters({ page: 1, limit: 500, includeInactive: true });
      return response.data || [];
    },
  });

  const { data: plants = [], isLoading: isPlantsLoading } = useQuery({
    queryKey: ["wo_plants", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listPlants({ page: 1, limit: 500, includeInactive: true });
      return response.data || [];
    },
  });

  const { data: departments = [], isLoading: isDepartmentsLoading } = useQuery({
    queryKey: ["wo_departments", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listDepartments({ page: 1, limit: 500, includeInactive: true });
      return response.data || [];
    },
  });

  const { data: modules = [], isLoading: isModulesLoading } = useQuery({
    queryKey: ["wo_modules", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listModules({ page: 1, limit: 500, includeInactive: true });
      return response.data || [];
    },
  });

  const isHierarchyLoading = isPlantsLoading || isDepartmentsLoading || isModulesLoading;

  const { data: workOrderTeamMappings = [] } = useQuery({
    queryKey: ["wo_team_mappings", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listWorkOrderTeamMappings({ page: 1, limit: 500 });
      return response.data || [];
    },
  });

  const [activeTab, setActiveTab] = useState<"assigned" | "raised" | "incharge" | "team" | "all" | "approval" | "vendor">("assigned");

  const { data: allWorkOrders = [], isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["work_orders", ...activePlantIds, activeTab, actorIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listWorkOrders({ page: 1, limit: 2000, sort: 'created_at', order: 'DESC' });
      return response.data || [];
    },
  });

  const isOwnedByCurrentUser = (value: unknown) => typeof value === "string" && actorIds.has(value);

  const raisedWorkOrders = useMemo(() => {
    if (!user || actorIds.size === 0) return [];
    return allWorkOrders.filter((wo: any) => isOwnedByCurrentUser(wo.raised_by));
  }, [actorIds, allWorkOrders, user]);

  const inchargeWorkOrders = useMemo(() => {
    if (!userIsIncharge || inchargeCategories.length === 0) return [];
    return allWorkOrders.filter(
      (wo: any) => inchargeCategories.includes(wo.category) && !isOwnedByCurrentUser(wo.raised_by),
    );
  }, [allWorkOrders, inchargeCategories, userIsIncharge]);

  const approvalQueueWorkOrders = useMemo(() => {
    return allWorkOrders.filter(
      (wo: any) => ["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status) && (userIsAdmin || isOwnedByCurrentUser(wo.raised_by)),
    );
  }, [allWorkOrders, userIsAdmin]);

  const { data: userMaintenanceTeams = [] } = useQuery({
    queryKey: ["wo_user_teams", ...activePlantIds],
    enabled: Boolean(authEnabled),
    queryFn: async () => {
      const response = await listMaintenanceTeams({ plantId: activePlantIds[0], page: 1, limit: 500, includeInactive: false });
      return response.data || [];
    },
  });

  const userTeamCategories = useMemo(() => {
    const userId = user?.authId || user?.id;
    if (!userId || userMaintenanceTeams.length === 0 || workOrderTeamMappings.length === 0) return new Set<string>();
    const userTeamIds = new Set(
      userMaintenanceTeams
        .filter((team) => team.teamLeaderId === userId || (team.teamMemberIds ?? []).includes(userId))
        .map((t) => t.id)
    );
    return new Set(
      workOrderTeamMappings
        .filter((mapping) => userTeamIds.has(mapping.teamId))
        .map((mapping) => mapping.category)
    );
  }, [userMaintenanceTeams, workOrderTeamMappings, user?.authId, user?.id]);

  const userIsPartOfTeam = userTeamCategories.size > 0;

  const assignedWorkOrders = useMemo(() => {
    if (!user || actorIds.size === 0) return [];
    return allWorkOrders.filter(
      (wo: any) =>
        isOwnedByCurrentUser(wo.assigned_to) ||
        (userTeamCategories.size > 0 && userTeamCategories.has(wo.category) && !isOwnedByCurrentUser(wo.raised_by))
    );
  }, [actorIds, allWorkOrders, user, userTeamCategories]);

  const teamWorkOrders = useMemo(() => {
    if (userTeamCategories.size === 0) return [];
    return allWorkOrders.filter(
      (wo: any) => userTeamCategories.has(wo.category) && !isOwnedByCurrentUser(wo.raised_by),
    );
  }, [allWorkOrders, userTeamCategories]);

  const activeAssetHistoryId = assetIdFromQuery?.trim() || "";
  const isAssetHistoryMode = Boolean(activeAssetHistoryId);

  const normalizedRoles = useMemo(() => (user?.roles ?? []).map((role) => (role || "").toUpperCase()), [user?.roles]);

  useEffect(() => {
    const userIsVendor = normalizedRoles.includes("VENDOR");
    if (!authEnabled || activeTabInitializedRef.current) return;
    setActiveTab(userIsAdmin ? "all" : userIsVendor ? "vendor" : userIsIncharge ? "incharge" : userIsPartOfTeam ? "team" : "assigned");
    activeTabInitializedRef.current = true;
  }, [authEnabled, userIsAdmin, userIsIncharge, normalizedRoles, userIsPartOfTeam]);

  useEffect(() => {
    if (activeTab === "all" && !userIsAdmin) {
      setActiveTab(userIsIncharge ? "incharge" : "assigned");
      return;
    }
    if (activeTab === "incharge" && !userIsIncharge) {
      setActiveTab(userIsAdmin ? "all" : "assigned");
    }
    if (activeTab === "team" && !userIsPartOfTeam) {
      setActiveTab(userIsAdmin ? "all" : "assigned");
    }
  }, [activeTab, userIsAdmin, userIsIncharge, userIsPartOfTeam]);

  const displayedOrders = useMemo(() => {
    if (isAssetHistoryMode) {
      return allWorkOrders;
    }
    if (activeTab === "assigned") return assignedWorkOrders;
    if (activeTab === "raised") return raisedWorkOrders;
    if (userIsIncharge && activeTab === "incharge") return inchargeWorkOrders;
    if (activeTab === "approval") return approvalQueueWorkOrders;
    if (activeTab === "team") return teamWorkOrders;
    if (userIsAdmin && activeTab === "all") return allWorkOrders;
    if (activeTab === "vendor") {
      return allWorkOrders.filter((wo: any) => wo.vendor_id === user?.id || wo.assigned_vendor_id === user?.id);
    }
    return assignedWorkOrders;
  }, [activeTab, allWorkOrders, approvalQueueWorkOrders, assignedWorkOrders, inchargeWorkOrders, isAssetHistoryMode, raisedWorkOrders, teamWorkOrders, userIsAdmin, userIsIncharge]);

  const kpiSource =
    isAssetHistoryMode
      ? allWorkOrders.filter((wo: any) => wo.asset_id === activeAssetHistoryId)
      : activeTab === "approval"
        ? approvalQueueWorkOrders
        : activeTab === "incharge"
          ? inchargeWorkOrders
        : activeTab === "team"
          ? teamWorkOrders
        : activeTab === "all"
            ? allWorkOrders
            : activeTab === "raised"
              ? raisedWorkOrders
              : assignedWorkOrders;
  const now24h = subHours(new Date(), 24);
  const openWOs = kpiSource.filter((wo: any) => !["CLOSED"].includes(wo.status)).length;
  const closedLast24h = kpiSource.filter((wo: any) => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > now24h).length;
  const pendingApproval = kpiSource.filter((wo: any) => ["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status)).length;
  const totalWOs = kpiSource.length;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const myApprovalQueueCount = approvalQueueWorkOrders.length;

  const lastSyncedLabel = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "not synced yet";
  const showWorkOrdersLoading = authLoading || (authEnabled && isLoading);

  const filtered = displayedOrders.filter((wo: any) => {
    const matchesAsset = !activeAssetHistoryId || wo.asset_id === activeAssetHistoryId;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [wo.wo_number, wo.assets?.name, wo.assets?.code, wo.category, wo.status]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    const effectiveStatusFilter = activeTab === "approval" ? "APPROVAL_PENDING" : statusFilter;
    const matchesStatus =
      effectiveStatusFilter === "all" ||
      (effectiveStatusFilter === "USER_VERIFICATION"
        ? ["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status)
        : wo.status === effectiveStatusFilter);
    const matchesCat = categoryFilter === "all" || wo.category === categoryFilter;
    const matchesType = typeFilter === "all" || wo.wo_type === typeFilter;
    const matchesDateFrom = !dateFrom || new Date(wo.created_at) >= new Date(dateFrom);
    const matchesDateTo = !dateTo || new Date(wo.created_at) <= new Date(dateTo + "T23:59:59");
    return matchesAsset && matchesSearch && matchesStatus && matchesCat && matchesType && matchesDateFrom && matchesDateTo;
  });

  const clearAssetHistoryFilter = () => {
    if (!activeAssetHistoryId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("assetId");
    nextParams.delete("mode");
    setSearchParams(nextParams, { replace: true });
  };

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isRaisingWorkOrder, setIsRaisingWorkOrder] = useState(false);
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [isOpenFormOpen, setIsOpenFormOpen] = useState(false);
  const [isStartingWorkOrder, setIsStartingWorkOrder] = useState(false);
  const [openingWOId, setOpeningWOId] = useState<string | null>(null);
  const [isQrVerifyOpen, setIsQrVerifyOpen] = useState(false);
  const [isRaiseQrScannerOpen, setIsRaiseQrScannerOpen] = useState(false);
  const [isResolvingRaiseQr, setIsResolvingRaiseQr] = useState(false);
  const [verifyTargetWO, setVerifyTargetWO] = useState<any>(null);
  const [qrMismatchMessage, setQrMismatchMessage] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"QR_SCAN" | "MANUAL_ENTRY">("QR_SCAN");
  const [verifiedAssetId, setVerifiedAssetId] = useState<string | null>(null);
  const [isManualVerifyOpen, setIsManualVerifyOpen] = useState(false);
  const [manualMachineCode, setManualMachineCode] = useState("");
  const [manualMachineSearchResults, setManualMachineSearchResults] = useState<Array<{ value: string; label: string }>>([]);
  const [isSearchingMachine, setIsSearchingMachine] = useState(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [safetyChecklist, setSafetyChecklist] = useState({
    ppe_worn: false,
    machine_isolated: false,
    safety_lock_applied: false,
    notes: "",
  });
  const [closeAttachments, setCloseAttachments] = useState<PhotoAttachment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [reviewData, setReviewData] = useState(() => ({ ...EMPTY_REVIEW_DATA }));
  const [formData, setFormData] = useState(() => getInitialRaiseFormData(user?.plantId || ""));
  const [photoAttachments, setPhotoAttachments] = useState<PhotoAttachment[]>([]);
  const [reviewTargetWO, setReviewTargetWO] = useState<any>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const raiseFileInputRef = useRef<HTMLInputElement | null>(null);
  const closeFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"RAISE" | "CLOSE" | null>(null);
  const [cameraError, setCameraError] = useState("");
  const reviewRequiresComments = useMemo(
    () => selectedWO !== null && isAdmin(user) && !isOwnedByCurrentUser(selectedWO.raised_by),
    [selectedWO, user],
  );
  const filterCategoryOptions = useMemo(
    () => getUnionWorkOrderOptions(workOrderMasters, "CATEGORY"),
    [workOrderMasters],
  );
  const filterTypeOptions = useMemo(
    () => getUnionWorkOrderOptions(workOrderMasters, "WO_TYPE"),
    [workOrderMasters],
  );
  const plantWorkOrderTypeOptions = useMemo(
    () => getScopedWorkOrderOptions(workOrderMasters, "WO_TYPE", formData.plant_id || null),
    [formData.plant_id, workOrderMasters],
  );
  const plantFailureCodeOptions = useMemo(
    () => getScopedWorkOrderOptions(workOrderMasters, "FAILURE_CODE", formData.plant_id || null),
    [formData.plant_id, workOrderMasters],
  );
  const plantCategoryOptions = useMemo(
    () => getScopedWorkOrderOptions(workOrderMasters, "CATEGORY", formData.plant_id || null),
    [formData.plant_id, workOrderMasters],
  );
  const plantRoutingMappings = useMemo(
    () => workOrderTeamMappings.filter((item) => !formData.plant_id || item.plantId === formData.plant_id),
    [formData.plant_id, workOrderTeamMappings],
  );
  const routedMappingsForDepartment = useMemo(() => {
    const fallbackMappings = plantRoutingMappings.filter((item) => !item.departmentId);
    if (!formData.department_id) {
      return fallbackMappings;
    }

    const exactMappings = plantRoutingMappings.filter((item) => item.departmentId === formData.department_id);
    if (exactMappings.length === 0) {
      return fallbackMappings;
    }

    const seenCategories = new Set(exactMappings.map((item) => item.category));
    return [
      ...exactMappings,
      ...fallbackMappings.filter((item) => !seenCategories.has(item.category)),
    ];
  }, [formData.department_id, plantRoutingMappings]);
  const routedCategoryOptions = useMemo(() => {
    if (!formData.department_id) {
      return plantCategoryOptions;
    }

    const allowedCategories = new Set(routedMappingsForDepartment.map((item) => item.category));
    if (allowedCategories.size === 0) {
      return plantCategoryOptions;
    }

    const filteredOptions = plantCategoryOptions.filter((option) => allowedCategories.has(option.value));
    return filteredOptions.length > 0 ? filteredOptions : plantCategoryOptions;
  }, [formData.department_id, plantCategoryOptions, routedMappingsForDepartment]);
  const selectedRoutingRule = useMemo(() => {
    if (!formData.department_id || !formData.category) return null;
    return (
      plantRoutingMappings.find(
        (item) => item.departmentId === formData.department_id && item.category === formData.category,
      ) ||
      plantRoutingMappings.find((item) => !item.departmentId && item.category === formData.category) ||
      null
    );
  }, [formData.category, formData.department_id, plantRoutingMappings]);

  const { data: scopedAssets = [], isLoading: isAssetsLoading } = useQuery({
    queryKey: ["work_order_raise_assets", formData.plant_id, formData.department_id, formData.module_id],
    enabled: Boolean(formData.plant_id && formData.department_id && formData.module_id),
    queryFn: async () => {
      const response = await listAssets({
        plantId: formData.plant_id,
        departmentId: formData.department_id,
        moduleId: formData.module_id,
        page: 1,
        limit: 500,
      });
      return response.data || [];
    },
  });

  const { data: prefetchedAsset } = useQuery({
    queryKey: ["work_order_raise_asset", assetIdFromQuery],
    enabled: Boolean(assetIdFromQuery),
    queryFn: async () => {
      const response = await getAsset(assetIdFromQuery!);
      return response.data;
    },
  });

  const plantOptions = useMemo(() => {
    if (userIsSuperAdmin) {
      return plants
        .filter((plant) => plant.isActive ?? true)
        .map((plant) => ({
          value: plant.id,
          label: `${plant.plantCode} - ${plant.plantName}`,
        }));
    }

    if (!user?.plantId) return [];

    return [
      {
        value: user.plantId,
        label: `${user.plantCode || "PLANT"} - ${user.plantName || "Assigned Plant"}`,
      },
    ];
  }, [plants, userIsSuperAdmin, user?.plantCode, user?.plantId, user?.plantName]);

  const departmentsForPlant = useMemo(
    () =>
      departments
        .filter(
          (department) =>
            department.plantId === formData.plant_id &&
            (department.isActive ?? true),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [departments, formData.plant_id],
  );

  const modulesForScope = useMemo(
    () =>
      modules
        .filter((module) => {
          if (module.plantId !== formData.plant_id) return false;
          if (!(module.isActive ?? true)) return false;
          if (formData.department_id && module.departmentId !== formData.department_id) return false;
          return true;
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    [modules, formData.department_id, formData.plant_id],
  );

  const assetOptions = useMemo(
    () =>
      scopedAssets
        .filter((asset: any) => {
          if (formData.plant_id && asset.plantId !== formData.plant_id) return false;
          if (formData.department_id && asset.departmentId !== formData.department_id) return false;
          if (formData.module_id && asset.moduleId !== formData.module_id) return false;
          if (asset.isActive === false) return false;
          return true;
        })
        .sort((left: any, right: any) => left.name.localeCompare(right.name))
        .map((asset: any) => ({ value: asset.id, label: `${asset.code} - ${asset.name}` })),
    [formData.department_id, formData.module_id, formData.plant_id, scopedAssets],
  );

  const selectedPlant = useMemo(
    () => plants.find((plant) => plant.id === formData.plant_id) || null,
    [plants, formData.plant_id],
  );
  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === formData.department_id) || null,
    [departments, formData.department_id],
  );
  const selectedModule = useMemo(
    () => modules.find((module) => module.id === formData.module_id) || null,
    [modules, formData.module_id],
  );
  const selectedAsset = useMemo(
    () =>
      scopedAssets.find((asset) => asset.id === formData.asset_id) ||
      (prefetchedAsset?.id === formData.asset_id ? prefetchedAsset : null),
    [formData.asset_id, prefetchedAsset, scopedAssets],
  );
  const raisedByLabel = useMemo(
    () => user?.fullName?.trim() || user?.email || session?.user?.id || "Not available",
    [session?.user?.id, user?.email, user?.fullName],
  );
  const raisedAtLabel = useMemo(() => format(raiseDateTime, "dd MMM yyyy HH:mm:ss"), [raiseDateTime]);

  useEffect(() => {
    if (!isFormOpen) return;
    setRaiseDateTime(new Date());
    const timerId = window.setInterval(() => {
      setRaiseDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isFormOpen]);

  useEffect(() => {
    if (userIsSuperAdmin) return;
    const assignedPlantId = user?.plantId || "";
    setFormData((prev) => {
      if (prev.plant_id === assignedPlantId) return prev;
      return {
        ...prev,
        plant_id: assignedPlantId,
        department_id: "",
        module_id: "",
        asset_id: "",
      };
    });
  }, [userIsSuperAdmin, user?.plantId]);

  useEffect(() => {
    if (!formData.plant_id) {
      setFormData((prev) =>
        prev.department_id || prev.module_id || prev.asset_id
          ? { ...prev, department_id: "", module_id: "", asset_id: "" }
          : prev,
      );
      return;
    }

    const validDepartment = departments.some(
      (department) => department.id === formData.department_id && department.plantId === formData.plant_id,
    );
    if (!validDepartment && formData.department_id) {
      setFormData((prev) => ({ ...prev, department_id: "", module_id: "", asset_id: "" }));
    }
  }, [departments, formData.department_id, formData.plant_id]);

  useEffect(() => {
    const validModule = modules.some(
      (module) =>
        module.id === formData.module_id &&
        module.plantId === formData.plant_id &&
        (!formData.department_id || module.departmentId === formData.department_id),
    );
    if (!validModule && formData.module_id) {
      setFormData((prev) => ({ ...prev, module_id: "", asset_id: "" }));
    }
  }, [formData.department_id, formData.module_id, formData.plant_id, modules]);

  useEffect(() => {
    if (!formData.asset_id || !formData.plant_id || !formData.department_id || !formData.module_id || isAssetsLoading) {
      return;
    }
    const validAsset = scopedAssets.some((asset) => {
      if (asset.id !== formData.asset_id) return false;
      if (formData.plant_id && asset.plantId !== formData.plant_id) return false;
      if (formData.department_id && asset.departmentId !== formData.department_id) return false;
      if (formData.module_id && asset.moduleId !== formData.module_id) return false;
      return true;
    });
    if (!validAsset && formData.asset_id) {
      setFormData((prev) => ({ ...prev, asset_id: "" }));
    }
  }, [formData.asset_id, formData.department_id, formData.module_id, formData.plant_id, isAssetsLoading, scopedAssets]);

  useEffect(() => {
    const assetId = assetIdFromQuery;
    const mode = searchParams.get("mode") || "";
    if (!assetId || assetPrefillApplied.current === assetId || !prefetchedAsset) return;

    assetPrefillApplied.current = assetId;
    setFormData((prev) => ({
      ...prev,
      plant_id: prefetchedAsset.plantId || prev.plant_id || user?.plantId || "",
      department_id: prefetchedAsset.departmentId || "",
      module_id: prefetchedAsset.moduleId || "",
      asset_id: assetId,
      wo_type: prev.wo_type,
      category: prev.category,
    }));

    if (mode.startsWith("create")) {
      setIsFormOpen(true);
    }
  }, [assetIdFromQuery, prefetchedAsset, searchParams, user?.plantId]);

  // Open WO form
  const [openData, setOpenData] = useState({ ...EMPTY_OPEN_DATA });

  // Close WO form
  const [closeData, setCloseData] = useState(() => ({ ...EMPTY_CLOSE_DATA }));
  const [closeSpareUsage, setCloseSpareUsage] = useState<MaterialDraft[]>([]);
  const [isCloseFormOpen, setIsCloseFormOpen] = useState(false);
  const [closingWOId, setClosingWOId] = useState<string | null>(null);

  const closingWO = useMemo(
    () => allWorkOrders.find((workOrder: any) => workOrder.id === closingWOId) ?? null,
    [allWorkOrders, closingWOId],
  );
  const closeFailureCodeOptions = useMemo(
    () => getScopedWorkOrderOptions(workOrderMasters, "FAILURE_CODE", closingWO?.plant_id || null),
    [closingWO?.plant_id, workOrderMasters],
  );

  const { data: closeFollowUpTeams = [] } = useQuery({
    queryKey: ["wo_close_follow_up_teams", closingWO?.plant_id || "none"],
    enabled: Boolean(closingWO?.plant_id),
    queryFn: async () => {
      const response = await listMaintenanceTeams({
        plantId: closingWO?.plant_id || undefined,
        page: 1,
        limit: 500,
        includeInactive: false,
      });
      return (response.data || []).filter((team) => team.isActive);
    },
  });

  const technicianPlantId = verifyTargetWO?.plant_id || closingWO?.plant_id || formData.plant_id || null;
  const { data: technicianUsers = [] } = useQuery({
    queryKey: ["wo_technicians", technicianPlantId || "none"],
    enabled: Boolean(technicianPlantId),
    queryFn: async () => {
      const response = await listUsers({ page: 1, limit: 500, plantId: technicianPlantId || undefined });
      return (response.data || []) as UserProfile[];
    },
  });
  const technicianOptions = useMemo(
    () =>
      technicianUsers
        .filter((profile) => profile.isActive !== false)
        .map((profile) => ({
          value: profile.authId || profile.id,
          label: profile.fullName || profile.email || profile.id,
        })),
    [technicianUsers],
  );

  const closeFollowUpTeamOptions = useMemo(
    () =>
      closeFollowUpTeams
        .slice()
        .sort((left, right) => left.teamName.localeCompare(right.teamName))
        .map((team) => ({
          value: team.id,
          label: `${team.teamName} (${team.discipline})`,
        })),
    [closeFollowUpTeams],
  );

  useEffect(() => {
    if (!closeData.failure_code) return;
    if (closeFailureCodeOptions.some((option) => option.value === closeData.failure_code)) return;
    setCloseData((prev) => ({ ...prev, failure_code: "" }));
  }, [closeData.failure_code, closeFailureCodeOptions]);

  useEffect(() => {
    if (closeData.follow_up_required) {
      if (!closeData.follow_up_team_id) return;
      if (closeFollowUpTeamOptions.some((option) => option.value === closeData.follow_up_team_id)) return;
      setCloseData((prev) => ({ ...prev, follow_up_team_id: "" }));
      return;
    }
    if (!closeData.follow_up_team_id && !closeData.follow_up_notes) return;
    setCloseData((prev) => ({ ...prev, follow_up_team_id: "", follow_up_notes: "" }));
  }, [closeData.follow_up_notes, closeData.follow_up_required, closeData.follow_up_team_id, closeFollowUpTeamOptions]);

  const { data: closeAvailableSpares = [] } = useQuery({
    queryKey: ["wo_close_spares", closingWO?.plant_id, closingWO?.asset_id],
    enabled: Boolean(closingWO?.plant_id),
    queryFn: async () => {
      const response = await listSpareItems({
        plantId: closingWO?.plant_id || undefined,
        page: 1,
        limit: 1000,
        includeInactive: false,
      });
      return (response.data || []).filter((item) => !item.assetId || item.assetId === closingWO?.asset_id);
    },
  });

  const closeSpareOptions = useMemo(
    () =>
      closeAvailableSpares.map((item) => ({
        value: item.id,
        label: `${item.code} - ${item.name} | Stock ${item.currentStock} ${item.unit}`,
      })),
    [closeAvailableSpares],
  );

  useEffect(() => {
    if (!isCloseFormOpen || !closingWOId || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        getCloseDraftStorageKey(closingWOId),
        JSON.stringify({
          closeData,
          closeSpareUsage,
          closeAttachments,
        }),
      );
    } catch {
      // Ignore draft persistence failures when attachments exceed browser storage limits.
    }
  }, [closeAttachments, closeData, closeSpareUsage, closingWOId, isCloseFormOpen]);

  useEffect(() => {
    if (!authEnabled) return;

    const unsubscribe = subscribeWorkOrderSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      void queryClient.invalidateQueries({ queryKey: ["work_order_config_options"] });
    });

    return unsubscribe;
  }, [authEnabled, queryClient]);

  const triggerWorkOrderLiveSync = () => {
    broadcastWorkOrderSync();
    void queryClient.invalidateQueries({ queryKey: ["work_orders"] });
    void queryClient.invalidateQueries({ queryKey: ["work_order_config_options"] });
  };

  const handleView = (wo: any) => { setSelectedWO(wo); setIsViewOpen(true); };
  const handleAdd = () => {
    setFormData(getInitialRaiseFormData(userIsSuperAdmin ? "" : user?.plantId || ""));
    setPhotoAttachments([]);
    setIsFormOpen(true);
  };

  const handleMediaAttachment = async (file: File | null) => {
    if (!file) return;

    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are allowed");
        return;
      }

      const dataUrl = await compressImage(file);
      setPhotoAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          mime_type: file.type,
          data_url: dataUrl,
          captured_at: new Date().toISOString(),
        },
      ]);
      toast.success("Photo attached");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to attach photo");
    }
  };

  const removeRaiseAttachment = (index: number) => {
    setPhotoAttachments((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const handleCloseMediaAttachment = async (file: File | null) => {
    if (!file) return;

    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are allowed");
        return;
      }

      const dataUrl = await compressImage(file);
      setCloseAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          mime_type: file.type,
          data_url: dataUrl,
          captured_at: new Date().toISOString(),
        },
      ]);
      toast.success("Closure photo attached");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to attach closure photo");
    }
  };

  const removeCloseAttachment = (index: number) => {
    setCloseAttachments((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const stopCameraStream = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isCameraDialogOpen) {
      stopCameraStream();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera is not supported in this browser. Use Select From Files.");
      return;
    }

    let disposed = false;

    const startCamera = async () => {
      try {
        setCameraError("");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        const video = cameraVideoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => { });
        }
      } catch {
        setCameraError("Unable to access camera. Allow camera permission and retry.");
      }
    };

    void startCamera();

    return () => {
      disposed = true;
      stopCameraStream();
    };
  }, [isCameraDialogOpen]);

  const openLiveCamera = (target: "RAISE" | "CLOSE") => {
    setCameraTarget(target);
    setCameraError("");
    setIsCameraDialogOpen(true);
  };

  const captureCameraPhoto = async () => {
    if (!cameraTarget) return;
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("Unable to capture camera frame");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      toast.error("Failed to capture photo");
      return;
    }

    const fileName = `camera-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
    const photo = new File([blob], fileName, { type: "image/jpeg" });

    if (cameraTarget === "CLOSE") {
      await handleCloseMediaAttachment(photo);
    } else {
      await handleMediaAttachment(photo);
    }

    setIsCameraDialogOpen(false);
    setCameraTarget(null);
    setCameraError("");
    stopCameraStream();
  };

  const openAttachmentPicker = (input: HTMLInputElement | null) => {
    if (!input) return;

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
        return;
      }
    } catch {
      // Fallback to click when showPicker is unavailable or blocked.
    }

    input.click();
  };

  const openQrVerification = (wo: any) => {
    setVerifyTargetWO(wo);
    setQrMismatchMessage("");
    setVerificationMethod("QR_SCAN");
    setVerifiedAssetId(null);
    setManualMachineCode("");
    setIsManualVerifyOpen(false);
    setSafetyChecklist({ ppe_worn: false, machine_isolated: false, safety_lock_applied: false, notes: "" });
    setIsQrVerifyOpen(true);
  };

  const openManualVerification = () => {
    setIsQrVerifyOpen(false);
    setQrMismatchMessage("");
    setVerificationMethod("MANUAL_ENTRY");
    setVerifiedAssetId(null);
    setManualMachineCode("");
    setIsManualVerifyOpen(true);
    // Load assets for machine search
    listAssets({ page: 1, limit: 500, includeInactive: false })
      .then((response) => {
        const assets = (response.data || []).filter((a: any) => a.isActive !== false);
        setManualMachineSearchResults(
          assets.map((a: any) => ({
            value: a.code || a.id,
            label: `${a.code} - ${a.name}`,
          }))
        );
      })
      .catch(() => setManualMachineSearchResults([]));
  };

  const confirmManualVerification = () => {
    if (!verifyTargetWO) return;
    const manualCode = (manualMachineCode || "").trim();
    if (!manualCode) {
      toast.error("Enter the assigned machine code to continue");
      return;
    }

    const assignedCode = String(verifyTargetWO.assets?.code || "").trim();
    if (assignedCode && assignedCode.toLowerCase() !== manualCode.toLowerCase()) {
      setIsManualVerifyOpen(false);
      setQrMismatchMessage(`Machine code does not match ${assignedCode}.`);
      return;
    }

    setIsManualVerifyOpen(false);
    setIsOpenFormOpen(true);
  };

  const handleQrDecodedForVerification = async (rawValue: string) => {
    if (!verifyTargetWO) return;
    const parsed = parseQrContent(rawValue);
    let scannedMachineId = parsed.machineId || "";

    if (!scannedMachineId && parsed.machineCode) {
      try {
        const resolvedByCode = await resolveQrMachineCode(parsed.machineCode, parsed.token);
        scannedMachineId = resolvedByCode.data.asset?.id || "";
      } catch {
        setQrMismatchMessage("QR could not be resolved. Rescan machine QR.");
        return;
      }
    }

    if (!scannedMachineId && parsed.token) {
      try {
        const resolved = await resolveQrToken(parsed.token);
        scannedMachineId = resolved.data.asset.id;
      } catch {
        setQrMismatchMessage("QR could not be resolved. Rescan machine QR.");
        return;
      }
    }

    if (!scannedMachineId || scannedMachineId !== verifyTargetWO.asset_id) {
      setQrMismatchMessage("This work order is not assigned for this machine.");
      return;
    }

    setVerificationMethod("QR_SCAN");
    setVerifiedAssetId(scannedMachineId);
    setIsQrVerifyOpen(false);
    setIsOpenFormOpen(true);
  };

  const applyRaiseMachineSelectionFromQr = (resolved: QrResolveData) => {
    const resolvedPlantId = resolved.hierarchy?.plant?.id || "";
    const resolvedDepartmentId = resolved.hierarchy?.department?.id || "";
    const resolvedModuleId = resolved.hierarchy?.module?.id || "";
    const resolvedAssetId = resolved.asset?.id || "";

    if (!resolvedAssetId || !resolvedPlantId || !resolvedDepartmentId || !resolvedModuleId) {
      toast.error("Scanned QR does not include complete machine hierarchy for autofill.");
      return;
    }

    if (!userIsSuperAdmin && user?.plantId && resolvedPlantId !== user.plantId) {
      toast.error("Scanned machine belongs to a different plant.");
      return;
    }

    setFormData((current) => ({
      ...current,
      plant_id: resolvedPlantId,
      department_id: resolvedDepartmentId,
      module_id: resolvedModuleId,
      asset_id: resolvedAssetId,
    }));

    setIsRaiseQrScannerOpen(false);
    toast.success(`Machine ${resolved.asset.code || resolved.asset.name || resolvedAssetId} selected from QR`);
  };

  const handleQrDecodedForRaiseForm = async (rawValue: string) => {
    if (isResolvingRaiseQr) return;

    setIsResolvingRaiseQr(true);
    try {
      const parsed = parseQrContent(rawValue);
      let resolved: QrResolveData | null = null;

      if (parsed.machineCode) {
        try {
          const response = await resolveQrMachineCode(parsed.machineCode, parsed.token);
          resolved = response.data;
        } catch {
          // Try other resolver paths.
        }
      }

      if (!resolved && parsed.token) {
        try {
          const response = await resolveQrToken(parsed.token);
          resolved = response.data;
        } catch {
          // Try fallback by raw content.
        }
      }

      if (!resolved && parsed.machineId) {
        try {
          const response = await getAsset(parsed.machineId);
          const asset = response.data as any;
          const plantId = String(asset?.plantId || "");
          const departmentId = String(asset?.departmentId || "");
          const moduleId = String(asset?.moduleId || "");
          const assetId = String(asset?.id || "");

          if (assetId && plantId && departmentId && moduleId) {
            resolved = {
              token: parsed.token || "",
              asset: {
                id: assetId,
                code: String(asset?.code || ""),
                name: String(asset?.name || ""),
                assetType: String(asset?.assetType || "MACHINE"),
                qrCodeId: asset?.qrCodeId || null,
              },
              hierarchy: {
                plant: { id: plantId, code: asset?.plant?.code || null, name: asset?.plant?.name || null },
                department: { id: departmentId, code: asset?.department?.code || null, name: asset?.department?.name || null },
                module: { id: moduleId, code: asset?.module?.code || null, name: asset?.module?.name || null },
              },
            };
          }
        } catch {
          // Continue fallback attempts.
        }
      }

      if (!resolved) {
        const rawCandidate = (rawValue || "").trim();
        if (rawCandidate) {
          try {
            const response = await resolveQrMachineCode(rawCandidate);
            resolved = response.data;
          } catch {
            // Final failure handled below.
          }
        }
      }

      if (!resolved) {
        toast.error("Unable to resolve machine from scanned QR.");
        return;
      }

      applyRaiseMachineSelectionFromQr(resolved);
    } catch {
      toast.error("Unable to process scanned QR for machine autofill.");
    } finally {
      setIsResolvingRaiseQr(false);
    }
  };

  const confirmSafetyAndStartWork = async () => {
    if (!verifyTargetWO || isStartingWorkOrder) return;
    if (!safetyChecklist.ppe_worn || !safetyChecklist.machine_isolated || !safetyChecklist.safety_lock_applied) {
      toast.error("Confirm all safety checks before starting work");
      return;
    }
    if (!(openData.initial_assessment || "").trim()) {
      toast.error("Initial assessment is required before work begins");
      return;
    }
    if (verificationMethod === "QR_SCAN" && !verifiedAssetId) {
      toast.error("Scan the assigned machine QR before starting work");
      return;
    }
    if (verificationMethod === "MANUAL_ENTRY" && !(manualMachineCode || "").trim()) {
      toast.error("Enter the assigned machine code before starting work");
      return;
    }

    setIsStartingWorkOrder(true);
    try {
      await startWorkOrder(verifyTargetWO.id, {
        verification_method: verificationMethod,
        scanned_asset_id: verificationMethod === "QR_SCAN" ? verifiedAssetId : null,
        manual_machine_code: verificationMethod === "MANUAL_ENTRY" ? manualMachineCode.trim() : null,
        initial_assessment: (openData.initial_assessment || "").trim(),
        assigned_to_notes: (openData.assigned_to_notes || "").trim() || null,
        estimated_time_minutes: Math.max(0, Number.parseInt(openData.estimated_minutes, 10) || 0),
        safety_checklist: {
          ...safetyChecklist,
          confirmed_at: new Date().toISOString(),
        },
      });
      toast.success("Machine verified and work started");
      setIsSafetyOpen(false);
      setIsManualVerifyOpen(false);
      setIsQrVerifyOpen(false);
      setVerifyTargetWO(null);
      setVerificationMethod("QR_SCAN");
      setVerifiedAssetId(null);
      setManualMachineCode("");
      setOpeningWOId(null);
      setOpenData({ ...EMPTY_OPEN_DATA });
      triggerWorkOrderLiveSync();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start work");
    } finally {
      setIsStartingWorkOrder(false);
    }
  };

  const handleSubmit = async () => {
    if (isRaisingWorkOrder) return;

    const raisedByUserId = user?.authId || session?.user?.id || "";
    const missingFields = [
      { label: "Plant", value: formData.plant_id },
      { label: "Department", value: formData.department_id },
      { label: "Module", value: formData.module_id },
      { label: "Machine", value: formData.asset_id },
      { label: "Category", value: formData.category },
      { label: "Issue Title", value: formData.issue_title.trim() },
      { label: "Problem Details", value: formData.problem_description.trim() },
      { label: "Priority", value: formData.priority },
    ].filter((field) => !field.value);

    if (missingFields.length > 0) {
      toast.error(`Required: ${missingFields.map((field) => field.label).join(", ")}`);
      return;
    }
    if (!raisedByUserId) {
      toast.error("Logged-in user details are missing. Please sign in again.");
      return;
    }

    setIsRaisingWorkOrder(true);
    try {
      const assetLocation =
        (typeof (selectedAsset as any)?.location === "string" ? (selectedAsset as any).location.trim() : "") || "";
      const normalizedLocation = formData.reported_location.trim() || assetLocation || null;
      const payload = {
        asset_id: formData.asset_id,
        priority: formData.priority,
        category: formData.category,
        problem_description: `${formData.issue_title.trim()}\n\n${formData.problem_description.trim()}`,
        reported_location: normalizedLocation,
        remarks: formData.remarks.trim() || null,
        plant_id: formData.plant_id,
        ...(photoAttachments.length > 0 ? { attachments: photoAttachments } : {}),
      };

      await createWorkOrder(payload);
      toast.success("Work order raised successfully");
      triggerWorkOrderLiveSync();
      setIsFormOpen(false);
      setPhotoAttachments([]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to raise work order");
    } finally {
      setIsRaisingWorkOrder(false);
    }
  };

  const openOpenForm = (woId: string) => {
    const wo = allWorkOrders.find((w: any) => w.id === woId);
    if (!wo) {
      toast.error("Unable to load the selected work order");
      return;
    }
    setOpeningWOId(woId);
    setVerifyTargetWO(wo);
    setOpenData({
      ...EMPTY_OPEN_DATA,
      category: wo.category || "",
      assigned_to: wo.assigned_to || user?.authId || "",
    });
    setVerificationMethod("QR_SCAN");
    setVerifiedAssetId(null);
    setManualMachineCode("");
    setSafetyChecklist({ ppe_worn: false, machine_isolated: false, safety_lock_applied: false, notes: "" });
    setIsOpenFormOpen(false);
    setIsQrVerifyOpen(true);
  };

  const handleOpenWO = async () => {
    if (!openingWOId || !verifyTargetWO || isStartingWorkOrder) return;
    if (verificationMethod === "QR_SCAN" && !verifiedAssetId) {
      toast.error("Complete machine QR identification before assessment");
      return;
    }
    if (verificationMethod === "MANUAL_ENTRY" && !manualMachineCode.trim()) {
      toast.error("Enter the machine code before assessment");
      return;
    }
    if (!openData.initial_assessment.trim()) {
      toast.error("Initial assessment is required");
      return;
    }
    if (!openData.category) {
      toast.error("Work order category is required");
      return;
    }
    if (!openData.assigned_to) {
      toast.error("Assigned technician is required");
      return;
    }
    if (!safetyChecklist.ppe_worn || !safetyChecklist.machine_isolated || !safetyChecklist.safety_lock_applied) {
      toast.error("Confirm all safety checks before starting work");
      return;
    }

    setIsStartingWorkOrder(true);
    try {
      const response = await startWorkOrder(verifyTargetWO.id, {
        verification_method: verificationMethod,
        scanned_asset_id: verificationMethod === "QR_SCAN" ? verifiedAssetId : null,
        manual_machine_code: verificationMethod === "MANUAL_ENTRY" ? manualMachineCode.trim() : null,
        initial_assessment: openData.initial_assessment.trim(),
        category: openData.category,
        assigned_to: openData.assigned_to,
        estimated_time_minutes: Math.max(0, Number.parseInt(openData.estimated_minutes, 10) || 0),
        expected_downtime_minutes: Math.max(0, Number.parseInt(openData.expected_downtime_minutes, 10) || 0),
        assessment_remarks: openData.assessment_remarks.trim() || null,
        safety_checklist: {
          ...safetyChecklist,
          confirmed_at: new Date().toISOString(),
        },
      });
      const updated = response?.data;
      if (updated?.status === "REASSIGNED") {
        toast.success("Work order reassigned to the correct maintenance team");
      } else {
        toast.success("Work order opened and work started");
      }
      setIsOpenFormOpen(false);
      setIsQrVerifyOpen(false);
      setVerifyTargetWO(null);
      setOpeningWOId(null);
      setOpenData({ ...EMPTY_OPEN_DATA });
      triggerWorkOrderLiveSync();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to open work order");
    } finally {
      setIsStartingWorkOrder(false);
    }
  };

  
  const handleCloseWithDetails = async () => {
    if (!closingWOId || !closingWO) return;
    const spareConsumption = buildSpareUsagePayload(closeSpareUsage, closeAvailableSpares);
    const issueDetails = closeData.root_cause.trim();
    const workPerformed = closeData.action_taken.trim();
    const remarks = closeData.remarks.trim();
    const materialsUsed = closeData.parts_replaced.trim();
    const followUpNotes = closeData.follow_up_notes.trim();

    const baseline = new Date(closingWO.started_at || closingWO.opened_at || closingWO.created_at);
    const downtimeMinutes = closeData.downtime_minutes
      ? Math.max(0, Number.parseInt(closeData.downtime_minutes, 10) || 0)
      : Math.max(0, Math.floor((new Date().getTime() - baseline.getTime()) / 60000));

    if (!closeData.wo_type || !issueDetails || !workPerformed || !closeData.corrective_action.trim() || !remarks) {
      toast.error("Work order type, issue details, work performed, corrective action, and remarks are required");
      return;
    }

    if (closeData.spare_used && spareConsumption.length === 0 && !materialsUsed) {
      toast.error("Add spare usage or materials when spares were used");
      return;
    }

    if (!closeData.spare_used && !materialsUsed && spareConsumption.length === 0) {
      // Explicit no-spare confirmation is acceptable.
    }

    const whyWhyRequired = downtimeMinutes > 120;
    const whyWhy = closeData.why_why;
    if (whyWhyRequired) {
      const missingWhy = Object.values(whyWhy).some((value) => !String(value || "").trim());
      if (missingWhy) {
        toast.error("Complete all Why-Why analysis fields for downtime over 120 minutes");
        return;
      }
    }

    if (closeData.failure_code && !closeFailureCodeOptions.some((option) => option.value === closeData.failure_code)) {
      toast.error("Select a valid failure code from Work Order Config Master");
      return;
    }
    if (closeData.follow_up_required && !closeData.follow_up_team_id) {
      toast.error("Follow-up team is required when follow-up is enabled");
      return;
    }
    if (closeData.follow_up_required && !followUpNotes) {
      toast.error("Follow-up notes are required when follow-up is enabled");
      return;
    }

    try {
      await submitWorkOrderForApproval(closingWOId, {
        wo_type: closeData.wo_type,
        issue_details: issueDetails,
        root_cause: issueDetails,
        work_performed_description: workPerformed,
        corrective_action: closeData.corrective_action.trim(),
        materials_used: materialsUsed || (closeData.spare_used ? "Spare usage recorded" : "No spares used"),
        spare_used: closeData.spare_used,
        attachments: closeAttachments.length > 0 ? closeAttachments : undefined,
        remarks,
        failure_code: closeData.failure_code || null,
        actual_failure_category: closeData.actual_failure_category || null,
        why_why_analysis: whyWhyRequired ? whyWhy : null,
        preventive_recommendation: closeData.preventive_recommendation || null,
        manpower_used: closeData.manpower_used || null,
        downtime_minutes: downtimeMinutes,
        completion_at: closeData.completion_at || new Date().toISOString(),
        parts_replaced: materialsUsed || null,
        spare_consumption: spareConsumption,
        operator_fault: closeData.operator_fault,
        follow_up_required: closeData.follow_up_required,
        follow_up_team_id: closeData.follow_up_required ? closeData.follow_up_team_id : null,
        follow_up_notes: followUpNotes || null,
        follow_up_support_category: closeData.follow_up_support_category || "MECHANICAL",
        follow_up_urgency: closeData.follow_up_urgency || "MEDIUM",
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to complete work order");
      return;
    }
    toast.success(closeData.follow_up_required ? "Follow-up support work order created" : "Work order sent for requester approval");
    triggerWorkOrderLiveSync();
    void queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    void queryClient.invalidateQueries({ queryKey: ["spare-maintenance-items"] });
    clearCloseDraft(closingWOId);
    setIsCloseFormOpen(false);
    setClosingWOId(null);
    setCloseData({ ...EMPTY_CLOSE_DATA });
    setCloseSpareUsage([]);
    setCloseAttachments([]);
  };

  const openCloseForm = (woId: string) => {
    const draft = safeReadCloseDraft(woId);
    setClosingWOId(woId);
    setCloseData(draft?.closeData ? { ...EMPTY_CLOSE_DATA, ...draft.closeData } : { ...EMPTY_CLOSE_DATA });
    setCloseSpareUsage(draft?.closeSpareUsage || []);
    setCloseAttachments(draft?.closeAttachments || []);
    setIsCloseFormOpen(true);
  };

  const openReviewDialog = (wo: any, mode: "approve" | "reject") => {
    setReviewTargetWO(wo);
    setReviewMode(mode);
    setReviewData({ ...EMPTY_REVIEW_DATA });
    setIsReviewOpen(true);
  };

  const handleReviewWorkOrder = async () => {
    if (!reviewTargetWO) return;
    try {
      if (reviewMode === "approve") {
        if (reviewRequiresComments && !reviewData.approve_comments.trim()) {
          toast.error("Override comments are required for admin approval");
          return;
        }
        await approveWorkOrder(reviewTargetWO.id, {
          comments: reviewData.approve_comments.trim() || null,
        });
        toast.success("Work order closed");
      } else {
        if (!reviewData.reject_comments.trim()) {
          toast.error("Rejection comments are required");
          return;
        }
        await rejectWorkOrder(reviewTargetWO.id, {
          comments: reviewData.reject_comments.trim(),
        });
        toast.success("Work order reopened");
      }
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${reviewMode} work order`);
      return;
    }

    triggerWorkOrderLiveSync();
    void queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    setIsReviewOpen(false);
    setReviewTargetWO(null);
    setReviewData({ ...EMPTY_REVIEW_DATA });
  };

  const canExecuteWO = (wo: any) => {
    if (!user) return false;
    if (isSuperAdmin(user) || isMaintenanceManager(user)) return true;
    if (isOwnedByCurrentUser(wo.assigned_to)) return true;
    return isMaintenanceUser(user) && (!wo.assigned_to || isOwnedByCurrentUser(wo.assigned_to));
  };

  const canReviewWO = (wo: any) => {
    if (!user) return false;
    if (!["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status)) return false;
    if (isSuperAdmin(user) || isMaintenanceManager(user) || isAdmin(user)) return true;
    return isOwnedByCurrentUser(wo.raised_by);
  };



  const kpiCards = [
    { label: "Open Work Orders", value: openWOs, icon: ClipboardList, color: "text-blue-500" },
    { label: "Completed (24h)", value: closedLast24h, icon: CheckSquare, color: "text-green-500" },
    { label: "Pending Verification", value: pendingApproval, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Total", value: totalWOs, icon: Clock, color: "text-primary" },
  ];

  const columns = [
    {
      key: "wo", header: "WO Number", render: (wo: any) => (
        <div>
          <span className="font-semibold text-primary">{wo.wo_number}</span>
          <p className="text-xs text-muted-foreground">{resolveWorkOrderLabel("WO_TYPE", wo.wo_type, wo.plant_id, workOrderMasters)}</p>
        </div>
      )
    },
    { key: "asset", header: "Asset", render: (wo: any) => (<div><p className="font-medium">{wo.assets?.name || "-"}</p><p className="text-xs text-muted-foreground">{wo.assets?.code}</p></div>) },
    { key: "category", header: "Category", render: (wo: any) => resolveWorkOrderLabel("CATEGORY", wo.category, wo.plant_id, workOrderMasters), hideOnMobile: true },
    { key: "priority", header: "Priority", render: (wo: any) => <StatusBadge variant={wo.priority === "CRITICAL" ? "critical" : "default"}>{formatPriorityLabel(wo.priority)}</StatusBadge> },
    { key: "status", header: "Status", render: (wo: any) => <StatusBadge status={wo.status} variant={getStatusVariant(wo.status)} /> },
    { key: "escalation", header: "Alert", hideOnMobile: true, render: (wo: any) => (
      <div className="flex items-center gap-1">
        {wo.escalation_level > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><Bell className="h-3 w-3" />L{wo.escalation_level}</span>}
        {wo.sla_due_at && new Date(wo.sla_due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(wo.status) && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"><Clock className="h-3 w-3" />SLA</span>}
        {!wo.escalation_level && (!wo.sla_due_at || new Date(wo.sla_due_at) >= new Date()) && <span className="text-xs text-muted-foreground">—</span>}
      </div>
    )},
    { key: "raised", header: "Raised", hideOnMobile: true, render: (wo: any) => (<div><p className="text-sm">{format(new Date(wo.created_at), "dd MMM yyyy")}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })}</p></div>) },
    {
      key: "actions", header: "Actions", className: "text-right", render: (wo: any) => (
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleView(wo)}><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
            {canExecuteWO(wo) && (
              <>
                {(["RAISED", "TRIAGED", "ASSIGNED", "OPENED", "REASSIGNED"].includes(wo.status)) && <DropdownMenuItem onClick={() => openOpenForm(wo.id)}><Play className="mr-2 h-4 w-4" />Open & Assess</DropdownMenuItem>}
                {wo.status === "IN_PROGRESS" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><Send className="mr-2 h-4 w-4" />Complete & Send for Verification</DropdownMenuItem>}
                {wo.status === "REJECTED" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><Send className="mr-2 h-4 w-4" />Revise & Resubmit</DropdownMenuItem>}
              </>
            )}
            {canReviewWO(wo) && (
              <>
                <DropdownMenuItem onClick={() => openReviewDialog(wo, "approve")}><CheckCircle className="mr-2 h-4 w-4" />{userIsAdmin && !isOwnedByCurrentUser(wo.raised_by) ? "Admin Force Close" : "Accept & Close"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openReviewDialog(wo, "reject")}><AlertTriangle className="mr-2 h-4 w-4" />{userIsAdmin && !isOwnedByCurrentUser(wo.raised_by) ? "Admin Reopen" : "Reject & Reopen"}</DropdownMenuItem>
              </>
            )}
            {!canReviewWO(wo) && ["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status) && (
              <DropdownMenuItem disabled className="text-muted-foreground">Awaiting raiser verification</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Work Orders"
        subtitle="Manage and track maintenance work orders"
        actions={
          <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Raise Work Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
        {kpiCards.map((kpi, idx) => (
          <div key={idx}>
            <Card className="group relative overflow-hidden border border-border/70 bg-gradient-to-br from-card/90 to-muted/20 shadow-card hover:shadow-xl transition-all duration-300 dark:from-card/80 dark:to-muted/10">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/20 transition-colors" />
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card/80 shadow-sm ring-1 ring-border/60 transition-transform group-hover:scale-110 duration-300 dark:bg-card/60",
                    kpi.color.replace('text-', 'text-')
                  )}>
                    <kpi.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-2xl font-black tracking-tight text-foreground">{kpi.value}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {(userIsAdmin || userIsIncharge || Boolean(user)) && !isAssetHistoryMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border/60 bg-card/70 p-1.5 shadow-sm backdrop-blur-md dark:bg-card/60">
          {[
            { id: 'assigned', label: 'Assigned to Me', count: assignedWorkOrders.length },
            { id: 'raised', label: 'Raised by Me', count: raisedWorkOrders.length },
            ...(userIsIncharge ? [{ id: 'incharge', label: inchargeCategories.join(", "), count: inchargeWorkOrders.length }] : []),
            ...(userIsPartOfTeam ? [{ id: 'team', label: 'My Team', count: teamWorkOrders.length }] : []),
            ...(userIsAdmin ? [{ id: 'all', label: 'All Work Orders', count: allWorkOrders.length }] : []),
            { id: 'approval', label: 'Verification Queue', count: myApprovalQueueCount }
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "rounded-2xl px-4 font-semibold transition-all h-9",
                activeTab === tab.id ? "shadow-lg shadow-primary/30" : "text-muted-foreground hover:bg-accent/40"
              )}
            >
              {tab.label}
              <Badge variant="outline" className={cn(
                "ml-2 border-none px-1.5 text-[10px]",
                activeTab === tab.id ? "bg-primary/20 text-foreground" : "bg-muted/60 text-muted-foreground"
              )}>
                {tab.count}
              </Badge>
            </Button>
          ))}
          
          <div className="ml-auto hidden items-center gap-3 pr-2 text-xs text-muted-foreground lg:flex">
            <div className="flex flex-col items-end">
              <span className="font-medium text-foreground">{isFetching ? "Synchronizing..." : "Operational Data"}</span>
              <span className="text-[10px] opacity-70">Synced {lastSyncedLabel}</span>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8 rounded-full border border-border/60 bg-card/70 shadow-sm hover:scale-110 transition-transform dark:bg-card/60" 
              onClick={() => void refetch()} 
              disabled={isFetching || !authEnabled}
            >
              <RefreshCw className={cn("h-4 w-4 text-primary", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>
      )}

      {isAssetHistoryMode && (
        <Card className="border-none bg-primary/5 shadow-sm overflow-hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 px-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground tracking-tight">Machine-Scoped History</p>
                <p className="text-xs text-muted-foreground">
                  Analyzing performance trends for <span className="font-semibold text-primary">{prefetchedAsset?.code || "the selected machine"}</span>.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={clearAssetHistoryFilter} className="rounded-xl border-primary/20 hover:bg-primary/5">
              View All Machines
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-card bg-card/40 backdrop-blur-sm">
        <CardContent className="p-4">
          <FilterToolbar
            search={
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
                <Input 
                  placeholder="Quick search by WO#, asset, or description..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="h-11 pl-10 bg-card/70 border border-border/60 text-foreground shadow-inner focus-visible:ring-primary/20 dark:bg-card/60" 
                />
              </div>
            }
            filters={
              <div className="flex flex-wrap gap-2">
                <SelectField
                  label=""
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={dedupeOptions([
                    { value: "all", label: "All Status" },
                    { value: "RAISED", label: "Raised" },
                    { value: "TRIAGED", label: "Triaged" },
                    { value: "ASSIGNED", label: "Assigned" },
                    { value: "OPENED", label: "Opened" },
                    { value: "IN_PROGRESS", label: "In Progress" },
                    { value: "REASSIGNED", label: "Reassigned" },
                    { value: "APPROVAL_PENDING", label: "Pending Approval" },
                    { value: "USER_VERIFICATION", label: "User Verification" },
                    { value: "REJECTED", label: "Rejected" },
                    { value: "CLOSED", label: "Completed" },
                  ])}
                  className="w-full sm:w-[160px] h-11"
                />
                <SelectField label="" value={categoryFilter} onChange={setCategoryFilter} options={[
                  { value: "all", label: "All Categories" }, ...filterCategoryOptions
                ]} className="w-full sm:w-[160px] h-11" />
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={function(e) { setDateFrom(e.target.value); }}
                    className="h-11 w-[150px] bg-card/70 border border-border/60 text-foreground shadow-inner dark:bg-card/60"
                    title="From date"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={function(e) { setDateTo(e.target.value); }}
                    className="h-11 w-[150px] bg-card/70 border border-border/60 text-foreground shadow-inner dark:bg-card/60"
                    title="To date"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-2"
                  onClick={function() { exportWorkOrdersCSV({
                    status: statusFilter !== "all" ? statusFilter : undefined,
                    category: categoryFilter !== "all" ? categoryFilter : undefined,
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                    ...(activePlantIds.length === 1 ? { plantId: activePlantIds[0] } : {}),
                  }).catch(function() { toast.error("Export failed"); }); }}
                  title="Export to CSV"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export CSV
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 backdrop-blur-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onCheckedChange={function(checked) {
                if (checked) setSelectedIds(new Set(filtered.map(function(wo) { return wo.id; })));
                else setSelectedIds(new Set());
              }}
              aria-label="Select all"
            />
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={function() {
              var ids = Array.from(selectedIds);
              ids.forEach(function(id) {
                approveWorkOrder(id, { comments: "Bulk closed" }).catch(function() {});
              });
              toast.success("Bulk closing " + ids.length + " work orders");
              setSelectedIds(new Set());
            }}>
              Close Selected
            </Button>
            <Button variant="outline" size="sm" onClick={function() {
              exportWorkOrdersCSV({
                status: statusFilter !== "all" ? statusFilter : undefined,
                category: categoryFilter !== "all" ? categoryFilter : undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
              }).catch(function() { toast.error("Export failed"); });
              setSelectedIds(new Set());
            }}>
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={function() { setSelectedIds(new Set()); }}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold">
            {isAssetHistoryMode
              ? "Machine Work Order History"
              : activeTab === "incharge"
                ? "Category Work Orders"
                : activeTab === "approval"
                    ? "User Verification Queue"
                  : activeTab === "team"
                    ? "My Team Work Orders"
                  : activeTab === "all"
                    ? "All Work Orders"
                    : activeTab === "raised"
                      ? "Raised Work Orders"
                      : "Assigned Work Orders"} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showWorkOrdersLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(wo: any) => wo.id}
              mobileCard={(wo: any) => (
                <MobileCard onView={() => handleView(wo)}>
                  <MobileCardHeader title={wo.wo_number} subtitle={wo.assets?.name} badge={<StatusBadge status={wo.status} variant={getStatusVariant(wo.status)} />} />
                  <MobileCardRow label="Type" value={resolveWorkOrderLabel("WO_TYPE", wo.wo_type, wo.plant_id, workOrderMasters)} />
                  <MobileCardRow label="Category" value={resolveWorkOrderLabel("CATEGORY", wo.category, wo.plant_id, workOrderMasters)} />
                  <MobileCardRow label="Priority" value={formatPriorityLabel(wo.priority)} />
                  <MobileCardRow label="Raised" value={formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* ===== RAISE WORK ORDER FORM (Enhanced) ===== */}
      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title="Raise Work Order" description="Create a maintenance work order" onSubmit={handleSubmit} submitLabel="Raise Work Order" isLoading={isRaisingWorkOrder} size="xl">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"><Wrench className="h-4 w-4" />Machine Selection</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SearchableSelect
                label="Plant"
                value={formData.plant_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, plant_id: value, department_id: "", module_id: "", asset_id: "" }))}
                options={plantOptions}
                placeholder={userIsSuperAdmin ? "Search plants..." : "Assigned plant"}
                disabled={!userIsSuperAdmin || plantOptions.length === 0}
                required
              />
              <SearchableSelect
                label="Department"
                value={formData.department_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, department_id: value, module_id: "", asset_id: "" }))}
                options={departmentsForPlant.map((department: Department) => ({
                  value: department.id,
                  label: `${department.code} - ${department.name}`,
                }))}
                placeholder={formData.plant_id ? "Search departments..." : "Select plant first"}
                disabled={!formData.plant_id}
                required
              />
              <SearchableSelect
                label="Module"
                value={formData.module_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, module_id: value, asset_id: "" }))}
                options={modulesForScope.map((module: MachineModule) => ({
                  value: module.id,
                  label: `${module.code ? `${module.code} - ` : ""}${module.name}`,
                }))}
                placeholder={formData.department_id ? "Search modules..." : "Select department first"}
                disabled={!formData.department_id}
                required
              />
              <SearchableSelect
                label="Machine"
                value={formData.asset_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, asset_id: value }))}
                options={assetOptions}
                placeholder={formData.module_id ? "Search machines..." : "Select module first"}
                disabled={!formData.module_id || assetOptions.length === 0}
                required
              />
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-primary/20 bg-primary/5 p-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setIsRaiseQrScannerOpen(true)}
                disabled={isResolvingRaiseQr}
              >
                <QrCode className="h-4 w-4" />
                {isResolvingRaiseQr ? "Resolving..." : "Scan Machine QR"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Scan machine QR code to auto-select hierarchy fields.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reporter Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="Raised By"
                value={raisedByLabel}
                onChange={() => { }}
                disabled
              />
              <InputField
                label="Date & Time"
                value={raisedAtLabel}
                onChange={() => { }}
                disabled
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Issue Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField
                label="Category"
                value={formData.category}
                onChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                options={routedCategoryOptions}
                placeholder="Select category (e.g. MECHANICAL, ELECTRICAL)"
                required
                className="sm:col-span-2"
              />
              <SelectField
                label="Priority"
                value={formData.priority}
                onChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
                options={PRIORITY_OPTIONS}
                placeholder="Select priority"
                required
                className="sm:col-span-2"
              />
              <InputField label="Location" value={formData.reported_location} onChange={(v) => setFormData((prev) => ({ ...prev, reported_location: v }))} placeholder={selectedAsset ? String((selectedAsset as any).location || "") : "Machine location"} className="sm:col-span-2" />
              <InputField label="Issue Title" value={formData.issue_title} onChange={(v) => setFormData((prev) => ({ ...prev, issue_title: v }))} placeholder="Short summary" required />
              <TextareaField label="Problem Details" value={formData.problem_description} onChange={(v) => setFormData((prev) => ({ ...prev, problem_description: v }))} placeholder="Describe symptoms and impact..." className="sm:col-span-2" required />
              <TextareaField label="Remarks" value={formData.remarks} onChange={(v) => setFormData((prev) => ({ ...prev, remarks: v }))} placeholder="Optional remarks" className="sm:col-span-2" />
            </div>

            <div className="mt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Attach Photo (auto-compressed)</Label>
              <input
                ref={raiseFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Select raise work order photo from files"
                title="Select raise work order photo from files"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleMediaAttachment(file);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    openLiveCamera("RAISE");
                  }}
                >
                  Open Camera
                </Button>
                <Button type="button" variant="outline" onClick={() => openAttachmentPicker(raiseFileInputRef.current)}>
                  Select From Files
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Photos attached: {photoAttachments.length}</p>
              {photoAttachments.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photoAttachments.map((attachment, index) => (
                    <div key={`${attachment.captured_at}-${index}`} className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                      <img src={attachment.data_url} alt={attachment.name || `Attachment ${index + 1}`} className="h-24 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 p-2">
                        <p className="truncate text-[11px] text-muted-foreground">{attachment.name || `Photo ${index + 1}`}</p>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => removeRaiseAttachment(index)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </FormDialog>

      {/* ===== OPEN WORK ORDER FORM ===== */}
      <FormDialog open={isOpenFormOpen} onOpenChange={setIsOpenFormOpen} title="Initial Assessment" description="Complete assessment after machine identification. Change category if the issue belongs to another discipline." onSubmit={handleOpenWO} submitLabel={isStartingWorkOrder ? "Starting..." : "Start Work"} isLoading={isStartingWorkOrder} size="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextareaField label="Initial Assessment Details" value={openData.initial_assessment} onChange={(v) => setOpenData({ ...openData, initial_assessment: v })} placeholder="What do you observe on the machine?" className="sm:col-span-2" required />
          <SelectField label="Work Order Category" value={openData.category} onChange={(v) => setOpenData({ ...openData, category: v })} options={filterCategoryOptions} placeholder="Select category" required />
          <SelectField label="Technician Assigned" value={openData.assigned_to} onChange={(v) => setOpenData({ ...openData, assigned_to: v })} options={technicianOptions} placeholder="Select technician" required />
          <InputField label="Expected Downtime (minutes)" value={openData.expected_downtime_minutes} onChange={(v) => setOpenData({ ...openData, expected_downtime_minutes: v })} type="number" placeholder="e.g., 90" required />
          <InputField label="Estimated Repair Time (minutes)" value={openData.estimated_minutes} onChange={(v) => setOpenData({ ...openData, estimated_minutes: v })} type="number" placeholder="e.g., 120" />
          <TextareaField label="Assessment Remarks" value={openData.assessment_remarks} onChange={(v) => setOpenData({ ...openData, assessment_remarks: v })} placeholder="Safety notes, tools required, isolation steps..." className="sm:col-span-2" />
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-dashed border-amber-300/40 bg-amber-50/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Safety Confirmation (required)</p>
            <div className="flex items-center space-x-2"><Checkbox id="open-ppe" checked={safetyChecklist.ppe_worn} onCheckedChange={(c) => setSafetyChecklist((p) => ({ ...p, ppe_worn: !!c }))} /><Label htmlFor="open-ppe">PPE worn</Label></div>
            <div className="flex items-center space-x-2"><Checkbox id="open-isolated" checked={safetyChecklist.machine_isolated} onCheckedChange={(c) => setSafetyChecklist((p) => ({ ...p, machine_isolated: !!c }))} /><Label htmlFor="open-isolated">Machine isolated</Label></div>
            <div className="flex items-center space-x-2"><Checkbox id="open-lock" checked={safetyChecklist.safety_lock_applied} onCheckedChange={(c) => setSafetyChecklist((p) => ({ ...p, safety_lock_applied: !!c }))} /><Label htmlFor="open-lock">Safety lock applied</Label></div>
          </div>
        </div>
      </FormDialog>

      {/* ===== CLOSE WORK ORDER FORM (Enhanced) ===== */}
      <FormDialog
        open={isCloseFormOpen}
        onOpenChange={setIsCloseFormOpen}
        title="Close Work Order"
        description="Complete closure details and either send to raiser verification or route to a follow-up team."
        onSubmit={handleCloseWithDetails}
        submitLabel={closeData.follow_up_required ? "Create Follow-up Support Task" : "Send for Requester Approval"}
        size="xl"
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            Drafts auto-save while this form is open so technicians can resume incomplete closure details.
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Closure Classification</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label="Work Order Type" value={closeData.wo_type} onChange={(v) => setCloseData({ ...closeData, wo_type: v })} options={getScopedWorkOrderOptions(workOrderMasters, "WO_TYPE", closingWO?.plant_id || null)} required />
              <SelectField label="Failure Code" value={closeData.failure_code} onChange={(v) => setCloseData({ ...closeData, failure_code: v })} options={closeFailureCodeOptions} placeholder="Select failure code" required />
              <TextareaField label="Issue Details / Root Cause" value={closeData.root_cause} onChange={(v) => setCloseData({ ...closeData, root_cause: v })} placeholder="Describe the issue found during maintenance..." className="sm:col-span-2" required />
              <SelectField 
                label="Actual Failure Category" 
                value={closeData.actual_failure_category} 
                onChange={(v) => setCloseData({ ...closeData, actual_failure_category: v })} 
                options={filterCategoryOptions} 
                placeholder="Correct the category if needed"
                hint="Determines which discipline (Mechanical/Electrical) this failure belongs to for MTBF reporting."
              />
              <TextareaField label="Work Performed Details" value={closeData.action_taken} onChange={(v) => setCloseData({ ...closeData, action_taken: v })} placeholder="What work was completed?" className="sm:col-span-2" required />
              <TextareaField label="Corrective Action" value={closeData.corrective_action} onChange={(v) => setCloseData({ ...closeData, corrective_action: v })} placeholder="Corrective action taken" className="sm:col-span-2" required />
              <InputField label="Downtime (minutes)" value={closeData.downtime_minutes} onChange={(v) => setCloseData({ ...closeData, downtime_minutes: v })} type="number" placeholder="Auto-calculated if empty" />
              <InputField label="Completion Date/Time" value={closeData.completion_at} onChange={(v) => setCloseData({ ...closeData, completion_at: v })} type="datetime-local" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Why-Why Analysis (if downtime &gt; 120 min)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["why_1", "why_2", "why_3", "why_4", "why_5"] as const).map((key, index) => (
                <InputField key={key} label={`Why ${index + 1}`} value={closeData.why_why[key]} onChange={(v) => setCloseData({ ...closeData, why_why: { ...closeData.why_why, [key]: v } })} />
              ))}
              <InputField label="Root Reason" value={closeData.why_why.root_reason} onChange={(v) => setCloseData({ ...closeData, why_why: { ...closeData.why_why, root_reason: v } })} className="sm:col-span-2" />
              <TextareaField label="Corrective Prevention" value={closeData.why_why.corrective_prevention} onChange={(v) => setCloseData({ ...closeData, why_why: { ...closeData.why_why, corrective_prevention: v } })} className="sm:col-span-2" />
              <TextareaField label="Recurrence Prevention" value={closeData.why_why.recurrence_prevention} onChange={(v) => setCloseData({ ...closeData, why_why: { ...closeData.why_why, recurrence_prevention: v } })} className="sm:col-span-2" />
              <TextareaField 
                label="Preventive Recommendation" 
                value={closeData.preventive_recommendation} 
                onChange={(v) => setCloseData({ ...closeData, preventive_recommendation: v })} 
                placeholder="What can we do to prevent this from happening again?" 
              />
              <InputField 
                label="Manpower Used" 
                value={closeData.manpower_used} 
                onChange={(v) => setCloseData({ ...closeData, manpower_used: v })} 
                placeholder="e.g. 2 Mechanical Technicians, 1 Helper" 
              />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Spares, Photos & Remarks</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Label className="text-sm font-medium">Spare Used?</Label>
                <Button type="button" size="sm" variant={closeData.spare_used ? "default" : "outline"} onClick={() => setCloseData((p) => ({ ...p, spare_used: true }))}>Yes</Button>
                <Button type="button" size="sm" variant={!closeData.spare_used ? "default" : "outline"} onClick={() => setCloseData((p) => ({ ...p, spare_used: false, }))}>No</Button>
              </div>
              {closeData.spare_used ? (
                <>
                  <MaterialsUsageEditor
                    title="Spare Usage"
                    description="Select spares from master or add manual entries when unavailable."
                    spareRows={closeSpareUsage}
                    onSpareChange={setCloseSpareUsage}
                    spareOptions={closeSpareOptions}
                  />
                  <TextareaField label="Additional Materials Notes" value={closeData.parts_replaced} onChange={(v) => setCloseData({ ...closeData, parts_replaced: v })} placeholder="Optional notes for non-catalog spares" />
                </>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Closure Photo (optional, auto-compressed)</Label>
                <input
                  ref={closeFileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Select closure photo from files"
                  title="Select closure photo from files"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void handleCloseMediaAttachment(file);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      openLiveCamera("CLOSE");
                    }}
                  >
                    Open Camera
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker(closeFileInputRef.current)}>
                    Select From Files
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Closure photos: {closeAttachments.length}</p>
              {closeAttachments.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {closeAttachments.map((attachment, index) => (
                    <div key={`${attachment.captured_at}-${index}`} className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                      <img src={attachment.data_url} alt={attachment.name || `Closure attachment ${index + 1}`} className="h-24 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 p-2">
                        <p className="truncate text-[11px] text-muted-foreground">{attachment.name || `Photo ${index + 1}`}</p>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => removeCloseAttachment(index)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <TextareaField label="Remarks" value={closeData.remarks} onChange={(v) => setCloseData({ ...closeData, remarks: v })} placeholder="Add final technician remarks for the raiser..." required />
            </div>
            <div className="flex flex-wrap items-center gap-6 mt-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="operator_fault" checked={closeData.operator_fault} onCheckedChange={(c) => setCloseData({ ...closeData, operator_fault: !!c })} />
                <Label htmlFor="operator_fault" className="text-sm">Operator Fault</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="follow_up"
                  checked={closeData.follow_up_required}
                  onCheckedChange={(c) =>
                    setCloseData((prev) => ({
                      ...prev,
                      follow_up_required: !!c,
                      ...(c ? {} : { follow_up_team_id: "", follow_up_notes: "" }),
                    }))
                  }
                />
                <Label htmlFor="follow_up" className="text-sm">Follow-up Required</Label>
              </div>
            </div>
            {closeData.follow_up_required && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                <SelectField
                  label="Follow-up Support Category"
                  value={closeData.follow_up_support_category}
                  onChange={(v) => setCloseData({ ...closeData, follow_up_support_category: v })}
                  options={filterCategoryOptions}
                  placeholder="Select technical discipline"
                  required
                />
                <SelectField
                  label="Follow-up Team"
                  value={closeData.follow_up_team_id}
                  onChange={(v) => setCloseData({ ...closeData, follow_up_team_id: v })}
                  options={closeFollowUpTeamOptions}
                  placeholder={closeFollowUpTeamOptions.length === 0 ? "No active teams available" : "Select follow-up team"}
                  hint="The selected team will be assigned to the new support work order."
                  required
                />
                <TextareaField
                  label="Follow-up Instructions"
                  value={closeData.follow_up_notes}
                  onChange={(v) => setCloseData({ ...closeData, follow_up_notes: v })}
                  placeholder="Specific tasks for the follow-up team..."
                  className="sm:col-span-2"
                  required
                />
              </div>
            )}
          </div>
        </div>
      </FormDialog>

      {/* ===== VIEW DIALOG (Enhanced) ===== */}
      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedWO?.wo_number || ""} subtitle={selectedWO?.assets?.name}>
        {selectedWO && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-end gap-2">
              {(["RAISED", "TRIAGED", "ASSIGNED", "OPENED"].includes(selectedWO.status)) && canExecuteWO(selectedWO) ? (
                <Button className="gap-2" onClick={() => openOpenForm(selectedWO.id)}>
                  <Play className="h-4 w-4" />
                  Open & Assess
                </Button>
              ) : null}
              {(selectedWO.status === "IN_PROGRESS" || selectedWO.status === "REJECTED") && canExecuteWO(selectedWO) ? (
                <Button className="gap-2" onClick={() => openCloseForm(selectedWO.id)}>
                  <Send className="h-4 w-4" />
                  {selectedWO.status === "REJECTED" ? "Revise & Resubmit" : "Complete & Send for Verification"}
                </Button>
              ) : null}
              {(["USER_VERIFICATION", "APPROVAL_PENDING"].includes(selectedWO.status)) && canReviewWO(selectedWO) ? (
                <>
                  <Button className="gap-2" onClick={() => openReviewDialog(selectedWO, "approve")}>
                    <CheckCircle className="h-4 w-4" />
                    Accept & Close
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => openReviewDialog(selectedWO, "reject")}>
                    <AlertTriangle className="h-4 w-4" />
                    Reject & Reopen
                  </Button>
                </>
              ) : null}
            </div>

            <Card className="border border-border/60 shadow-sm bg-card/70 rounded-3xl overflow-hidden dark:bg-card/60">
               <WorkflowTimeline 
                  status={selectedWO.status} 
                  createdAt={selectedWO.created_at} 
                  openedAt={selectedWO.opened_at} 
                  closedAt={selectedWO.closed_at} 
               />
            </Card>

            <DetailSection title="Work Order">
              <DetailRow label="WO Number" value={selectedWO.wo_number} />
              <DetailRow label="Type" value={resolveWorkOrderLabel("WO_TYPE", selectedWO.wo_type, selectedWO.plant_id, workOrderMasters)} />
              <DetailRow label="Priority" value={<StatusBadge variant={selectedWO.priority === "CRITICAL" ? "critical" : "default"}>{formatPriorityLabel(selectedWO.priority)}</StatusBadge>} />
              <DetailRow label="Category" value={resolveWorkOrderLabel("CATEGORY", selectedWO.category, selectedWO.plant_id, workOrderMasters)} />
              {selectedWO.sub_category && <DetailRow label="Sub-Category" value={selectedWO.sub_category} />}
              {selectedWO.reported_location && <DetailRow label="Location" value={selectedWO.reported_location} />}
              {selectedWO.safety_related && <DetailRow label="Safety Related" value={<StatusBadge variant="critical">Yes</StatusBadge>} />}
            </DetailSection>
            <DetailSection title="Asset">
              <DetailRow label="Name" value={selectedWO.assets?.name || "—"} />
              <DetailRow label="Code" value={selectedWO.assets?.code || "—"} />
            </DetailSection>
            <DetailSection title="Problem & Resolution">
              <DetailRow label="Problem" value={selectedWO.problem_description} />
              {selectedWO.failure_code && <DetailRow label="Failure Code" value={resolveWorkOrderLabel("FAILURE_CODE", selectedWO.failure_code, selectedWO.plant_id, workOrderMasters)} />}
              {selectedWO.technician_verification?.initial_assessment && <DetailRow label="Initial Assessment" value={selectedWO.technician_verification.initial_assessment} />}
              {selectedWO.root_cause && <DetailRow label="Issue Details" value={selectedWO.root_cause} />}
              {selectedWO.action_taken && <DetailRow label="Work Performed" value={selectedWO.action_taken} />}
              {selectedWO.parts_replaced && <DetailRow label="Parts Replaced" value={selectedWO.parts_replaced} />}
              {selectedWO.approval_comments && <DetailRow label="Approval Comments" value={selectedWO.approval_comments} />}
            </DetailSection>
            <DetailSection title="Time & Cost">
              {selectedWO.downtime_minutes > 0 && <DetailRow label="Downtime" value={`${selectedWO.downtime_minutes} min`} />}
              {hoursToMinutes(selectedWO.labor_hours) > 0 && <DetailRow label="Labor Time" value={`${hoursToMinutes(selectedWO.labor_hours)} min`} />}
              {selectedWO.actual_cost > 0 && <DetailRow label="Actual Cost" value={`₹${selectedWO.actual_cost}`} />}
            </DetailSection>
            <DetailSection title="Flags">
              <DetailRow label="Operator Fault" value={selectedWO.operator_fault ? "Yes" : "No"} />
              <DetailRow label="Follow-up Required" value={selectedWO.follow_up_required ? "Yes" : "No"} />
              {selectedWO.follow_up_notes && <DetailRow label="Follow-up Notes" value={selectedWO.follow_up_notes} />}
            </DetailSection>
            <DetailSection title="Timeline">
              <DetailRow label="Raised" value={format(new Date(selectedWO.created_at), "dd MMM yyyy HH:mm")} />
              {selectedWO.opened_at && <DetailRow label="Opened" value={format(new Date(selectedWO.opened_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.started_at && <DetailRow label="Started" value={format(new Date(selectedWO.started_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.submitted_for_approval_at && <DetailRow label="Submitted for Verification" value={format(new Date(selectedWO.submitted_for_approval_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.rejected_at && <DetailRow label="Rejected" value={format(new Date(selectedWO.rejected_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.closed_at && <DetailRow label="Completed" value={format(new Date(selectedWO.closed_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.remarks && <DetailRow label="Remarks" value={selectedWO.remarks} />}
            </DetailSection>
            <DetailSection title="Notifications & Alerts">
              <DetailRow label="Escalation Level" value={selectedWO.escalation_level ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><Bell className="h-3 w-3" />Level {selectedWO.escalation_level}</span> : <span className="text-xs text-muted-foreground">None</span>} />
              <DetailRow label="SLA Due" value={selectedWO.sla_due_at ? <span className={`text-xs ${new Date(selectedWO.sla_due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(selectedWO.status) ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{format(new Date(selectedWO.sla_due_at), "dd MMM yyyy HH:mm")}{new Date(selectedWO.sla_due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(selectedWO.status) ? " (Overdue)" : ""}</span> : <span className="text-xs text-muted-foreground">Not set</span>} />
              <DetailRow label="Email Notifications" value={selectedWO.email_notified ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Bell className="h-3 w-3" />Sent</span> : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><BellOff className="h-3 w-3" />Pending</span>} />
            </DetailSection>
            <ActivityTimeline workOrderId={selectedWO.id} />
          </div>
        )}
      </ViewDialog>

      <MobileQrScannerDialog
        open={isRaiseQrScannerOpen}
        onOpenChange={setIsRaiseQrScannerOpen}
        title="Scan Machine QR for Raise Form"
        description="Scan the machine QR code to auto-fill the machine scope in this work order form."
        onDecoded={(value) => {
          void handleQrDecodedForRaiseForm(value);
        }}
      />

      <MobileQrScannerDialog
        open={isQrVerifyOpen}
        onOpenChange={setIsQrVerifyOpen}
        title="Scan Machine QR to Start Work"
        description="Scan the assigned machine QR before maintenance starts. If camera access is unavailable, switch to manual machine-code entry."
        onDecoded={(value) => {
          void handleQrDecodedForVerification(value);
        }}
        secondaryActionLabel="Enter Machine Code"
        onSecondaryAction={openManualVerification}
      />

      <Dialog
        open={isCameraDialogOpen}
        onOpenChange={(open) => {
          setIsCameraDialogOpen(open);
          if (!open) {
            setCameraTarget(null);
            setCameraError("");
            stopCameraStream();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Capture Photo</DialogTitle>
            <DialogDescription>
              Use the live camera to capture an image directly. If camera access is blocked, use file selection.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
            {cameraError ? (
              <div className="p-4 text-sm text-muted-foreground">{cameraError}</div>
            ) : (
              <video ref={cameraVideoRef} className="h-full w-full bg-black" autoPlay playsInline muted />
            )}
            <canvas ref={cameraCanvasRef} className="hidden" />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCameraDialogOpen(false);
                setCameraTarget(null);
                setCameraError("");
                stopCameraStream();
              }}
            >
              Cancel
            </Button>
            {cameraError ? (
              <Button
                type="button"
                onClick={() => {
                  const fileInput = cameraTarget === "CLOSE" ? closeFileInputRef.current : raiseFileInputRef.current;
                  setIsCameraDialogOpen(false);
                  openAttachmentPicker(fileInput);
                }}
              >
                Select From Files
              </Button>
            ) : (
              <Button type="button" onClick={() => { void captureCameraPhoto(); }}>
                Capture Photo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={isManualVerifyOpen}
        onOpenChange={setIsManualVerifyOpen}
        title="Manual Machine Verification"
        description="Search and select the machine, or enter the machine code manually."
        onSubmit={confirmManualVerification}
        submitLabel="Confirm Machine"
        size="sm"
      >
        <div className="space-y-3">
          <SearchableSelect
            value={manualMachineCode}
            onChange={(value) => {
              setManualMachineCode(value);
              setManualMachineSearchResults([]);
            }}
            options={manualMachineSearchResults}
            placeholder="Search machine by code or name..."
            emptyMessage="Type to search machines..."
            label="Machine Search"
          />
          <p className="text-xs text-muted-foreground text-center">— OR —</p>
          <InputField
            label="Machine Code Direct Entry"
            value={manualMachineCode}
            onChange={setManualMachineCode}
            placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}
            required
          />
          {manualMachineSearchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border/70 bg-background p-1">
              {manualMachineSearchResults.map((result) => (
                <button
                  key={result.value}
                  type="button"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    setManualMachineCode(result.value);
                    setManualMachineSearchResults([]);
                  }}
                >
                  {result.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </FormDialog>

      {qrMismatchMessage ? (
        <FormDialog
          open={Boolean(qrMismatchMessage)}
          onOpenChange={(open) => {
            if (!open) setQrMismatchMessage("");
          }}
          title="Machine Verification Failed"
          description={qrMismatchMessage}
          onSubmit={() => {
            setQrMismatchMessage("");
            setIsQrVerifyOpen(true);
            setIsManualVerifyOpen(false);
          }}
          submitLabel="Rescan QR"
        >
          <div className="space-y-3 text-sm">
            <p>This work order is not assigned for this machine.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!verifyTargetWO?.asset_id) return;
                navigate(`/machine/${verifyTargetWO.asset_id}`);
                setQrMismatchMessage("");
              }}
            >
              View assigned machine details
            </Button>
          </div>
        </FormDialog>
      ) : null}

      <FormDialog
        open={isSafetyOpen}
        onOpenChange={setIsSafetyOpen}
        title="Safety Confirmation"
        description="Confirm mandatory safety checks before starting maintenance"
        onSubmit={() => void confirmSafetyAndStartWork()}
        submitLabel="Confirm and Start Work"
        isLoading={isStartingWorkOrder}
      >
        <div className="space-y-4">
          {verificationMethod === "MANUAL_ENTRY" ? (
            <div className="rounded-2xl border border-dashed border-amber-400/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
              QR scanning was unavailable, so this work order is being verified through manual machine-code entry.
            </div>
          ) : null}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="safety-ppe"
              checked={safetyChecklist.ppe_worn}
              onCheckedChange={(checked) => setSafetyChecklist((prev) => ({ ...prev, ppe_worn: Boolean(checked) }))}
            />
            <Label htmlFor="safety-ppe">PPE worn</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="safety-isolated"
              checked={safetyChecklist.machine_isolated}
              onCheckedChange={(checked) => setSafetyChecklist((prev) => ({ ...prev, machine_isolated: Boolean(checked) }))}
            />
            <Label htmlFor="safety-isolated">Machine isolated</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="safety-lock"
              checked={safetyChecklist.safety_lock_applied}
              onCheckedChange={(checked) => setSafetyChecklist((prev) => ({ ...prev, safety_lock_applied: Boolean(checked) }))}
            />
            <Label htmlFor="safety-lock">Safety lock applied</Label>
          </div>
          <TextareaField
            label="Safety Notes"
            value={safetyChecklist.notes}
            onChange={(value) => setSafetyChecklist((prev) => ({ ...prev, notes: value }))}
            placeholder="Optional safety notes"
          />
        </div>
      </FormDialog>

      <FormDialog
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        title={reviewMode === "approve" ? "Accept & Close Work Order" : "Reject & Reopen Work Order"}
        description={
          reviewMode === "approve"
            ? reviewRequiresComments
              ? "This is an admin force close action. Enter comments for the audit trail."
              : "Review technician completion details and confirm closure."
            : reviewRequiresComments
              ? "This is an admin reopen action. Enter comments for the audit trail."
              : "Add comments so the technician can revise and resubmit."
        }
        onSubmit={handleReviewWorkOrder}
        submitLabel={reviewMode === "approve" ? "Accept & Close" : "Reject & Reopen"}
        size="md"
      >
        <TextareaField
          label={reviewMode === "approve" ? "Closure Comments" : "Reopen Comments"}
          value={reviewMode === "approve" ? reviewData.approve_comments : reviewData.reject_comments}
          onChange={(value) =>
            setReviewData((current) => ({
              ...current,
              [reviewMode === "approve" ? "approve_comments" : "reject_comments"]: value,
            }))
          }
          placeholder={reviewMode === "approve" ? "Optional comments for closure confirmation or audit log" : "Explain what must be corrected before resubmission"}
          required={reviewMode === "reject" || reviewRequiresComments}
        />
      </FormDialog>

    </PageShell>
  );
}

/** Inline activity timeline shown inside the work order view dialog. */
function ActivityTimeline({ workOrderId }: { workOrderId: string }) {
  const [events, setEvents] = useState<Array<{ event_type: string; notes: string | null; occurred_at: string; actor_name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  const loadEvents = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listWorkOrderActivity(workOrderId, { limit: 50 })
      .then((res: any) => {
        if (!cancelled) setEvents(res?.data?.activity ?? res?.data ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workOrderId]);

  useEffect(loadEvents, [loadEvents]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      await addWorkOrderActivity(workOrderId, {
        type: "COMMENT",
        notes: newComment.trim(),
      });
      setNewComment("");
      loadEvents();
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
    } finally {
      setSendingComment(false);
    }
  };

  const eventLabel = (type: string) => {
    const labels: Record<string, string> = {
      RAISED: 'Raised', ASSIGNED: 'Assigned', ACCEPTED: 'Accepted', WORK_STARTED: 'Work Started',
      TRIAGED: 'Triaged', COMMENT: 'Comment', INTERNAL_NOTE: 'Internal Note',
      USER_VERIFICATION_REQUESTED: 'Sent for Verification', USER_CONFIRMED_CLOSE: 'Closed',
      ADMIN_FORCE_CLOSED: 'Force Closed', USER_REOPENED: 'Reopened', ADMIN_REOPENED: 'Admin Reopened',
      FOLLOW_UP_ROUTED: 'Follow-up Routed', WORK_ORDER_ESCALATED: 'Escalated',
      BULK_UPDATE: 'Bulk Updated',
      USER_VERIFICATION_REMINDER_6H: '6h Reminder', USER_VERIFICATION_REMINDER_24H: '24h Reminder',
      AUTO_CLOSED_SLA: 'Auto-Closed',
    };
    return labels[type] || type;
  };

  const eventIcon = (type: string) => {
    if (type.includes('ESCALATED') || type.includes('REMINDER')) return Bell;
    if (type.includes('CLOSE') || type === 'USER_CONFIRMED_CLOSE') return CheckCircle;
    if (type.includes('REOPEN') || type === 'REJECTED') return AlertTriangle;
    if (type === 'WORK_STARTED') return Play;
    if (type === 'COMMENT') return Clock;
    if (type === 'BULK_UPDATE') return RefreshCw;
    return History;
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-2"><History className="h-4 w-4" />Activity Timeline</h4>

      {/* Inline comment input */}
      <div className="flex gap-2">
        <Input
          value={newComment}
          onChange={function(e) { setNewComment(e.target.value); }}
          placeholder="Add a comment..."
          className="h-9 text-sm bg-card/70 border border-border/60 text-foreground dark:bg-card/60"
          onKeyDown={function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAddComment();
            }
          }}
        />
        <Button
          size="sm"
          className="h-9 gap-1"
          onClick={handleAddComment}
          disabled={!newComment.trim() || sendingComment}
        >
          {sendingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
          Send
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No activity recorded yet</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {events.map((ev, i) => {
            const Icon = eventIcon(ev.event_type);
            return (
              <div key={i} className="flex gap-3 py-1.5 border-b border-dashed last:border-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{eventLabel(ev.event_type)}</p>
                  {ev.notes && <p className="text-xs text-muted-foreground truncate">{ev.notes}</p>}
                  <p className="text-[10px] text-muted-foreground/60">
                    {ev.occurred_at ? format(new Date(ev.occurred_at), "dd MMM HH:mm") : ''}
                    {ev.actor_name ? ` by ${ev.actor_name}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


