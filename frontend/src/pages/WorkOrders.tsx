import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { format, formatDistanceToNow, subHours } from "date-fns";
import {
  Plus, Search, Eye, MoreHorizontal, Play, CheckCircle, Loader2, RefreshCw,
  ClipboardList, Clock, CheckSquare, AlertTriangle, Send, Wrench
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
import { SpareUsageEditor, type SpareUsageDraft } from "@/components/spares/SpareUsageEditor";
import { useAuthStore, isAdmin, isIncharge, isSuperAdmin } from "@/store/auth.store";
import { dbClient } from "@/api/dbClient";
import { getStoredAccessToken } from "@/api/http";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import {
  approveWorkOrder,
  createWorkOrder,
  rejectWorkOrder,
  startWorkOrder,
  submitWorkOrderForApproval,
} from "@/api/workorders";
import { humanizeWorkOrderCode, normalizeWorkOrderCode } from "@/config/work-order-masters";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { parseQrContent } from "@/mobile/qr";
import { resolveQrMachineCode, resolveQrToken } from "@/api/qr";
import { compressImage } from "@/mobile/media";
import { hoursToMinutes } from "@/lib/time";
import { broadcastWorkOrderSync, subscribeWorkOrderSync } from "@/lib/work-order-sync";

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
  closeSpareUsage?: SpareUsageDraft[];
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

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const getInitialRaiseFormData = (plantId = "") => ({
  plant_id: plantId,
  department_id: "",
  module_id: "",
  asset_id: "",
  category: "",
  priority: "",
  problem_description: "",
  wo_type: "",
  failure_code: "",
  sub_category: "",
});

const EMPTY_CLOSE_DATA = {
  root_cause: "",
  action_taken: "",
  downtime_minutes: "0",
  failure_code: "",
  labor_hours: "0",
  actual_cost: "0",
  parts_replaced: "",
  operator_fault: false,
  warranty_claim: false,
  follow_up_required: false,
  follow_up_notes: "",
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
  if (status === "IN_PROGRESS") return "in_progress" as const;
  if (status === "APPROVAL_PENDING") return "critical" as const;
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

function buildSpareUsagePayload(rows: SpareUsageDraft[], availableSpares: SpareItem[]) {
  const spareById = new Map(availableSpares.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const quantity = Number.parseInt(row.quantity, 10);
      const spare = spareById.get(row.spareItemId);
      if (!spare || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        spare_item_id: spare.id,
        quantity,
        spare_name: spare.name,
        spare_code: spare.code,
      };
    })
    .filter((item): item is { spare_item_id: string; quantity: number; spare_name: string; spare_code: string } => Boolean(item));
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

  const { data: allWorkOrders = [], isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["work_orders", user?.authId || "anonymous"],
    enabled: authEnabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: workOrderRefetchInterval,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: (failureCount: number, error: any) => {
      const status = error?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("work_orders")
        .select("*, assets(id, code, name)")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const actorIds = useMemo(
    () =>
      new Set(
        [user?.authId, user?.id].filter((value): value is string => Boolean(value)),
      ),
    [user?.authId, user?.id],
  );
  const isOwnedByCurrentUser = (value: unknown) => typeof value === "string" && actorIds.has(value);

  const assignedWorkOrders = useMemo(() => {
    if (!user || actorIds.size === 0) return [];
    return allWorkOrders.filter((wo: any) => isOwnedByCurrentUser(wo.assigned_to));
  }, [actorIds, allWorkOrders, user]);

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
      (wo: any) => wo.status === "APPROVAL_PENDING" && (userIsAdmin || isOwnedByCurrentUser(wo.raised_by)),
    );
  }, [allWorkOrders, userIsAdmin]);

  const [activeTab, setActiveTab] = useState<"assigned" | "raised" | "incharge" | "all" | "approval">("assigned");
  const activeAssetHistoryId = assetIdFromQuery?.trim() || "";
  const isAssetHistoryMode = Boolean(activeAssetHistoryId);

  useEffect(() => {
    if (!authEnabled || activeTabInitializedRef.current) return;
    setActiveTab(userIsAdmin ? "all" : userIsIncharge ? "incharge" : "assigned");
    activeTabInitializedRef.current = true;
  }, [authEnabled, userIsAdmin, userIsIncharge]);

  useEffect(() => {
    if (activeTab === "all" && !userIsAdmin) {
      setActiveTab(userIsIncharge ? "incharge" : "assigned");
      return;
    }
    if (activeTab === "incharge" && !userIsIncharge) {
      setActiveTab(userIsAdmin ? "all" : "assigned");
    }
  }, [activeTab, userIsAdmin, userIsIncharge]);

  const displayedOrders = useMemo(() => {
    if (isAssetHistoryMode) {
      return allWorkOrders;
    }
    if (activeTab === "assigned") return assignedWorkOrders;
    if (activeTab === "raised") return raisedWorkOrders;
    if (userIsIncharge && activeTab === "incharge") return inchargeWorkOrders;
    if (activeTab === "approval") return approvalQueueWorkOrders;
    if (userIsAdmin && activeTab === "all") return allWorkOrders;
    return assignedWorkOrders;
  }, [activeTab, allWorkOrders, approvalQueueWorkOrders, assignedWorkOrders, inchargeWorkOrders, isAssetHistoryMode, raisedWorkOrders, userIsAdmin, userIsIncharge]);

  const kpiSource =
    isAssetHistoryMode
      ? allWorkOrders.filter((wo: any) => wo.asset_id === activeAssetHistoryId)
      : activeTab === "approval"
        ? approvalQueueWorkOrders
        : activeTab === "incharge"
          ? inchargeWorkOrders
          : activeTab === "all"
            ? allWorkOrders
            : activeTab === "raised"
              ? raisedWorkOrders
              : assignedWorkOrders;
  const now24h = subHours(new Date(), 24);
  const openWOs = kpiSource.filter((wo: any) => !["CLOSED"].includes(wo.status)).length;
  const closedLast24h = kpiSource.filter((wo: any) => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > now24h).length;
  const pendingApproval = kpiSource.filter((wo: any) => wo.status === "APPROVAL_PENDING").length;
  const totalWOs = kpiSource.length;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

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
    const matchesStatus = effectiveStatusFilter === "all" || wo.status === effectiveStatusFilter;
    const matchesCat = categoryFilter === "all" || wo.category === categoryFilter;
    const matchesType = typeFilter === "all" || wo.wo_type === typeFilter;
    return matchesAsset && matchesSearch && matchesStatus && matchesCat && matchesType;
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
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [isOpenFormOpen, setIsOpenFormOpen] = useState(false);
  const [openingWOId, setOpeningWOId] = useState<string | null>(null);
  const [isQrVerifyOpen, setIsQrVerifyOpen] = useState(false);
  const [verifyTargetWO, setVerifyTargetWO] = useState<any>(null);
  const [qrMismatchMessage, setQrMismatchMessage] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"QR_SCAN" | "MANUAL_ENTRY">("QR_SCAN");
  const [verifiedAssetId, setVerifiedAssetId] = useState<string | null>(null);
  const [isManualVerifyOpen, setIsManualVerifyOpen] = useState(false);
  const [manualMachineCode, setManualMachineCode] = useState("");
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [safetyChecklist, setSafetyChecklist] = useState({
    ppe_worn: false,
    machine_isolated: false,
    safety_lock_applied: false,
    notes: "",
  });
  const [closeAttachments, setCloseAttachments] = useState<PhotoAttachment[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewTargetWO, setReviewTargetWO] = useState<any>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [reviewData, setReviewData] = useState(() => ({ ...EMPTY_REVIEW_DATA }));
  const [photoAttachments, setPhotoAttachments] = useState<PhotoAttachment[]>([]);
  const raiseCameraInputRef = useRef<HTMLInputElement | null>(null);
  const raiseFileInputRef = useRef<HTMLInputElement | null>(null);
  const closeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const closeFileInputRef = useRef<HTMLInputElement | null>(null);

  // Raise form
  const [formData, setFormData] = useState(() => getInitialRaiseFormData(user?.plantId || ""));

  const { data: hierarchyData, isLoading: isHierarchyLoading } = useQuery({
    queryKey: ["work_order_raise_hierarchy", userIsSuperAdmin],
    queryFn: async () => {
      const [plantsResponse, departmentsResponse, modulesResponse] = await Promise.all([
        userIsSuperAdmin
          ? listPlants({ page: 1, limit: 500, includeInactive: true })
          : Promise.resolve({ data: [] as Plant[] }),
        listDepartments({ page: 1, limit: 1000, includeInactive: true }),
        listModules({ page: 1, limit: 1000, includeInactive: true }),
      ]);

      return {
        plants: plantsResponse.data || [],
        departments: departmentsResponse.data || [],
        modules: modulesResponse.data || [],
      };
    },
  });

  const plants = hierarchyData?.plants || [];
  const departments = hierarchyData?.departments || [];
  const modules = hierarchyData?.modules || [];
  const { data: workOrderConfigData, isLoading: isWorkOrderConfigLoading } = useQuery({
    queryKey: ["work_order_config_options", userIsSuperAdmin ? "all" : user?.plantId || "none"],
    enabled: userIsSuperAdmin || Boolean(user?.plantId),
    queryFn: async () => {
      const [mastersResponse, mappingsResponse] = await Promise.all([
        listWorkOrderMasters({
          page: 1,
          limit: 2000,
          includeInactive: false,
          ...(userIsSuperAdmin ? {} : { plantId: user?.plantId || "" }),
        }),
        listWorkOrderTeamMappings({
          page: 1,
          limit: 2000,
          ...(userIsSuperAdmin ? {} : { plantId: user?.plantId || "" }),
        }),
      ]);

      return {
        masters: mastersResponse.data || [],
        mappings: mappingsResponse.data || [],
      };
    },
  });
  const workOrderMasters = workOrderConfigData?.masters || [];
  const workOrderTeamMappings = workOrderConfigData?.mappings || [];
  const masterWorkOrderLabels = useMemo(() => {
    const map = new Map<string, string>();
    workOrderMasters
      .filter((item) => item.isActive)
      .sort(sortWorkOrderMasters)
      .forEach((item) => {
        const normalizedCode = normalizeWorkOrderCode(item.code);
        const scopedKey = `${item.plantId || ""}:${item.optionType}:${normalizedCode}`;
        const genericKey = `*:${item.optionType}:${normalizedCode}`;
        if (!map.has(scopedKey)) {
          map.set(scopedKey, item.label);
        }
        if (!map.has(genericKey)) {
          map.set(genericKey, item.label);
        }
      });
    return map;
  }, [workOrderMasters]);
  const resolveWorkOrderLabel = (
    optionType: WorkOrderMasterOptionType,
    code: string | null | undefined,
    plantId?: string | null,
  ) => {
    if (!code) return "-";
    const normalizedCode = normalizeWorkOrderCode(code);
    return (
      masterWorkOrderLabels.get(`${plantId || ""}:${optionType}:${normalizedCode}`) ||
      masterWorkOrderLabels.get(`*:${optionType}:${normalizedCode}`) ||
      humanizeWorkOrderCode(normalizedCode)
    );
  };
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

  useEffect(() => {
    const currentWoType = formData.wo_type;

    if (plantWorkOrderTypeOptions.length === 0) {
      if (!currentWoType) return;
      setFormData((prev) => ({ ...prev, wo_type: "" }));
      return;
    }

    if (currentWoType && plantWorkOrderTypeOptions.some((option) => option.value === currentWoType)) return;

    setFormData((prev) => ({
      ...prev,
      wo_type: plantWorkOrderTypeOptions[0].value,
    }));
  }, [formData.wo_type, plantWorkOrderTypeOptions]);

  useEffect(() => {
    if (!formData.category) return;
    if (routedCategoryOptions.some((option) => option.value === formData.category)) return;
    setFormData((prev) => ({ ...prev, category: "" }));
  }, [formData.category, routedCategoryOptions]);

  useEffect(() => {
    if (!formData.failure_code) return;
    if (plantFailureCodeOptions.some((option) => option.value === formData.failure_code)) return;
    setFormData((prev) => ({ ...prev, failure_code: "" }));
  }, [formData.failure_code, plantFailureCodeOptions]);

  // Open WO form
  const [openData, setOpenData] = useState({
    assigned_to_notes: "", estimated_minutes: "", initial_assessment: "",
  });

  // Close WO form
  const [closeData, setCloseData] = useState(() => ({ ...EMPTY_CLOSE_DATA }));
  const [closeSpareUsage, setCloseSpareUsage] = useState<SpareUsageDraft[]>([]);
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

  useEffect(() => {
    if (!closeData.failure_code) return;
    if (closeFailureCodeOptions.some((option) => option.value === closeData.failure_code)) return;
    setCloseData((prev) => ({ ...prev, failure_code: "" }));
  }, [closeData.failure_code, closeFailureCodeOptions]);

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

  const openAttachmentPicker = (input: HTMLInputElement | null, source: "camera" | "files") => {
    if (!input) return;

    if (source === "camera") {
      input.setAttribute("capture", "environment");
    } else {
      input.removeAttribute("capture");
    }

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
  };

  const confirmManualVerification = () => {
    if (!verifyTargetWO) return;
    const manualCode = manualMachineCode.trim();
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
    setIsSafetyOpen(true);
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
    setIsSafetyOpen(true);
  };

  const confirmSafetyAndStartWork = async () => {
    if (!verifyTargetWO) return;
    if (!safetyChecklist.ppe_worn || !safetyChecklist.machine_isolated || !safetyChecklist.safety_lock_applied) {
      toast.error("Confirm all safety checks before starting work");
      return;
    }
    if (!openData.initial_assessment.trim()) {
      toast.error("Initial assessment is required before work begins");
      return;
    }

    try {
      await startWorkOrder(verifyTargetWO.id, {
        verification_method: verificationMethod,
        scanned_asset_id: verificationMethod === "QR_SCAN" ? verifiedAssetId : null,
        manual_machine_code: verificationMethod === "MANUAL_ENTRY" ? manualMachineCode.trim() : null,
        initial_assessment: openData.initial_assessment.trim(),
        assigned_to_notes: openData.assigned_to_notes.trim() || null,
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
      setOpenData({ assigned_to_notes: "", estimated_minutes: "", initial_assessment: "" });
      triggerWorkOrderLiveSync();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start work");
    }
  };

  const handleSubmit = async () => {
    const raisedByUserId = user?.authId || session?.user?.id || "";
    const missingFields = [
      { label: "Plant", value: formData.plant_id },
      { label: "Department", value: formData.department_id },
      { label: "Module", value: formData.module_id },
      { label: "Machine", value: formData.asset_id },
      { label: "Work Order Type", value: formData.wo_type },
      { label: "Work Order Category", value: formData.category },
      { label: "Priority", value: formData.priority },
      { label: "Reported Problem", value: formData.problem_description.trim() },
    ].filter((field) => !field.value);

    if (missingFields.length > 0) {
      toast.error(`Required: ${missingFields.map((field) => field.label).join(", ")}`);
      return;
    }
    if (!plantWorkOrderTypeOptions.some((option) => option.value === formData.wo_type)) {
      toast.error("Select a valid work order type from Work Order Config Master");
      return;
    }
    if (!routedCategoryOptions.some((option) => option.value === formData.category)) {
      toast.error("Select a valid work order category from Work Order Config Master");
      return;
    }
    if (formData.failure_code && !plantFailureCodeOptions.some((option) => option.value === formData.failure_code)) {
      toast.error("Select a valid failure code from Work Order Config Master");
      return;
    }
    if (!raisedByUserId) {
      toast.error("Logged-in user details are missing. Please sign in again.");
      return;
    }
    try {
      const normalizedLocation =
        (typeof (selectedAsset as any)?.location === "string" ? (selectedAsset as any).location.trim() : "") || null;
      const payload = {
        asset_id: formData.asset_id,
        category: formData.category,
        priority: formData.priority,
        problem_description: formData.problem_description.trim(),
        wo_type: formData.wo_type,
        failure_code: formData.failure_code || null,
        sub_category: formData.sub_category || null,
        reported_location: normalizedLocation,
        ...(photoAttachments.length > 0 ? { attachments: photoAttachments } : {}),
      };

      await createWorkOrder(payload);
      toast.success("Work order raised successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to raise work order");
      return;
    }
    triggerWorkOrderLiveSync();
    setIsFormOpen(false);
    setPhotoAttachments([]);
  };

  const openOpenForm = (woId: string) => {
    setOpeningWOId(woId);
    setOpenData({ assigned_to_notes: "", estimated_minutes: "", initial_assessment: "" });
    setIsOpenFormOpen(true);
  };

  const handleOpenWO = async () => {
    if (!openingWOId) return;
    const wo = allWorkOrders.find((w: any) => w.id === openingWOId);
    if (!wo) {
      toast.error("Unable to load the selected work order");
      return;
    }
    if (!openData.initial_assessment.trim()) {
      toast.error("Initial assessment is required before opening the work order");
      return;
    }
    setIsOpenFormOpen(false);
    openQrVerification(wo);
  };

  const handleCloseWithDetails = async () => {
    if (!closingWOId) return;
    const spareConsumption = buildSpareUsagePayload(closeSpareUsage, closeAvailableSpares);
    const issueDetails = closeData.root_cause.trim();
    const workPerformed = closeData.action_taken.trim();
    const remarks = closeData.remarks.trim();
    const materialsUsed = closeData.parts_replaced.trim();
    const laborMinutes = Number.parseInt(closeData.labor_hours, 10) || 0;

    if (!issueDetails || !workPerformed || !remarks || laborMinutes <= 0 || (!materialsUsed && spareConsumption.length === 0) || closeAttachments.length === 0) {
      toast.error("Issue details, work performed, time spent, materials used, closure attachments, and remarks are required");
      return;
    }
    if (closeData.failure_code && !closeFailureCodeOptions.some((option) => option.value === closeData.failure_code)) {
      toast.error("Select a valid failure code from Work Order Config Master");
      return;
    }

    try {
      await submitWorkOrderForApproval(closingWOId, {
        issue_details: issueDetails,
        work_performed_description: workPerformed,
        time_spent_minutes: laborMinutes,
        downtime_minutes: parseInt(closeData.downtime_minutes) || 0,
        materials_used: materialsUsed || "Structured spare usage attached",
        attachments: closeAttachments,
        remarks,
        failure_code: closeData.failure_code || null,
        actual_cost: parseFloat(closeData.actual_cost) || 0,
        parts_replaced: materialsUsed || null,
        spare_consumption: spareConsumption,
        operator_fault: closeData.operator_fault,
        warranty_claim: closeData.warranty_claim,
        follow_up_required: closeData.follow_up_required,
        follow_up_notes: closeData.follow_up_notes || null,
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit work order for approval");
      return;
    }
    toast.success("Work order submitted for approval");
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
        toast.success("Work order approved");
      } else {
        if (!reviewData.reject_comments.trim()) {
          toast.error("Rejection comments are required");
          return;
        }
        await rejectWorkOrder(reviewTargetWO.id, {
          comments: reviewData.reject_comments.trim(),
        });
        toast.success("Work order rejected");
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
    if (isOwnedByCurrentUser(wo.assigned_to)) return true;
    return !wo.assigned_to && isOwnedByCurrentUser(wo.raised_by);
  };

  const canReviewWO = (wo: any) => {
    if (!user) return false;
    return wo.status === "APPROVAL_PENDING" && (isOwnedByCurrentUser(wo.raised_by) || userIsAdmin);
  };

  const reviewRequiresComments = Boolean(reviewTargetWO && userIsAdmin && !isOwnedByCurrentUser(reviewTargetWO.raised_by));

  const kpiCards = [
    { label: "Open Work Orders", value: openWOs, icon: ClipboardList, color: "text-blue-500" },
    { label: "Completed (24h)", value: closedLast24h, icon: CheckSquare, color: "text-green-500" },
    { label: "Pending Approval", value: pendingApproval, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Total", value: totalWOs, icon: Clock, color: "text-primary" },
  ];

  const columns = [
    { key: "wo", header: "WO Number", render: (wo: any) => (
      <div>
        <span className="font-semibold text-primary">{wo.wo_number}</span>
        <p className="text-xs text-muted-foreground">{resolveWorkOrderLabel("WO_TYPE", wo.wo_type, wo.plant_id)}</p>
      </div>
    )},
    { key: "asset", header: "Asset", render: (wo: any) => (<div><p className="font-medium">{wo.assets?.name || "-"}</p><p className="text-xs text-muted-foreground">{wo.assets?.code}</p></div>) },
    { key: "category", header: "Category", render: (wo: any) => resolveWorkOrderLabel("CATEGORY", wo.category, wo.plant_id), hideOnMobile: true },
    { key: "priority", header: "Priority", render: (wo: any) => <StatusBadge variant={wo.priority === "CRITICAL" ? "critical" : wo.priority === "HIGH" ? "warning" : "default"}>{wo.priority}</StatusBadge> },
    { key: "status", header: "Status", render: (wo: any) => <StatusBadge status={wo.status} variant={getStatusVariant(wo.status)} /> },
    { key: "raised", header: "Raised", hideOnMobile: true, render: (wo: any) => (<div><p className="text-sm">{format(new Date(wo.created_at), "dd MMM yyyy")}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })}</p></div>) },
    { key: "actions", header: "Actions", className: "text-right", render: (wo: any) => (
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleView(wo)}><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
          {canExecuteWO(wo) && (
            <>
              {(wo.status === "RAISED" || wo.status === "OPENED") && <DropdownMenuItem onClick={() => openOpenForm(wo.id)}><Play className="mr-2 h-4 w-4" />Open & Assess</DropdownMenuItem>}
              {wo.status === "IN_PROGRESS" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><Send className="mr-2 h-4 w-4" />Submit for Approval</DropdownMenuItem>}
              {wo.status === "REJECTED" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><Send className="mr-2 h-4 w-4" />Revise & Resubmit</DropdownMenuItem>}
            </>
          )}
          {canReviewWO(wo) && (
            <>
              <DropdownMenuItem onClick={() => openReviewDialog(wo, "approve")}><CheckCircle className="mr-2 h-4 w-4" />{userIsAdmin && !isOwnedByCurrentUser(wo.raised_by) ? "Admin Override Approve" : "Approve"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openReviewDialog(wo, "reject")}><AlertTriangle className="mr-2 h-4 w-4" />{userIsAdmin && !isOwnedByCurrentUser(wo.raised_by) ? "Admin Override Reject" : "Reject"}</DropdownMenuItem>
            </>
          )}
          {!canReviewWO(wo) && wo.status === "APPROVAL_PENDING" && (
            <DropdownMenuItem disabled className="text-muted-foreground">Awaiting raiser approval</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )},
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
        {kpiCards.map((kpi) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="h-full shadow-card">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}><kpi.icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold sm:text-2xl">{kpi.value}</p>
                    <p className="break-words text-xs leading-snug text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {(userIsAdmin || userIsIncharge || Boolean(user)) && !isAssetHistoryMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/60 p-3 shadow-sm">
          <Button variant={activeTab === "assigned" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("assigned")}>Assigned to Me ({assignedWorkOrders.length})</Button>
          <Button variant={activeTab === "raised" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("raised")}>Raised by Me ({raisedWorkOrders.length})</Button>
          {userIsIncharge && <Button variant={activeTab === "incharge" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("incharge")}>{inchargeCategories.join(", ")} ({inchargeWorkOrders.length})</Button>}
          {userIsAdmin && <Button variant={activeTab === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("all")}>All Work Orders ({allWorkOrders.length})</Button>}
          <Button
            variant={activeTab === "approval" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("approval")}
          >
            Approval Queue ({myApprovalQueueCount})
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{isFetching ? "Syncing updates..." : `Last synced ${lastSyncedLabel}`}</span>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void refetch()} disabled={isFetching || !authEnabled}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {isAssetHistoryMode && (
        <Card className="shadow-card">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Machine-Scoped History</p>
              <p className="text-xs text-muted-foreground">
                Showing work orders only for {prefetchedAsset?.code || "the selected machine"}.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearAssetHistoryFilter}>
              View All Machines
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardContent className="pt-4 pb-4">
          <FilterToolbar
            search={
              <>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 pl-9" />
              </>
            }
            filters={
              <>
                <SelectField label="" value={statusFilter} onChange={setStatusFilter} options={[
                  { value: "all", label: "All Status" },
                  { value: "RAISED", label: "Raised" }, { value: "OPENED", label: "Opened" },
                  { value: "IN_PROGRESS", label: "In Progress" }, { value: "APPROVAL_PENDING", label: "Submitted for Approval" },
                  { value: "REJECTED", label: "Rejected" }, { value: "CLOSED", label: "Completed" },
                ]} className="w-full sm:w-[160px] min-w-[140px] flex-shrink-0" />
                <SelectField label="" value={categoryFilter} onChange={setCategoryFilter} options={[
                  { value: "all", label: "All Categories" }, ...filterCategoryOptions
                ]} className="w-full sm:w-[160px] min-w-[140px] flex-shrink-0" />
                <SelectField label="" value={typeFilter} onChange={setTypeFilter} options={[
                  { value: "all", label: "All Types" }, ...filterTypeOptions
                ]} className="w-full sm:w-[160px] min-w-[140px] flex-shrink-0" />
              </>
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold">
            {isAssetHistoryMode
              ? "Machine Work Order History"
              : activeTab === "incharge"
                ? "Category Work Orders"
                : activeTab === "approval"
                  ? "Approval Queue"
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
                  <MobileCardRow label="Type" value={resolveWorkOrderLabel("WO_TYPE", wo.wo_type, wo.plant_id)} />
                  <MobileCardRow label="Category" value={resolveWorkOrderLabel("CATEGORY", wo.category, wo.plant_id)} />
                  <MobileCardRow label="Priority" value={wo.priority} />
                  <MobileCardRow label="Raised" value={formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* ===== RAISE WORK ORDER FORM (Enhanced) ===== */}
      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title="Raise Work Order" description="Create a detailed maintenance work order" onSubmit={handleSubmit} submitLabel="Raise Work Order" size="xl">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"><Wrench className="h-4 w-4" />Machine Scope</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Plant"
                value={formData.plant_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, plant_id: value, department_id: "", module_id: "", asset_id: "" }))}
                options={plantOptions}
                placeholder={userIsSuperAdmin ? "Select plant" : "Assigned plant"}
                disabled={!userIsSuperAdmin || plantOptions.length === 0}
                required
                hint={userIsSuperAdmin ? "Start with the plant where the issue occurred." : "Fixed from the logged-in user's plant access."}
              />
              <SelectField
                label="Department"
                value={formData.department_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, department_id: value, module_id: "", asset_id: "" }))}
                options={departmentsForPlant.map((department: Department) => ({
                  value: department.id,
                  label: `${department.code} - ${department.name}`,
                }))}
                placeholder={formData.plant_id ? "Select department" : "Select plant first"}
                disabled={!formData.plant_id}
                required
                hint="This narrows the available modules and machines."
              />
              <SelectField
                label="Module"
                value={formData.module_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, module_id: value, asset_id: "" }))}
                options={modulesForScope.map((module: MachineModule) => ({
                  value: module.id,
                  label: `${module.code ? `${module.code} - ` : ""}${module.name}`,
                }))}
                placeholder={formData.department_id ? "Select module" : "Select department first"}
                disabled={!formData.department_id}
                required
                hint="Select the module before choosing the machine."
              />
              <SelectField
                label="Machine"
                value={formData.asset_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, asset_id: value }))}
                options={assetOptions}
                placeholder={formData.module_id ? "Select machine" : "Select module first"}
                disabled={!formData.module_id || assetOptions.length === 0}
                required
                hint={isHierarchyLoading || isAssetsLoading ? "Loading machine hierarchy..." : "Machine is the asset against which the work order will be raised."}
              />
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-primary/20 bg-primary/5 p-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plant</p>
                <p className="mt-1 font-medium text-foreground">{selectedPlant ? selectedPlant.plantCode : "Not selected"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department</p>
                <p className="mt-1 font-medium text-foreground">{selectedDepartment ? selectedDepartment.code : "Not selected"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Module</p>
                <p className="mt-1 font-medium text-foreground">{selectedModule ? selectedModule.code || selectedModule.name : "Not selected"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Machine</p>
                <p className="mt-1 font-medium text-foreground">{selectedAsset ? selectedAsset.code : "Not selected"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Work Order Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="Raised By"
                value={raisedByLabel}
                onChange={() => {}}
                disabled
                hint="Auto-filled from the logged-in user."
              />
              <InputField
                label="Date & Time"
                value={raisedAtLabel}
                onChange={() => {}}
                disabled
                hint="Auto-filled from the current system date and time."
              />
              <SelectField
                label="Work Order Type"
                value={formData.wo_type}
                onChange={(value) => setFormData((prev) => ({ ...prev, wo_type: value }))}
                options={plantWorkOrderTypeOptions}
                placeholder="Select work order type"
                disabled={plantWorkOrderTypeOptions.length === 0}
                required
                hint={
                  isWorkOrderConfigLoading
                    ? "Loading work order types..."
                    : plantWorkOrderTypeOptions.length === 0
                      ? "No active work order types are configured for this plant. Update Work Order Config Master first."
                      : "Defines the maintenance workflow and expected urgency."
                }
              />
              <SelectField
                label="Work Order Category"
                value={formData.category}
                onChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                options={routedCategoryOptions}
                placeholder={formData.department_id ? "Select category" : "Select department first"}
                disabled={!formData.department_id || routedCategoryOptions.length === 0}
                required
                hint={
                  !formData.department_id
                    ? "Choose the department first to see its configured work order categories."
                    : routedCategoryOptions.length === 0
                      ? "No active work order categories are configured for this plant. Update Work Order Config Master first."
                    : selectedRoutingRule
                      ? "This category is routed through the department-wise team mapping."
                      : routedMappingsForDepartment.length > 0
                        ? "Only categories configured for this department are shown here."
                        : "All active categories are available because no department-specific routing is configured yet."
                }
              />
              <SelectField
                label="Priority"
                value={formData.priority}
                onChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
                options={PRIORITY_OPTIONS}
                placeholder="Select priority"
                required
                hint="Use Critical or High only when production or safety is directly affected."
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Problem Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextareaField label="Reported Problem" value={formData.problem_description} onChange={(v) => setFormData({ ...formData, problem_description: v })} placeholder="Describe the reported problem clearly..." className="sm:col-span-2" required />
              <SelectField label="Failure Code" value={formData.failure_code} onChange={(v) => setFormData({ ...formData, failure_code: v })} options={plantFailureCodeOptions} placeholder="Select if applicable" hint={isWorkOrderConfigLoading ? "Loading failure codes..." : "Optional classification for the reported issue."} />
              <InputField label="Sub-Category" value={formData.sub_category} onChange={(v) => setFormData({ ...formData, sub_category: v })} placeholder="e.g., Hydraulic System" />
            </div>

            <div className="mt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Attach Photo (auto-compressed)</Label>
              <input
                ref={raiseCameraInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Capture raise work order photo"
                title="Capture raise work order photo"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleMediaAttachment(file);
                  event.target.value = "";
                }}
              />
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
                    openAttachmentPicker(raiseCameraInputRef.current, "camera");
                  }}
                >
                  Open Camera
                </Button>
                <Button type="button" variant="outline" onClick={() => openAttachmentPicker(raiseFileInputRef.current, "files")}>
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
      <FormDialog open={isOpenFormOpen} onOpenChange={setIsOpenFormOpen} title="Open & Assess Work Order" description="Capture first assessment, then continue to machine verification and safety checks." onSubmit={handleOpenWO} submitLabel="Continue to Verification" size="lg">
        <div className="grid grid-cols-1 gap-4">
          <TextareaField label="Initial Assessment" value={openData.initial_assessment} onChange={(v) => setOpenData({ ...openData, initial_assessment: v })} placeholder="What is your initial assessment of the problem? What do you observe?" required />
          <InputField label="Estimated Time to Complete (minutes)" value={openData.estimated_minutes} onChange={(v) => setOpenData({ ...openData, estimated_minutes: v })} type="number" placeholder="e.g., 120" />
          <TextareaField label="Notes / Special Instructions" value={openData.assigned_to_notes} onChange={(v) => setOpenData({ ...openData, assigned_to_notes: v })} placeholder="Any special instructions, safety precautions, or tools needed..." />
        </div>
      </FormDialog>

      {/* ===== CLOSE WORK ORDER FORM (Enhanced) ===== */}
      <FormDialog open={isCloseFormOpen} onOpenChange={setIsCloseFormOpen} title="Close Work Order" description="Complete closure details, attach compressed photos, and submit for approval." onSubmit={handleCloseWithDetails} submitLabel="Submit for Approval" size="xl">
        <div className="space-y-6">
          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            Drafts auto-save while this form is open so technicians can resume incomplete closure details.
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Issue & Work Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextareaField label="Issue Details" value={closeData.root_cause} onChange={(v) => setCloseData({ ...closeData, root_cause: v })} placeholder="Describe the issue found during maintenance..." className="sm:col-span-2" required />
              <SelectField label="Failure Code" value={closeData.failure_code} onChange={(v) => setCloseData({ ...closeData, failure_code: v })} options={closeFailureCodeOptions} placeholder="Select failure code" hint={closeFailureCodeOptions.length === 0 ? "No active failure codes are configured for this plant." : "Uses the active failure codes configured for this work order's plant."} />
              <TextareaField label="Work Performed Description" value={closeData.action_taken} onChange={(v) => setCloseData({ ...closeData, action_taken: v })} placeholder="What corrective work was completed?" className="sm:col-span-2" required />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Time & Cost</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InputField label="Downtime (minutes)" value={closeData.downtime_minutes} onChange={(v) => setCloseData({ ...closeData, downtime_minutes: v })} type="number" />
              <InputField label="Time Spent (minutes)" value={closeData.labor_hours} onChange={(v) => setCloseData({ ...closeData, labor_hours: v })} type="number" />
              <InputField label="Actual Cost (₹)" value={closeData.actual_cost} onChange={(v) => setCloseData({ ...closeData, actual_cost: v })} type="number" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Materials, Photos & Remarks</h3>
            <div className="grid grid-cols-1 gap-4">
              <TextareaField label="Materials Used" value={closeData.parts_replaced} onChange={(v) => setCloseData({ ...closeData, parts_replaced: v })} placeholder="List parts replaced, consumables used, or structured spares selected below..." required />
              <SpareUsageEditor
                title="Structured Spare Usage"
                description="Select the actual spares used for this work order. Stock will be reduced automatically when approval is completed."
                rows={closeSpareUsage}
                onChange={setCloseSpareUsage}
                options={closeSpareOptions}
              />
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Closure Photo (auto-compressed)</Label>
                <input
                  ref={closeCameraInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Capture closure photo"
                  title="Capture closure photo"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void handleCloseMediaAttachment(file);
                    event.target.value = "";
                  }}
                />
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
                      openAttachmentPicker(closeCameraInputRef.current, "camera");
                    }}
                  >
                    Open Camera
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker(closeFileInputRef.current, "files")}>
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
                <Checkbox id="warranty_claim" checked={closeData.warranty_claim} onCheckedChange={(c) => setCloseData({ ...closeData, warranty_claim: !!c })} />
                <Label htmlFor="warranty_claim" className="text-sm">Warranty Claim</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="follow_up" checked={closeData.follow_up_required} onCheckedChange={(c) => setCloseData({ ...closeData, follow_up_required: !!c })} />
                <Label htmlFor="follow_up" className="text-sm">Follow-up Required</Label>
              </div>
            </div>
            {closeData.follow_up_required && (
              <TextareaField label="Follow-up Notes" value={closeData.follow_up_notes} onChange={(v) => setCloseData({ ...closeData, follow_up_notes: v })} placeholder="Describe the follow-up needed..." className="mt-4" />
            )}
          </div>
        </div>
      </FormDialog>

      {/* ===== VIEW DIALOG (Enhanced) ===== */}
      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedWO?.wo_number || ""} subtitle={selectedWO?.assets?.name}>
        {selectedWO && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-end gap-2">
              {(selectedWO.status === "RAISED" || selectedWO.status === "OPENED") && canExecuteWO(selectedWO) ? (
                <Button className="gap-2" onClick={() => openOpenForm(selectedWO.id)}>
                  <Play className="h-4 w-4" />
                  Open & Assess
                </Button>
              ) : null}
              {(selectedWO.status === "IN_PROGRESS" || selectedWO.status === "REJECTED") && canExecuteWO(selectedWO) ? (
                <Button className="gap-2" onClick={() => openCloseForm(selectedWO.id)}>
                  <Send className="h-4 w-4" />
                  {selectedWO.status === "REJECTED" ? "Revise & Resubmit" : "Submit for Approval"}
                </Button>
              ) : null}
              {selectedWO.status === "APPROVAL_PENDING" && canReviewWO(selectedWO) ? (
                <>
                  <Button className="gap-2" onClick={() => openReviewDialog(selectedWO, "approve")}>
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => openReviewDialog(selectedWO, "reject")}>
                    <AlertTriangle className="h-4 w-4" />
                    Reject
                  </Button>
                </>
              ) : null}
            </div>
            <DetailSection title="Work Order">
              <DetailRow label="WO Number" value={selectedWO.wo_number} />
              <DetailRow label="Type" value={resolveWorkOrderLabel("WO_TYPE", selectedWO.wo_type, selectedWO.plant_id)} />
              <DetailRow label="Status" value={<StatusBadge status={selectedWO.status} variant={getStatusVariant(selectedWO.status)} />} />
              <DetailRow label="Priority" value={<StatusBadge variant={selectedWO.priority === "CRITICAL" ? "critical" : selectedWO.priority === "HIGH" ? "warning" : "default"}>{selectedWO.priority}</StatusBadge>} />
              <DetailRow label="Category" value={resolveWorkOrderLabel("CATEGORY", selectedWO.category, selectedWO.plant_id)} />
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
              {selectedWO.failure_code && <DetailRow label="Failure Code" value={resolveWorkOrderLabel("FAILURE_CODE", selectedWO.failure_code, selectedWO.plant_id)} />}
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
              <DetailRow label="Warranty Claim" value={selectedWO.warranty_claim ? "Yes" : "No"} />
              <DetailRow label="Follow-up Required" value={selectedWO.follow_up_required ? "Yes" : "No"} />
              {selectedWO.follow_up_notes && <DetailRow label="Follow-up Notes" value={selectedWO.follow_up_notes} />}
            </DetailSection>
            <DetailSection title="Timeline">
              <DetailRow label="Raised" value={format(new Date(selectedWO.created_at), "dd MMM yyyy HH:mm")} />
              {selectedWO.opened_at && <DetailRow label="Opened" value={format(new Date(selectedWO.opened_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.started_at && <DetailRow label="Started" value={format(new Date(selectedWO.started_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.submitted_for_approval_at && <DetailRow label="Submitted for Approval" value={format(new Date(selectedWO.submitted_for_approval_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.rejected_at && <DetailRow label="Rejected" value={format(new Date(selectedWO.rejected_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.closed_at && <DetailRow label="Completed" value={format(new Date(selectedWO.closed_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.remarks && <DetailRow label="Remarks" value={selectedWO.remarks} />}
            </DetailSection>
          </div>
        )}
      </ViewDialog>

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

      <FormDialog
        open={isManualVerifyOpen}
        onOpenChange={setIsManualVerifyOpen}
        title="Manual Machine Verification"
        description="Enter the assigned machine code exactly as printed on the machine or asset card."
        onSubmit={confirmManualVerification}
        submitLabel="Confirm Machine"
        size="sm"
      >
        <InputField
          label="Machine Code"
          value={manualMachineCode}
          onChange={setManualMachineCode}
          placeholder={verifyTargetWO?.assets?.code || "Enter machine code"}
          required
        />
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
        title={reviewMode === "approve" ? "Approve Work Order" : "Reject Work Order"}
        description={
          reviewMode === "approve"
            ? reviewRequiresComments
              ? "This is an admin override approval. Enter comments for the audit trail."
              : "Review the technician submission and approve completion."
            : reviewRequiresComments
              ? "This is an admin override rejection. Enter comments for the audit trail."
              : "Add rejection comments so the technician can revise and resubmit."
        }
        onSubmit={handleReviewWorkOrder}
        submitLabel={reviewMode === "approve" ? "Approve" : "Reject"}
        size="md"
      >
        <TextareaField
          label={reviewMode === "approve" ? "Approval Comments" : "Rejection Comments"}
          value={reviewMode === "approve" ? reviewData.approve_comments : reviewData.reject_comments}
          onChange={(value) =>
            setReviewData((current) => ({
              ...current,
              [reviewMode === "approve" ? "approve_comments" : "reject_comments"]: value,
            }))
          }
          placeholder={reviewMode === "approve" ? "Optional comments for the technician or audit log" : "Explain what must be corrected before resubmission"}
          required={reviewMode === "reject" || reviewRequiresComments}
        />
      </FormDialog>
    </PageShell>
  );
}
