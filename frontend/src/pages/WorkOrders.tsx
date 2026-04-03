import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { format, formatDistanceToNow, subHours } from "date-fns";
import {
  Plus, Search, Eye, MoreHorizontal, Play, CheckCircle, Loader2,
  ClipboardList, Clock, CheckSquare, AlertTriangle, Send, Wrench, ScanLine, Camera, Video, Mic, Square
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createNotification } from "@/hooks/useNotifications";
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
import { createWorkOrder, updateWorkOrder } from "@/api/workorders";
import { getFallbackWorkOrderOptions, humanizeWorkOrderCode, normalizeWorkOrderCode } from "@/config/work-order-masters";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { parseQrContent } from "@/mobile/qr";
import { resolveQrToken } from "@/api/qr";
import { compressImage, fileToDataUrl } from "@/mobile/media";
import { executeOrQueueMutation } from "@/mobile/offlineSync";

const INCHARGE_CATEGORY_MAP: Record<string, string> = {
  MECHANICAL_INCHARGE: "MECHANICAL",
  ELECTRICAL_INCHARGE: "ELECTRICAL",
  UTILITY_INCHARGE: "UTILITY",
  TOOLCHANGE_INCHARGE: "TOOL_CHANGE",
  CALIBRATION_INCHARGE: "CALIBRATION",
};

function getInchargeCategories(roles: string[]): string[] {
  return roles.filter((r) => INCHARGE_CATEGORY_MAP[r]).map((r) => INCHARGE_CATEGORY_MAP[r]);
}

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const WORK_ORDER_OPTION_TYPES: WorkOrderMasterOptionType[] = ["CATEGORY", "WO_TYPE", "FAILURE_CODE"];

const getInitialRaiseFormData = (plantId = "") => ({
  plant_id: plantId,
  department_id: "",
  module_id: "",
  asset_id: "",
  category: "",
  priority: "",
  problem_description: "",
  wo_type: "BREAKDOWN",
  failure_code: "",
  sub_category: "",
  safety_related: false,
  estimated_cost: "",
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
};

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

  return scoped.length > 0 ? dedupeOptions(scoped) : getFallbackWorkOrderOptions(optionType);
}

function getUnionWorkOrderOptions(masters: WorkOrderMaster[], optionType: WorkOrderMasterOptionType) {
  const union = masters
    .filter((item) => item.isActive && item.optionType === optionType)
    .sort(sortWorkOrderMasters)
    .map((item) => ({ value: item.code, label: item.label }));

  return dedupeOptions(union.length > 0 ? union : getFallbackWorkOrderOptions(optionType));
}

export default function WorkOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session } = useAuthStore();
  const queryClient = useQueryClient();
  const [raiseDateTime, setRaiseDateTime] = useState(() => new Date());

  const userIsAdmin = isAdmin(user);
  const userIsSuperAdmin = isSuperAdmin(user);
  const userIsIncharge = isIncharge(user);
  const inchargeCategories = useMemo(() => getInchargeCategories(user?.roles || []), [user?.roles]);
  const assetPrefillApplied = useRef<string | null>(null);
  const assetIdFromQuery = searchParams.get("assetId");

  const { data: allWorkOrders = [], isLoading } = useQuery({
    queryKey: ["work_orders"],
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("work_orders")
        .select("*, assets(id, code, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const myWorkOrders = useMemo(() => {
    if (!user) return [];
    return allWorkOrders.filter((wo: any) => wo.raised_by === user.authId);
  }, [allWorkOrders, user]);

  const inchargeWorkOrders = useMemo(() => {
    if (!userIsIncharge || inchargeCategories.length === 0) return [];
    return allWorkOrders.filter(
      (wo: any) => inchargeCategories.includes(wo.category) && wo.raised_by !== user?.authId
    );
  }, [allWorkOrders, userIsIncharge, inchargeCategories, user]);

  const [activeTab, setActiveTab] = useState<"my" | "incharge" | "all">(userIsAdmin ? "all" : "my");

  const displayedOrders = useMemo(() => {
    if (userIsAdmin) {
      if (activeTab === "my") return myWorkOrders;
      return allWorkOrders;
    }
    if (userIsIncharge && activeTab === "incharge") return inchargeWorkOrders;
    return myWorkOrders;
  }, [activeTab, userIsAdmin, userIsIncharge, myWorkOrders, inchargeWorkOrders, allWorkOrders]);

  const kpiSource = activeTab === "incharge" ? inchargeWorkOrders : activeTab === "all" ? allWorkOrders : myWorkOrders;
  const now24h = subHours(new Date(), 24);
  const openWOs = kpiSource.filter((wo: any) => !["CLOSED"].includes(wo.status)).length;
  const closedLast24h = kpiSource.filter((wo: any) => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > now24h).length;
  const pendingApproval = kpiSource.filter((wo: any) => wo.status === "APPROVAL_PENDING").length;
  const totalWOs = kpiSource.length;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = displayedOrders.filter((wo: any) => {
    const matchesSearch = wo.wo_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.assets?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || wo.status === statusFilter;
    const matchesCat = categoryFilter === "all" || wo.category === categoryFilter;
    const matchesType = typeFilter === "all" || wo.wo_type === typeFilter;
    return matchesSearch && matchesStatus && matchesCat && matchesType;
  });

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [isOpenFormOpen, setIsOpenFormOpen] = useState(false);
  const [openingWOId, setOpeningWOId] = useState<string | null>(null);
  const [isQrVerifyOpen, setIsQrVerifyOpen] = useState(false);
  const [verifyTargetWO, setVerifyTargetWO] = useState<any>(null);
  const [qrMismatchMessage, setQrMismatchMessage] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"QR_SCAN" | "MANUAL_CONFIRMATION">("QR_SCAN");
  const [verifiedAssetId, setVerifiedAssetId] = useState<string | null>(null);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [safetyChecklist, setSafetyChecklist] = useState({
    ppe_worn: false,
    machine_isolated: false,
    safety_lock_applied: false,
    notes: "",
  });
  const [photoAttachments, setPhotoAttachments] = useState<Array<Record<string, unknown>>>([]);
  const [voiceNotes, setVoiceNotes] = useState<Array<Record<string, unknown>>>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStartRef = useRef<number>(0);

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
  const fallbackWorkOrderLabels = useMemo(() => {
    const map = new Map<string, string>();
    WORK_ORDER_OPTION_TYPES.forEach((optionType) => {
      getFallbackWorkOrderOptions(optionType).forEach((option) => {
        map.set(`${optionType}:${option.value}`, option.label);
      });
    });
    return map;
  }, []);
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
      fallbackWorkOrderLabels.get(`${optionType}:${normalizedCode}`) ||
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
      wo_type: mode.includes("breakdown") ? "BREAKDOWN" : prev.wo_type,
      category: mode.includes("breakdown") && !prev.category ? "MECHANICAL" : prev.category,
    }));

    if (mode.startsWith("create")) {
      setIsFormOpen(true);
    }
  }, [assetIdFromQuery, prefetchedAsset, searchParams, user?.plantId]);

  useEffect(() => {
    if (!formData.wo_type) return;
    if (plantWorkOrderTypeOptions.some((option) => option.value === formData.wo_type)) return;
    setFormData((prev) => ({
      ...prev,
      wo_type: plantWorkOrderTypeOptions[0]?.value || "",
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
    assigned_to_notes: "", estimated_hours: "", initial_assessment: "",
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

  const handleView = (wo: any) => { setSelectedWO(wo); setIsViewOpen(true); };
  const handleAdd = () => {
    setFormData(getInitialRaiseFormData(userIsSuperAdmin ? "" : user?.plantId || ""));
    setPhotoAttachments([]);
    setVoiceNotes([]);
    setIsFormOpen(true);
  };

  const handleMediaAttachment = async (file: File | null) => {
    if (!file) return;

    try {
      const isImage = file.type.startsWith("image/");
      const dataUrl = isImage ? await compressImage(file) : await fileToDataUrl(file);
      setPhotoAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          mime_type: file.type,
          data_url: dataUrl,
          captured_at: new Date().toISOString(),
        },
      ]);
      toast.success("Attachment added");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to attach media");
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      voiceStartRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" });
        const dataUrl = await fileToDataUrl(file);
        const durationSeconds = Math.max(1, Math.round((Date.now() - voiceStartRef.current) / 1000));
        setVoiceNotes((prev) => [
          ...prev,
          {
            name: file.name,
            duration_seconds: durationSeconds,
            data_url: dataUrl,
            captured_at: new Date().toISOString(),
          },
        ]);
        stream.getTracks().forEach((track) => track.stop());
      };

      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
    } catch {
      toast.error("Microphone access is required to record voice notes");
    }
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    voiceRecorderRef.current = null;
    setIsRecordingVoice(false);
    toast.success("Voice note captured");
  };

  const openQrVerification = (wo: any) => {
    setVerifyTargetWO(wo);
    setQrMismatchMessage("");
    setVerificationMethod("QR_SCAN");
    setVerifiedAssetId(null);
    setSafetyChecklist({ ppe_worn: false, machine_isolated: false, safety_lock_applied: false, notes: "" });
    setIsQrVerifyOpen(true);
  };

  const continueWithoutQrVerification = () => {
    if (!verifyTargetWO) return;
    setIsQrVerifyOpen(false);
    setQrMismatchMessage("");
    setVerificationMethod("MANUAL_CONFIRMATION");
    setVerifiedAssetId(null);
    setIsSafetyOpen(true);
  };

  const handleQrDecodedForVerification = async (rawValue: string) => {
    if (!verifyTargetWO) return;
    const parsed = parseQrContent(rawValue);
    let scannedMachineId = parsed.machineId || "";

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

    try {
      await updateWorkOrder(verifyTargetWO.id, {
        status: "IN_PROGRESS",
        started_at: new Date().toISOString(),
        technician_verification: {
          verified_at: new Date().toISOString(),
          method: verificationMethod,
          ...(verifiedAssetId ? { scanned_asset_id: verifiedAssetId } : {}),
        },
        safety_checklist: {
          ...safetyChecklist,
          confirmed_at: new Date().toISOString(),
        },
      });
      toast.success(
        verificationMethod === "QR_SCAN" ? "Machine verified. Work started." : "Work started without QR verification.",
      );
      setIsSafetyOpen(false);
      setVerifyTargetWO(null);
      setVerificationMethod("QR_SCAN");
      setVerifiedAssetId(null);
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
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
    if (!raisedByUserId) {
      toast.error("Logged-in user details are missing. Please sign in again.");
      return;
    }
    try {
      const trimmedEstimatedCost = formData.estimated_cost.trim();
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
        safety_related: formData.safety_related,
        reported_location: normalizedLocation,
        ...(trimmedEstimatedCost ? { estimated_cost: Number.parseFloat(trimmedEstimatedCost) || 0 } : {}),
        ...(photoAttachments.length > 0 ? { attachments: photoAttachments } : {}),
        ...(voiceNotes.length > 0 ? { voice_notes: voiceNotes } : {}),
      };

      if (!navigator.onLine) {
        await executeOrQueueMutation({
          url: "/work-orders",
          method: "POST",
          body: payload,
        });
        toast.success("Offline mode: work order queued and will auto-sync");
      } else {
        await createWorkOrder(payload);
        toast.success("Work order raised successfully");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to raise work order");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["work_orders"] });
    setIsFormOpen(false);
    setPhotoAttachments([]);
    setVoiceNotes([]);
  };

  const openOpenForm = (woId: string) => {
    setOpeningWOId(woId);
    setOpenData({ assigned_to_notes: "", estimated_hours: "", initial_assessment: "" });
    setIsOpenFormOpen(true);
  };

  const handleOpenWO = async () => {
    if (!openingWOId) return;
    const wo = allWorkOrders.find((w: any) => w.id === openingWOId);
    try {
      const payload = {
        status: "OPENED",
        opened_at: new Date().toISOString(),
        remarks: openData.initial_assessment || null,
      };
      if (!navigator.onLine) {
        await executeOrQueueMutation({
          url: `/work-orders/${openingWOId}`,
          method: "PATCH",
          body: payload,
        });
        toast.success("Offline mode: open action queued for sync");
      } else {
        await updateWorkOrder(openingWOId, payload);
        toast.success("Work order opened");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to open work order");
      return;
    }
    if (wo?.raised_by) {
      createNotification({
        userId: wo.raised_by, title: "Work Order Opened",
        message: `${wo.wo_number} has been opened. Assessment: ${openData.initial_assessment || "N/A"}`,
        type: "info", link: "/work-orders", woId: wo.id,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["work_orders"] });
    setIsOpenFormOpen(false);
    setOpeningWOId(null);
  };

  const updateStatus = async (woId: string, newStatus: string) => {
    const wo = allWorkOrders.find((w: any) => w.id === woId);
    const updates: any = { status: newStatus };
    if (newStatus === "OPENED") updates.opened_at = new Date().toISOString();
    if (newStatus === "CLOSED") updates.closed_at = new Date().toISOString();
    try {
      if (!navigator.onLine) {
        await executeOrQueueMutation({
          url: `/work-orders/${woId}`,
          method: "PATCH",
          body: updates,
        });
        toast.success("Offline mode: status update queued");
      } else {
        await updateWorkOrder(woId, updates);
        toast.success(`Work order ${newStatus.replace(/_/g, " ").toLowerCase()}`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update work order");
      return;
    }
    if (wo) {
      if (newStatus === "IN_PROGRESS" && wo.raised_by) {
        createNotification({ userId: wo.raised_by, title: "Work Order In Progress", message: `${wo.wo_number} is now being worked on`, type: "info", link: "/work-orders", woId: wo.id });
      }
      if (newStatus === "APPROVAL_PENDING" && wo.raised_by) {
        createNotification({ userId: wo.raised_by, title: "Approval Required", message: `${wo.wo_number} is closed and waiting for your approval`, type: "critical", link: "/work-orders", woId: wo.id });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["work_orders"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
  };

  const handleCloseWithDetails = async () => {
    if (!closingWOId) return;
    const wo = allWorkOrders.find((w: any) => w.id === closingWOId);
    const spareConsumption = buildSpareUsagePayload(closeSpareUsage, closeAvailableSpares);
    try {
      await updateWorkOrder(closingWOId, {
        status: "CLOSED",
        closed_at: new Date().toISOString(),
        root_cause: closeData.root_cause || null,
        action_taken: closeData.action_taken || null,
        downtime_minutes: parseInt(closeData.downtime_minutes) || 0,
        failure_code: closeData.failure_code || null,
        labor_hours: parseFloat(closeData.labor_hours) || 0,
        actual_cost: parseFloat(closeData.actual_cost) || 0,
        parts_replaced: closeData.parts_replaced || null,
        spare_consumption: spareConsumption,
        operator_fault: closeData.operator_fault,
        warranty_claim: closeData.warranty_claim,
        follow_up_required: closeData.follow_up_required,
        follow_up_notes: closeData.follow_up_notes || null,
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to close work order");
      return;
    }
    toast.success("Work order closed");
    if (wo?.raised_by) {
      createNotification({ userId: wo.raised_by, title: "Work Order Closed", message: `${wo.wo_number} has been closed. Root cause: ${closeData.root_cause || "N/A"}`, type: "success", link: "/work-orders", woId: wo.id });
    }
    queryClient.invalidateQueries({ queryKey: ["work_orders"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    queryClient.invalidateQueries({ queryKey: ["spare-maintenance-items"] });
    setIsCloseFormOpen(false);
    setClosingWOId(null);
    setCloseData({ ...EMPTY_CLOSE_DATA });
    setCloseSpareUsage([]);
  };

  const openCloseForm = (woId: string) => {
    setClosingWOId(woId);
    setCloseData({ ...EMPTY_CLOSE_DATA });
    setCloseSpareUsage([]);
    setIsCloseFormOpen(true);
  };

  const canManageWO = (wo: any) => {
    if (userIsAdmin) return true;
    if (userIsIncharge && inchargeCategories.includes(wo.category)) return true;
    return false;
  };

  const kpiCards = [
    { label: "Open Work Orders", value: openWOs, icon: ClipboardList, color: "text-blue-500" },
    { label: "Closed (24h)", value: closedLast24h, icon: CheckSquare, color: "text-green-500" },
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
    { key: "status", header: "Status", render: (wo: any) => <StatusBadge variant={wo.status === "CLOSED" ? "completed" : wo.status === "IN_PROGRESS" ? "in_progress" : wo.status === "RAISED" ? "warning" : wo.status === "APPROVAL_PENDING" ? "critical" : "default"}>{wo.status.replace(/_/g, " ")}</StatusBadge> },
    { key: "raised", header: "Raised", hideOnMobile: true, render: (wo: any) => (<div><p className="text-sm">{format(new Date(wo.created_at), "dd MMM yyyy")}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })}</p></div>) },
    { key: "actions", header: "Actions", className: "text-right", render: (wo: any) => (
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleView(wo)}><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
          {canManageWO(wo) && (
            <>
              {wo.status === "RAISED" && <DropdownMenuItem onClick={() => openOpenForm(wo.id)}><Play className="mr-2 h-4 w-4" />Open & Assess</DropdownMenuItem>}
              {wo.status === "OPENED" && <DropdownMenuItem onClick={() => openQrVerification(wo)}><ScanLine className="mr-2 h-4 w-4" />Scan Machine QR to Start Work</DropdownMenuItem>}
              {wo.status === "IN_PROGRESS" && <DropdownMenuItem onClick={() => updateStatus(wo.id, "APPROVAL_PENDING")}><Send className="mr-2 h-4 w-4" />Send for Approval</DropdownMenuItem>}
              {wo.status === "IN_PROGRESS" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><CheckCircle className="mr-2 h-4 w-4" />Close with Details</DropdownMenuItem>}
              {wo.status === "APPROVAL_PENDING" && <DropdownMenuItem onClick={() => openCloseForm(wo.id)}><CheckCircle className="mr-2 h-4 w-4" />Approve & Close</DropdownMenuItem>}
            </>
          )}
          {!canManageWO(wo) && wo.raised_by === user?.authId && wo.status === "APPROVAL_PENDING" && (
            <DropdownMenuItem disabled className="text-muted-foreground">Awaiting Approval</DropdownMenuItem>
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

      {(userIsAdmin || userIsIncharge) && (
        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === "my" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("my")}>My Work Orders ({myWorkOrders.length})</Button>
          {userIsIncharge && <Button variant={activeTab === "incharge" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("incharge")}>{inchargeCategories.join(", ")} ({inchargeWorkOrders.length})</Button>}
          {userIsAdmin && <Button variant={activeTab === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("all")}>All Work Orders ({allWorkOrders.length})</Button>}
        </div>
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
                  { value: "IN_PROGRESS", label: "In Progress" }, { value: "APPROVAL_PENDING", label: "Approval Pending" },
                  { value: "CLOSED", label: "Closed" },
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
            {activeTab === "incharge" ? "Category Work Orders" : activeTab === "all" ? "All Work Orders" : "My Work Orders"} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(wo: any) => wo.id}
              mobileCard={(wo: any) => (
                <MobileCard onView={() => handleView(wo)}>
                  <MobileCardHeader title={wo.wo_number} subtitle={wo.assets?.name} badge={<StatusBadge variant={wo.status === "CLOSED" ? "completed" : wo.status === "APPROVAL_PENDING" ? "critical" : "warning"}>{wo.status.replace(/_/g, " ")}</StatusBadge>} />
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
                required
                hint={isWorkOrderConfigLoading ? "Loading work order types..." : "Defines the maintenance workflow and expected urgency."}
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
              <InputField label="Estimated Cost (₹)" value={formData.estimated_cost} onChange={(v) => setFormData({ ...formData, estimated_cost: v })} type="number" placeholder="0" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Attach Photo (compressed)</Label>
                <Input type="file" accept="image/*" capture="environment" onChange={(event) => void handleMediaAttachment(event.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Attach Video</Label>
                <Input type="file" accept="video/*" capture="environment" onChange={(event) => void handleMediaAttachment(event.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant={isRecordingVoice ? "destructive" : "outline"} className="gap-2" onClick={isRecordingVoice ? stopVoiceRecording : () => void startVoiceRecording()}>
                {isRecordingVoice ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isRecordingVoice ? "Stop Voice Note" : "Record Voice Note"}
              </Button>
              <p className="text-xs text-muted-foreground">Voice notes: {voiceNotes.length} | Media attachments: {photoAttachments.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2 rounded-lg border border-border/70 px-3 py-2">
              <Checkbox id="safety_related" checked={formData.safety_related} onCheckedChange={(c) => setFormData({ ...formData, safety_related: !!c })} />
              <Label htmlFor="safety_related" className="text-sm">Safety Related</Label>
            </div>
          </div>
        </div>
      </FormDialog>

      {/* ===== OPEN WORK ORDER FORM ===== */}
      <FormDialog open={isOpenFormOpen} onOpenChange={setIsOpenFormOpen} title="Open & Assess Work Order" description="Provide initial assessment before starting work" onSubmit={handleOpenWO} submitLabel="Open Work Order" size="lg">
        <div className="grid grid-cols-1 gap-4">
          <TextareaField label="Initial Assessment" value={openData.initial_assessment} onChange={(v) => setOpenData({ ...openData, initial_assessment: v })} placeholder="What is your initial assessment of the problem? What do you observe?" />
          <InputField label="Estimated Hours to Complete" value={openData.estimated_hours} onChange={(v) => setOpenData({ ...openData, estimated_hours: v })} type="number" placeholder="e.g., 4" />
          <TextareaField label="Notes / Special Instructions" value={openData.assigned_to_notes} onChange={(v) => setOpenData({ ...openData, assigned_to_notes: v })} placeholder="Any special instructions, safety precautions, or tools needed..." />
        </div>
      </FormDialog>

      {/* ===== CLOSE WORK ORDER FORM (Enhanced) ===== */}
      <FormDialog open={isCloseFormOpen} onOpenChange={setIsCloseFormOpen} title="Close Work Order" description="Provide detailed closure information" onSubmit={handleCloseWithDetails} submitLabel="Close Work Order" size="xl">
        <div className="space-y-6">
          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            QR scan is optional for closure. You can complete the work order with the resolution details even when camera verification is not available.
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Root Cause Analysis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextareaField label="Root Cause" value={closeData.root_cause} onChange={(v) => setCloseData({ ...closeData, root_cause: v })} placeholder="What was the root cause of the failure?" className="sm:col-span-2" />
              <SelectField label="Failure Code" value={closeData.failure_code} onChange={(v) => setCloseData({ ...closeData, failure_code: v })} options={closeFailureCodeOptions} placeholder="Select failure code" hint="Uses the active failure codes configured for this work order's plant." />
              <TextareaField label="Action Taken" value={closeData.action_taken} onChange={(v) => setCloseData({ ...closeData, action_taken: v })} placeholder="What corrective action was taken?" className="sm:col-span-2" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Time & Cost</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InputField label="Downtime (minutes)" value={closeData.downtime_minutes} onChange={(v) => setCloseData({ ...closeData, downtime_minutes: v })} type="number" />
              <InputField label="Labor Hours" value={closeData.labor_hours} onChange={(v) => setCloseData({ ...closeData, labor_hours: v })} type="number" />
              <InputField label="Actual Cost (₹)" value={closeData.actual_cost} onChange={(v) => setCloseData({ ...closeData, actual_cost: v })} type="number" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Parts & Additional Info</h3>
            <div className="grid grid-cols-1 gap-4">
              <TextareaField label="Parts Replaced / Spares Used" value={closeData.parts_replaced} onChange={(v) => setCloseData({ ...closeData, parts_replaced: v })} placeholder="List any parts replaced or spares consumed..." />
              <SpareUsageEditor
                title="Structured Spare Usage"
                description="Select the actual spares used for this work order. Stock will be reduced automatically when the work order is closed."
                rows={closeSpareUsage}
                onChange={setCloseSpareUsage}
                options={closeSpareOptions}
              />
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
            {selectedWO.status === "OPENED" ? (
              <div className="flex justify-end">
                <Button className="gap-2" onClick={() => openQrVerification(selectedWO)}>
                  <ScanLine className="h-4 w-4" />
                  Scan Machine QR to Start Work
                </Button>
              </div>
            ) : null}
            <DetailSection title="Work Order">
              <DetailRow label="WO Number" value={selectedWO.wo_number} />
              <DetailRow label="Type" value={resolveWorkOrderLabel("WO_TYPE", selectedWO.wo_type, selectedWO.plant_id)} />
              <DetailRow label="Status" value={<StatusBadge variant={selectedWO.status === "CLOSED" ? "completed" : "warning"}>{selectedWO.status?.replace(/_/g, " ")}</StatusBadge>} />
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
              {selectedWO.root_cause && <DetailRow label="Root Cause" value={selectedWO.root_cause} />}
              {selectedWO.action_taken && <DetailRow label="Action Taken" value={selectedWO.action_taken} />}
              {selectedWO.parts_replaced && <DetailRow label="Parts Replaced" value={selectedWO.parts_replaced} />}
            </DetailSection>
            <DetailSection title="Time & Cost">
              {selectedWO.downtime_minutes > 0 && <DetailRow label="Downtime" value={`${selectedWO.downtime_minutes} min`} />}
              {selectedWO.labor_hours > 0 && <DetailRow label="Labor Hours" value={`${selectedWO.labor_hours} hrs`} />}
              {selectedWO.estimated_cost > 0 && <DetailRow label="Estimated Cost" value={`₹${selectedWO.estimated_cost}`} />}
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
              {selectedWO.closed_at && <DetailRow label="Closed" value={format(new Date(selectedWO.closed_at), "dd MMM yyyy HH:mm")} />}
              {selectedWO.remarks && <DetailRow label="Remarks" value={selectedWO.remarks} />}
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <MobileQrScannerDialog
        open={isQrVerifyOpen}
        onOpenChange={setIsQrVerifyOpen}
        title="Scan Machine QR to Start Work"
        description="Scan the assigned machine QR before maintenance starts. If camera access is unavailable, you can continue without QR."
        onDecoded={(value) => {
          void handleQrDecodedForVerification(value);
        }}
        secondaryActionLabel="Continue Without QR"
        onSecondaryAction={continueWithoutQrVerification}
      />

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
          {verificationMethod === "MANUAL_CONFIRMATION" ? (
            <div className="rounded-2xl border border-dashed border-amber-400/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
              QR verification was skipped for this start. Safety confirmation is still required before work begins.
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
    </PageShell>
  );
}
