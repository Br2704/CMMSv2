import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore, isAdmin, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Cog, Eye, QrCode, RefreshCcw, Download, Printer, ImagePlus, Image as ImageIcon, Upload, Gauge } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import HierarchyBreadcrumb from "@/components/masters/HierarchyBreadcrumb";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import {
  createAsset,
  createAssetEnergyMeterConfig,
  deleteAsset,
  getAssetBulkTemplateOptions,
  deleteAssetEnergyMeterConfig,
  listAssetEnergyMeterConfigs,
  listAssets,
  type Asset,
  type AssetBulkTemplateOptions,
  type AssetEnergyMeterConfig,
  type AssetEnergyMeterConfigPayload,
  updateAsset,
  updateAssetEnergyMeterConfig,
} from "@/api/assets";
import { getAssetAmcSummary, type AssetAmcSummary } from "@/api/amc";
import { getAssetQr, rotateAssetQr, type AssetQrData } from "@/api/qr";
import { listCostCenters, type CostCenter } from "@/api/costCenters";
import { createDepartment, listDepartments, type Department } from "@/api/departments";
import { createModule, listModules, type MachineModule } from "@/api/modules";
import { listVendors, type Vendor } from "@/api/vendors";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { FilterToolbar } from "@/components/app-shell/FilterToolbar";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { PageShell } from "@/components/layout/PageShell";
import { FormGrid } from "@/components/layout/FormGrid";
import {
  isCsvHelperRow,
  normalizeHeaderName,
  parseExcelXmlRows,
  parseCsvRows,
} from "@/lib/import-template";
import { parseFileContent, downloadXlsxTemplate } from "@/lib/xlsx-utils";

interface MachineFormState {
  code: string;
  name: string;
  type: string;
  assetType: string;
  departmentId: string;
  moduleId: string;
  costCenterId: string;
  plantId: string;
  criticality: string;
  status: string;
  make: string;
  model: string;
  serialNumber: string;
  refrigerantGasType: string;
  machineImageUrl: string;
  commissionDate: string;
  warrantyExpiry: string;
}

interface EnergyMeterDataPointFormState {
  label: string;
  register: string;
  unit: string;
  multiplier: string;
}

interface EnergyMeterFormState {
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
  dataPoints: EnergyMeterDataPointFormState[];
}

const emptyForm: MachineFormState = {
  code: "",
  name: "",
  type: "MACHINE",
  assetType: "",
  departmentId: "",
  moduleId: "",
  costCenterId: "",
  plantId: "",
  criticality: "MEDIUM",
  status: "ACTIVE",
  make: "",
  model: "",
  serialNumber: "",
  refrigerantGasType: "",
  machineImageUrl: "",
  commissionDate: "",
  warrantyExpiry: "",
};

const DEFAULT_ASSET_TEMPLATE_OPTIONS: AssetBulkTemplateOptions = {
  types: ["MACHINE", "UTILITY"],
  assetTypes: [
    "BOILER",
    "COMPRESSOR",
    "CHILLER",
    "HVAC",
    "PUMP",
    "MOTOR",
    "GENERATOR",
    "FAN",
    "CONVEYOR",
    "ROBOT",
    "CNC",
    "TRANSFORMER",
    "GEARBOX",
    "COOLING_TOWER",
  ],
  criticalities: ["HIGH", "MEDIUM", "LOW"],
  statuses: ["ACTIVE", "UNDER_MAINTENANCE", "INACTIVE"],
  defaults: {
    type: "MACHINE",
    assetType: "PUMP",
    criticality: "MEDIUM",
    status: "ACTIVE",
  },
};

function normalizeTemplateOptionValues(values: string[] | undefined, fallback: string[]) {
  if (!Array.isArray(values)) return [...fallback];
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
    .filter((value) => value.length > 0);
  if (normalized.length === 0) return [...fallback];
  return Array.from(new Set(normalized));
}

function sanitizeTemplateOptions(input: Partial<AssetBulkTemplateOptions> | null | undefined): AssetBulkTemplateOptions {
  const types = normalizeTemplateOptionValues(input?.types, DEFAULT_ASSET_TEMPLATE_OPTIONS.types);
  const assetTypes = normalizeTemplateOptionValues(input?.assetTypes, DEFAULT_ASSET_TEMPLATE_OPTIONS.assetTypes);
  const criticalities = normalizeTemplateOptionValues(input?.criticalities, DEFAULT_ASSET_TEMPLATE_OPTIONS.criticalities);
  const statuses = normalizeTemplateOptionValues(input?.statuses, DEFAULT_ASSET_TEMPLATE_OPTIONS.statuses);

  const rawTypeDefault = (input?.defaults?.type || "").trim().toUpperCase();
  const rawAssetTypeDefault = (input?.defaults?.assetType || "").trim().toUpperCase();
  const rawCriticalityDefault = (input?.defaults?.criticality || "").trim().toUpperCase();
  const rawStatusDefault = (input?.defaults?.status || "").trim().toUpperCase();

  const defaults = {
    type: types.includes(rawTypeDefault) ? rawTypeDefault : DEFAULT_ASSET_TEMPLATE_OPTIONS.defaults.type,
    assetType: assetTypes.includes(rawAssetTypeDefault) ? rawAssetTypeDefault : DEFAULT_ASSET_TEMPLATE_OPTIONS.defaults.assetType,
    criticality: criticalities.includes(rawCriticalityDefault) ? rawCriticalityDefault : DEFAULT_ASSET_TEMPLATE_OPTIONS.defaults.criticality,
    status: statuses.includes(rawStatusDefault) ? rawStatusDefault : DEFAULT_ASSET_TEMPLATE_OPTIONS.defaults.status,
  };

  if (!types.includes(defaults.type)) defaults.type = types[0];
  if (!assetTypes.includes(defaults.assetType)) defaults.assetType = assetTypes[0];
  if (!criticalities.includes(defaults.criticality)) defaults.criticality = criticalities[0];
  if (!statuses.includes(defaults.status)) defaults.status = statuses[0];

  return {
    types,
    assetTypes,
    criticalities,
    statuses,
    defaults,
  };
}

const defaultEnergyMeterForm: EnergyMeterFormState = {
  checklistName: "Energy Meter Configuration",
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
  dataPoints: [{ label: "Active Energy", register: "40001", unit: "kWh", multiplier: "" }],
};

function parseOptionalInteger(value: string): number | null | "invalid" {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^-?\d+$/.test(normalized)) return "invalid";
  return Number(normalized);
}

function parseOptionalNumber(value: string): number | null | "invalid" {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return "invalid";
  return parsed;
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function nextUniqueCode(prefix: string, source: string, existingCodes: Set<string>) {
  const cleaned = source
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const base = (cleaned || prefix).slice(0, 20);
  let candidate = base;
  let counter = 1;

  while (existingCodes.has(candidate)) {
    const suffix = String(counter);
    candidate = `${base.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`;
    counter += 1;
  }

  existingCodes.add(candidate);
  return candidate;
}

function splitCodeAndName(raw: string) {
  const trimmed = raw.trim();
  const explicitPair = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)\s*-\s*(.+)$/);
  if (explicitPair) {
    return {
      codeHint: explicitPair[1],
      name: explicitPair[2].trim(),
    };
  }

  return {
    codeHint: "",
    name: trimmed,
  };
}

function buildLookupKeys(raw: string, parsed: { codeHint: string; name: string }) {
  const keys = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeLookupValue(value);
    if (normalized) keys.add(normalized);
  };

  push(raw);
  push(parsed.codeHint);
  push(parsed.name);
  if (parsed.codeHint && parsed.name) {
    push(`${parsed.codeHint} - ${parsed.name}`);
    push(`${parsed.codeHint}-${parsed.name}`);
  }

  return Array.from(keys);
}

function buildHierarchyImportValue(rawCombined: string, rawCode: string, rawName: string) {
  const combined = rawCombined.trim();
  const code = rawCode.trim();
  const name = rawName.trim();
  const parsedCombined = combined ? splitCodeAndName(combined) : { codeHint: "", name: "" };
  const codeHint = code || parsedCombined.codeHint;
  const resolvedName = name || parsedCombined.name || combined || code;
  const raw =
    combined || (codeHint && resolvedName && codeHint !== resolvedName ? `${codeHint} - ${resolvedName}` : resolvedName || codeHint);

  return {
    raw,
    codeHint,
    name: resolvedName,
  };
}

export default function MachinesMaster() {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user) || isRootAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants, invalidateOptions } = useMastersOptions();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<MachineModule[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedPlant, setSelectedPlant] = useState<string>(canSelectPlant ? (defaultPlantId || "") : defaultPlantId);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>("all");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Asset | null>(null);
  const [formData, setFormData] = useState<MachineFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);
  const [qrData, setQrData] = useState<AssetQrData | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [assetAmcSummary, setAssetAmcSummary] = useState<AssetAmcSummary | null>(null);
  const [assetAmcLoading, setAssetAmcLoading] = useState(false);
  const [isEnergyMeterDialogOpen, setIsEnergyMeterDialogOpen] = useState(false);
  const [energyMeterSubmitting, setEnergyMeterSubmitting] = useState(false);
  const [energyMeterConfigsLoading, setEnergyMeterConfigsLoading] = useState(false);
  const [energyMeterConfigs, setEnergyMeterConfigs] = useState<AssetEnergyMeterConfig[]>([]);
  const [energyMeterForm, setEnergyMeterForm] = useState<EnergyMeterFormState>(defaultEnergyMeterForm);
  const [editingEnergyMeterConfigId, setEditingEnergyMeterConfigId] = useState<string | null>(null);
  const [energyMeterConfigToDelete, setEnergyMeterConfigToDelete] = useState<AssetEnergyMeterConfig | null>(null);
  const [energyMeterDeleteSubmitting, setEnergyMeterDeleteSubmitting] = useState(false);
  const [enableEnergyMeterOnCreate, setEnableEnergyMeterOnCreate] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkPromptHandled, setBulkPromptHandled] = useState(false);
  const bulkUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [assetTemplateOptions, setAssetTemplateOptions] = useState<AssetBulkTemplateOptions>(DEFAULT_ASSET_TEMPLATE_OPTIONS);

  const fetchAssetsList = async () => {
    setLoading(true);
    try {
      if (canSelectPlant && !selectedPlant) {
        setAssets([]);
        return;
      }

      const effectivePlantId = canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined;
      const response = await listAssets({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: effectivePlantId,
      });
      setAssets(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentsList = async (plantId?: string) => {
    try {
      const resolvedPlantId = plantId || (canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined);
      if (canSelectPlant && !resolvedPlantId) {
        setDepartments([]);
        return;
      }
      const response = await listDepartments({
        page: 1,
        limit: 1000,
        plantId: resolvedPlantId,
      });
      setDepartments(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load departments");
    }
  };

  const fetchModulesList = async (plantId?: string, departmentId?: string) => {
    try {
      const resolvedPlantId = plantId || (canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined);
      if (canSelectPlant && !resolvedPlantId) {
        setModules([]);
        return;
      }
      const response = await listModules({
        page: 1,
        limit: 1000,
        plantId: resolvedPlantId,
        departmentId: departmentId || undefined,
      });
      setModules(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load modules");
    }
  };

  const fetchCostCentersList = async (plantId?: string, departmentId?: string) => {
    try {
      const resolvedPlantId = plantId || (canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined);
      if (canSelectPlant && !resolvedPlantId) {
        setCostCenters([]);
        return;
      }
      const response = await listCostCenters({
        page: 1,
        limit: 100,
        plantId: resolvedPlantId,
      });

      const filteredByDepartment = departmentId
        ? response.data.filter((item) => item.departmentId === null || item.departmentId === departmentId)
        : response.data;

      setCostCenters(filteredByDepartment);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load cost centers");
    }
  };

  const fetchVendorsList = async () => {
    try {
      const response = await listVendors({ page: 1, limit: 1000 });
      setVendors(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load vendors");
    }
  };

  const fetchAssetTemplateOptions = useCallback(async () => {
    try {
      const response = await getAssetBulkTemplateOptions();
      const nextOptions = sanitizeTemplateOptions(response.data);
      setAssetTemplateOptions(nextOptions);
      return nextOptions;
    } catch {
      return null;
    }
  }, []);

  const refreshEnergyMeterConfigs = async (machineId: string, showErrorToast = false) => {
    setEnergyMeterConfigsLoading(true);
    try {
      const response = await listAssetEnergyMeterConfigs(machineId);
      setEnergyMeterConfigs(response.data || []);
    } catch (error: any) {
      setEnergyMeterConfigs([]);
      if (showErrorToast) {
        toast.error(error?.message || "Failed to load energy meter configuration");
      }
    } finally {
      setEnergyMeterConfigsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetsList();
  }, [searchQuery, selectedPlant, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    fetchPlants();
  }, []);

  useEffect(() => {
    void fetchAssetTemplateOptions();
    void fetchVendorsList();
  }, [fetchAssetTemplateOptions]);

  useEffect(() => {
    const scopedPlantId = canSelectPlant ? selectedPlant : defaultPlantId;
    void fetchDepartmentsList(scopedPlantId || undefined);
    void fetchModulesList(scopedPlantId || undefined);
    void fetchCostCentersList(scopedPlantId || undefined);
  }, [selectedPlant, canSelectPlant, defaultPlantId]);

  useEffect(() => {
    if (!canSelectPlant || selectedPlant || plantsOptions.length === 0) {
      return;
    }
    setSelectedPlant(plantsOptions[0].value);
  }, [canSelectPlant, selectedPlant, plantsOptions]);

  useEffect(() => {
    const assetId = searchParams.get("assetId");
    if (!assetId || assets.length === 0) return;
    const target = assets.find((item) => item.id === assetId);
    if (!target) return;
    setSelectedMachine(target);
    setIsViewOpen(true);
  }, [assets, searchParams]);

  useEffect(() => {
    if (bulkPromptHandled || !canManage) return;
    if (searchParams.get("bulk") !== "1") return;
    setBulkPromptHandled(true);
    window.requestAnimationFrame(() => {
      bulkUploadInputRef.current?.click();
    });
  }, [bulkPromptHandled, canManage, searchParams]);

  useEffect(() => {
    if (!selectedMachine || !isViewOpen) {
      setAssetAmcSummary(null);
      return;
    }
    setAssetAmcLoading(true);
    void getAssetAmcSummary(selectedMachine.id)
      .then((response) => setAssetAmcSummary(response.data))
      .catch(() => setAssetAmcSummary(null))
      .finally(() => setAssetAmcLoading(false));
  }, [selectedMachine?.id, isViewOpen]);

  useEffect(() => {
    if (!selectedMachine?.id || !isViewOpen) {
      setEnergyMeterConfigs([]);
      setEnergyMeterConfigsLoading(false);
      return;
    }

    void refreshEnergyMeterConfigs(selectedMachine.id);
  }, [selectedMachine?.id, isViewOpen]);

  const filtered = useMemo(
    () =>
      assets
        .filter((asset) => (categoryFilter === "all" ? true : asset.type === categoryFilter))
        .filter((asset) => (selectedDepartmentFilter === "all" ? true : asset.departmentId === selectedDepartmentFilter))
        .filter((asset) => (selectedModuleFilter === "all" ? true : asset.moduleId === selectedModuleFilter)),
    [assets, categoryFilter, selectedDepartmentFilter, selectedModuleFilter],
  );

  const departmentFilterOptions = useMemo(
    () =>
      departments
        .filter((department) => !selectedPlant || department.plantId === selectedPlant)
        .map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
    [departments, selectedPlant],
  );

  const moduleFilterOptions = useMemo(
    () =>
      modules
        .filter((module) => (!selectedPlant || module.plantId === selectedPlant) && (selectedDepartmentFilter === "all" || module.departmentId === selectedDepartmentFilter))
        .map((module) => ({ value: module.id, label: `${module.code ? `${module.code} - ` : ""}${module.name}` })),
    [modules, selectedPlant, selectedDepartmentFilter],
  );

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((department) => !formData.plantId || department.plantId === formData.plantId)
        .map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
    [departments, formData.plantId],
  );

  const moduleOptions = useMemo(
    () =>
      modules
        .filter((module) => (!formData.plantId || module.plantId === formData.plantId) && (!formData.departmentId || module.departmentId === formData.departmentId))
        .map((module) => ({ value: module.id, label: `${module.code ? `${module.code} - ` : ""}${module.name}` })),
    [modules, formData.plantId, formData.departmentId],
  );

  const costCenterOptions = useMemo(
    () =>
      costCenters
        .filter((costCenter) => (!formData.plantId || costCenter.plantId === formData.plantId) && (!formData.departmentId || costCenter.departmentId === null || costCenter.departmentId === formData.departmentId))
        .map((costCenter) => ({ value: costCenter.id, label: `${costCenter.code} - ${costCenter.name}` })),
    [costCenters, formData.plantId, formData.departmentId],
  );

  const getDepartmentName = (departmentId: string | null) => departments.find((item) => item.id === departmentId)?.name || "-";
  const getModuleName = (moduleId: string | null) => modules.find((item) => item.id === moduleId)?.name || "-";
  const getCostCenterName = (costCenterId: string | null) => costCenters.find((item) => item.id === costCenterId)?.name || "-";
  const getPlantName = (plantId: string | null) => plantsOptions.find((item) => item.value === plantId)?.label || "-";
  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };
  const getCapacityText = (asset: Asset) => {
    if (!asset.ratedCapacity) return "-";
    return asset.capacityUnit ? `${asset.ratedCapacity} ${asset.capacityUnit}` : asset.ratedCapacity;
  };

  const canSubmitMachineForm =
    formData.code.trim().length > 0 &&
    formData.name.trim().length > 0 &&
    formData.assetType.trim().length > 0 &&
    (canSelectPlant ? Boolean(formData.plantId && formData.departmentId && formData.moduleId) : Boolean(defaultPlantId && formData.departmentId && formData.moduleId));

  const handleBulkMachineCsv = async (content: string) => {
    const rows = parseExcelXmlRows(content, "machine_code") || parseCsvRows(content);
    if (rows.length < 2) {
      toast.error("Upload file must include a header and at least one machine row");
      return;
    }
    await processMachineRows(rows);
  };

  const processMachineRows = async (rows: string[][]) => {
    const resolvedPlantId = canSelectPlant ? selectedPlant : defaultPlantId;
    if (!resolvedPlantId) {
      toast.error("Select a specific plant before bulk uploading machines");
      return;
    }

    const headerRow = rows[0] || [];
    const headerIndex = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const normalized = normalizeHeaderName(header);
      if (normalized) {
        headerIndex.set(normalized, index);
      }
    });

    const requiredHeaders: Array<{ label: string; aliases: string[] }> = [
      { label: "machine_code", aliases: ["machine_code", "code", "machine"] },
      { label: "machine_name", aliases: ["machine_name", "name"] },
      { label: "department / department_name", aliases: ["department", "department_name"] },
      { label: "module / module_name", aliases: ["module", "module_name"] },
    ];

    const missingHeaders = requiredHeaders
      .filter((entry) => !entry.aliases.some((alias) => headerIndex.has(alias)))
      .map((entry) => entry.label);

    if (missingHeaders.length > 0) {
      toast.error(`Missing CSV columns: ${missingHeaders.join(", ")}`);
      return;
    }

    const pickCell = (row: string[], aliases: string[]) => {
      for (const alias of aliases) {
        const cellIndex = headerIndex.get(alias);
        if (cellIndex === undefined) continue;
        const value = row[cellIndex];
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
      return "";
    };

    const allowedTypes = assetTemplateOptions.types;
    const allowedAssetTypes = assetTemplateOptions.assetTypes;
    const allowedCriticalities = assetTemplateOptions.criticalities;
    const allowedStatuses = assetTemplateOptions.statuses;
    const defaultType = assetTemplateOptions.defaults.type;
    const defaultAssetType = assetTemplateOptions.defaults.assetType;
    const defaultCriticality = assetTemplateOptions.defaults.criticality;
    const defaultStatus = assetTemplateOptions.defaults.status;

    const resolveEnum = (value: string, allowed: string[], fallback: string, label: string) => {
      if (!value.trim()) return { value: fallback };
      const normalized = value.trim().toUpperCase();
      if (allowed.includes(normalized)) return { value: normalized };
      return { error: `${label} '${value}' is not allowed. Allowed values: ${allowed.join(", ")}` };
    };

    const departmentLookup = new Map<string, Department>();
    const departmentCodes = new Set<string>();
    const registerDepartmentAliases = (department: Department, extraAliases: string[] = []) => {
      const aliases = [
        normalizeLookupValue(department.name),
        normalizeLookupValue(department.code),
        normalizeLookupValue(`${department.code} - ${department.name}`),
        ...extraAliases,
      ].filter(Boolean);

      aliases.forEach((alias) => {
        departmentLookup.set(alias, department);
      });
      departmentCodes.add(department.code.toUpperCase());
    };

    departments
      .filter((department) => department.plantId === resolvedPlantId)
      .forEach((department) => {
        registerDepartmentAliases(department);
      });

    const moduleLookup = new Map<string, MachineModule>();
    const moduleCodes = new Set<string>();
    const registerModuleAliases = (module: MachineModule, departmentId: string, extraAliases: string[] = []) => {
      const prefix = `${departmentId}:`;
      const aliases = [
        normalizeLookupValue(module.name),
        normalizeLookupValue(module.code || ""),
        normalizeLookupValue(module.code ? `${module.code} - ${module.name}` : ""),
        ...extraAliases,
      ].filter(Boolean);

      aliases.forEach((alias) => {
        moduleLookup.set(`${prefix}${alias}`, module);
      });
      if (module.code) {
        moduleCodes.add(module.code.toUpperCase());
      }
    };

    modules
      .filter((module) => module.plantId === resolvedPlantId && module.departmentId)
      .forEach((module) => {
        registerModuleAliases(module, module.departmentId!);
      });

    const costCenterLookup = new Map<string, CostCenter>();
    costCenters
      .filter((costCenter) => costCenter.plantId === resolvedPlantId || costCenter.plantId === null)
      .forEach((costCenter) => {
        [costCenter.id, costCenter.code, costCenter.name, `${costCenter.code} - ${costCenter.name}`]
          .map(normalizeLookupValue)
          .filter(Boolean)
          .forEach((key) => costCenterLookup.set(key, costCenter));
      });

    const vendorLookup = new Map<string, Vendor>();
    vendors.forEach((vendor) => {
      [vendor.id, vendor.code, vendor.name, `${vendor.code} - ${vendor.name}`]
        .map(normalizeLookupValue)
        .filter(Boolean)
        .forEach((key) => vendorLookup.set(key, vendor));
    });

    const existingMachineCodes = new Set(
      assets
        .filter((asset) => asset.plantId === resolvedPlantId)
        .map((asset) => normalizeLookupValue(asset.code)),
    );
    const existingSerialNumbers = new Set(
      assets
        .filter((asset) => asset.plantId === resolvedPlantId && asset.serialNumber)
        .map((asset) => normalizeLookupValue(asset.serialNumber || "")),
    );
    const seenCodes = new Set<string>();
    const seenSerialNumbers = new Set<string>();
    const failures: string[] = [];
    let createdCount = 0;

    const importRows = rows
      .map((row, index) => ({ row, csvRowNumber: index + 1 }))
      .slice(1)
      .filter(({ row }) => !isCsvHelperRow(row));

    if (importRows.length === 0) {
      toast.error("Upload file must include at least one importable machine row");
      return;
    }

    setBulkUploading(true);
    try {
      for (const { row, csvRowNumber } of importRows) {
        if (!row || row.every((value) => value.trim().length === 0)) {
          continue;
        }

        const machineCode = pickCell(row, ["machine_code", "code", "machine"]);
        const machineName = pickCell(row, ["machine_name", "name"]);
        const departmentValue = buildHierarchyImportValue(
          pickCell(row, ["department"]),
          pickCell(row, ["department_code"]),
          pickCell(row, ["department_name"]),
        );
        const moduleValue = buildHierarchyImportValue(
          pickCell(row, ["module"]),
          pickCell(row, ["module_code"]),
          pickCell(row, ["module_name"]),
        );

        if (!machineCode || !machineName || !departmentValue.raw || !moduleValue.raw) {
          failures.push(`Row ${csvRowNumber}: machine_code, machine_name, department, and module are required`);
          continue;
        }

        const machineCodeKey = normalizeLookupValue(machineCode);
        if (seenCodes.has(machineCodeKey)) {
          failures.push(`Row ${csvRowNumber}: duplicate machine code in CSV (${machineCode})`);
          continue;
        }
        if (existingMachineCodes.has(machineCodeKey)) {
          failures.push(`Row ${csvRowNumber}: machine code already exists (${machineCode})`);
          continue;
        }
        seenCodes.add(machineCodeKey);

        const serialNumber = pickCell(row, ["serial_number", "serial"]);
        const serialNumberKey = normalizeLookupValue(serialNumber);
        if (serialNumberKey && seenSerialNumbers.has(serialNumberKey)) {
          failures.push(`Row ${csvRowNumber}: duplicate serial number in CSV (${serialNumber})`);
          continue;
        }
        if (serialNumberKey && existingSerialNumbers.has(serialNumberKey)) {
          failures.push(`Row ${csvRowNumber}: serial number already exists (${serialNumber})`);
          continue;
        }
        if (serialNumberKey) {
          seenSerialNumbers.add(serialNumberKey);
        }

        const parsedDepartment = { codeHint: departmentValue.codeHint, name: departmentValue.name };
        const departmentKeys = buildLookupKeys(departmentValue.raw, parsedDepartment);

        let department = departmentKeys.map((key) => departmentLookup.get(key)).find((value): value is Department => Boolean(value));

        try {
          if (!department) {
            const createdDepartment = await createDepartment({
              name: parsedDepartment.name || departmentValue.raw,
              code: nextUniqueCode("DEP", parsedDepartment.codeHint || parsedDepartment.name || departmentValue.raw, departmentCodes),
              plantId: resolvedPlantId,
            });
            department = createdDepartment.data;
          }
          registerDepartmentAliases(department, departmentKeys);

          const parsedModule = { codeHint: moduleValue.codeHint, name: moduleValue.name };
          const moduleKeys = buildLookupKeys(moduleValue.raw, parsedModule);
          const moduleLookupPrefix = `${department.id}:`;

          let machineModule = moduleKeys
            .map((key) => moduleLookup.get(`${moduleLookupPrefix}${key}`))
            .find((value): value is MachineModule => Boolean(value));

          if (!machineModule) {
            const createdModule = await createModule({
              code: nextUniqueCode("MOD", parsedModule.codeHint || parsedModule.name || moduleValue.raw, moduleCodes),
              name: parsedModule.name || moduleValue.raw,
              plantId: resolvedPlantId,
              departmentId: department.id,
            });
            machineModule = createdModule.data;
          }
          registerModuleAliases(machineModule, department.id, moduleKeys);

          const typeResult = resolveEnum(pickCell(row, ["type"]), allowedTypes, defaultType, "type");
          const assetTypeResult = resolveEnum(pickCell(row, ["asset_type", "assettype"]), allowedAssetTypes, defaultAssetType, "asset_type");
          const criticalityResult = resolveEnum(pickCell(row, ["criticality"]), allowedCriticalities, defaultCriticality, "criticality");
          const statusResult = resolveEnum(pickCell(row, ["status"]), allowedStatuses, defaultStatus, "status");
          const enumErrors = [typeResult, assetTypeResult, criticalityResult, statusResult]
            .map((result) => result.error)
            .filter(Boolean);
          if (enumErrors.length > 0) {
            failures.push(`Row ${csvRowNumber}: ${enumErrors.join("; ")}`);
            continue;
          }

          const costCenterValue = buildHierarchyImportValue(
            pickCell(row, ["cost_center"]),
            pickCell(row, ["cost_center_code"]),
            pickCell(row, ["cost_center_name"]),
          );
          const costCenter = costCenterValue.raw
            ? buildLookupKeys(costCenterValue.raw, { codeHint: costCenterValue.codeHint, name: costCenterValue.name })
              .map((key) => costCenterLookup.get(key))
              .find((value): value is CostCenter => Boolean(value))
            : null;
          if (costCenterValue.raw && !costCenter) {
            failures.push(`Row ${csvRowNumber}: cost_center '${costCenterValue.raw}' is not recognized`);
            continue;
          }

          const vendorValue = buildHierarchyImportValue(
            pickCell(row, ["vendor"]),
            pickCell(row, ["vendor_code"]),
            pickCell(row, ["vendor_name"]),
          );
          const vendor = vendorValue.raw
            ? buildLookupKeys(vendorValue.raw, { codeHint: vendorValue.codeHint, name: vendorValue.name })
              .map((key) => vendorLookup.get(key))
              .find((value): value is Vendor => Boolean(value))
            : null;
          if (vendorValue.raw && !vendor) {
            failures.push(`Row ${csvRowNumber}: vendor '${vendorValue.raw}' is not recognized`);
            continue;
          }

          const ratedCapacityRaw = pickCell(row, ["rated_capacity", "capacity"]);
          const ratedCapacity = parseOptionalNumber(ratedCapacityRaw);
          if (ratedCapacity === "invalid") {
            failures.push(`Row ${csvRowNumber}: rated_capacity must be a number`);
            continue;
          }

          await createAsset({
            code: machineCode,
            name: machineName,
            type: typeResult.value || defaultType,
            assetType: (assetTypeResult.value || defaultAssetType) as Asset["assetType"],
            departmentId: department.id,
            moduleId: machineModule.id,
            costCenterId: costCenter?.id || null,
            plantId: resolvedPlantId,
            criticality: criticalityResult.value || defaultCriticality,
            status: statusResult.value || defaultStatus,
            make: pickCell(row, ["make"]) || null,
            manufacturer: pickCell(row, ["manufacturer"]) || pickCell(row, ["make"]) || null,
            model: pickCell(row, ["model"]) || null,
            ratedCapacity,
            capacityUnit: pickCell(row, ["capacity_unit"]) || null,
            serialNumber: serialNumber || null,
            refrigerantGasType: pickCell(row, ["refrigerant_gas_type", "refrigerant"]) || null,
            machineImageUrl: pickCell(row, ["machine_image_url", "image_url"]) || null,
            location: pickCell(row, ["location"]) || null,
            vendorId: vendor?.id || null,
            commissionDate: pickCell(row, ["commission_date"]) || null,
            warrantyExpiry: pickCell(row, ["warranty_expiry"]) || null,
          });
          existingMachineCodes.add(machineCodeKey);
          if (serialNumberKey) existingSerialNumbers.add(serialNumberKey);
          createdCount += 1;
        } catch (error: any) {
          failures.push(`Row ${csvRowNumber}: ${error?.message || "failed to create machine"}`);
        }
      }

      await Promise.all([
        fetchAssetsList(),
        fetchDepartmentsList(resolvedPlantId),
        fetchModulesList(resolvedPlantId),
      ]);
      invalidateOptions(["assets", "departments", "modules"]);

      if (createdCount > 0) {
        toast.success(`Created ${createdCount} machine${createdCount === 1 ? "" : "s"}`);
      }

      if (failures.length > 0) {
        const preview = failures.slice(0, 3).join(" | ");
        const suffix = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
        toast.error(`Machine bulk upload completed with ${failures.length} issue(s): ${preview}${suffix}`);
      }
    } finally {
      setBulkUploading(false);
    }
  };

  const handleBulkMachineFileChange = async (file: File | null) => {
    if (!file) return;
    try {
      const rows = await parseFileContent(file);
      await processMachineRows(rows);
    } catch (error: any) {
      toast.error(error?.message || "Failed to read spreadsheet file");
    }
  };

  const handleShowMachineImportInstructions = () => {
    toast.info("Machine import: download the blank or demo Excel file, fill Machine Upload, keep headers unchanged, use dropdown/reference values, then upload the saved .xls or CSV file.");
  };

  const handleDownloadMachineTemplate = async () => {
    const latestTemplateOptions = (await fetchAssetTemplateOptions()) || assetTemplateOptions;
    const defaultType = latestTemplateOptions.defaults.type || "EQUIPMENT";
    const defaultAssetType = latestTemplateOptions.defaults.assetType || "MACHINERY";
    const defaultCriticality = latestTemplateOptions.defaults.criticality || "MEDIUM";
    const defaultStatus = latestTemplateOptions.defaults.status || "ACTIVE";

    downloadXlsxTemplate("machine_bulk_upload_demo.xlsx", [
      { key: "machine_code", label: "Machine Code", required: true },
      { key: "machine_name", label: "Machine Name", required: true },
      { key: "department_code", label: "Department Code", required: true },
      { key: "department_name", label: "Department Name", required: true },
      { key: "module_code", label: "Module Code", required: true },
      { key: "module_name", label: "Module Name", required: true },
      { key: "type", label: "Machine Type" },
      { key: "asset_type", label: "Asset Category" },
      { key: "criticality", label: "Criticality" },
      { key: "status", label: "Status" },
      { key: "make", label: "Make" },
      { key: "serial_number", label: "Serial Number" },
      { key: "rated_capacity", label: "Capacity" },
      { key: "capacity_unit", label: "Capacity Unit" },
      { key: "location", label: "Location" },
    ], [[
      "MCH-001", "Air Compressor 01",
      "DEP-UTILITY", "Utility",
      "MOD-AIR", "Air System",
      defaultType, defaultAssetType, defaultCriticality, defaultStatus,
      "Atlas Copco", "SN-001", "125", "CFM", "Compressor Room",
    ]], "Machine Upload");
    toast.success("Machine demo workbook downloaded (.xlsx)");
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }
    try {
      const imageDataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({ ...prev, machineImageUrl: imageDataUrl }));
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload image");
    }
  };

  const generateQrImage = async (payload: string) => {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
  };

  const handleOpenQr = async (asset: Asset) => {
    setQrLoading(true);
    try {
      const response = await getAssetQr(asset.id);
      setQrData(response.data);
      setQrImageDataUrl(await generateQrImage(response.data.qrPayload));
      setIsQrOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load QR code");
    } finally {
      setQrLoading(false);
    }
  };

  const handleRotateQr = async () => {
    if (!selectedMachine) return;
    setQrLoading(true);
    try {
      const response = await rotateAssetQr(selectedMachine.id);
      setQrData(response.data);
      setQrImageDataUrl(await generateQrImage(response.data.qrPayload));
      toast.success("QR token rotated successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to rotate QR token");
    } finally {
      setQrLoading(false);
    }
  };

  const triggerQrDownload = (imageDataUrl: string, machineCode: string) => {
    const anchor = document.createElement("a");
    anchor.href = imageDataUrl;
    anchor.download = `${machineCode}-qr.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const downloadQrImage = () => {
    if (!qrImageDataUrl || !selectedMachine) return;
    triggerQrDownload(qrImageDataUrl, selectedMachine.code);
  };

  const handleDownloadQrForMachine = async () => {
    if (!selectedMachine) return;
    setQrLoading(true);
    try {
      const response = await getAssetQr(selectedMachine.id);
      const imageDataUrl = await generateQrImage(response.data.qrPayload);
      setQrData(response.data);
      setQrImageDataUrl(imageDataUrl);
      triggerQrDownload(imageDataUrl, selectedMachine.code);
    } catch (error: any) {
      toast.error(error?.message || "Failed to download QR");
    } finally {
      setQrLoading(false);
    }
  };

  const printQrLabel = () => {
    if (!qrImageDataUrl || !selectedMachine || !qrData) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Label - ${selectedMachine.code}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            .label { width: 280px; border: 1px solid #d4d4d8; padding: 12px; border-radius: 8px; }
            .title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
            .meta { font-size: 12px; color: #52525b; margin-bottom: 8px; }
            img { width: 220px; height: 220px; }
            .token { margin-top: 8px; font-size: 11px; color: #71717a; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="title">${selectedMachine.code} - ${selectedMachine.name}</div>
            <div class="meta">QR label for quick asset lookup</div>
            <img src="${qrImageDataUrl}" alt="Asset QR" />
            <div class="token">Machine ID: ${selectedMachine.id}</div>
            <div class="token">Machine Name: ${selectedMachine.name}</div>
            <div class="token">URL: ${qrData.publicResolverUrl}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? selectedPlant : defaultPlantId });
    setSelectedMachine(null);
    setIsEditing(false);
    setEnableEnergyMeterOnCreate(false);
    setEnergyMeterForm(defaultEnergyMeterForm);
    setIsFormOpen(true);
  };

  const handleEdit = async (asset: Asset) => {
    if (asset.plantId) {
      await Promise.all([
        fetchDepartmentsList(asset.plantId),
        fetchModulesList(asset.plantId, asset.departmentId || undefined),
        fetchCostCentersList(asset.plantId, asset.departmentId || undefined),
      ]);
    }
    setFormData({
      code: asset.code,
      name: asset.name,
      type: asset.type,
      assetType: asset.assetType || "PUMP",
      departmentId: asset.departmentId || "",
      moduleId: asset.moduleId || "",
      costCenterId: asset.costCenterId || "",
      plantId: asset.plantId || "",
      criticality: asset.criticality,
      status: asset.status,
      make: asset.make || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      refrigerantGasType: asset.refrigerantGasType || "",
      machineImageUrl: asset.machineImageUrl || "",
      commissionDate: asset.commissionDate || "",
      warrantyExpiry: asset.warrantyExpiry || "",
    });
    setSelectedMachine(asset);
    setIsEditing(true);
    setEnableEnergyMeterOnCreate(false);
    setIsFormOpen(true);
  };

  const handlePlantChange = async (plantId: string) => {
    setFormData((prev) => ({ ...prev, plantId, departmentId: "", moduleId: "", costCenterId: "" }));
    await Promise.all([fetchDepartmentsList(plantId), fetchModulesList(plantId), fetchCostCentersList(plantId)]);
  };

  const handleDepartmentChange = async (departmentId: string) => {
    const plantId = formData.plantId || (canSelectPlant ? undefined : defaultPlantId);
    setFormData((prev) => ({ ...prev, departmentId, moduleId: "", costCenterId: "" }));
    await Promise.all([fetchModulesList(plantId, departmentId), fetchCostCentersList(plantId, departmentId)]);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and name are required");
      return;
    }

    const resolvedPlantId = canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId || !formData.departmentId || !formData.moduleId) {
      toast.error("Plant, department and module are required");
      return;
    }
    if (!formData.assetType) {
      toast.error("Asset type is required");
      return;
    }

    const createEnergyMeterConfig = !isEditing && enableEnergyMeterOnCreate;
    const energyMeterPayload = createEnergyMeterConfig ? buildEnergyMeterConfigPayload() : null;
    if (createEnergyMeterConfig && !energyMeterPayload) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        type: formData.type,
        assetType: formData.assetType as "BOILER" | "COMPRESSOR" | "CHILLER" | "HVAC" | "PUMP" | "MOTOR" | "GENERATOR" | "FAN" | "CONVEYOR" | "ROBOT" | "CNC" | "TRANSFORMER" | "GEARBOX" | "COOLING_TOWER",
        departmentId: formData.departmentId,
        moduleId: formData.moduleId,
        costCenterId: formData.costCenterId || null,
        plantId: resolvedPlantId,
        criticality: formData.criticality,
        status: formData.status,
        make: formData.make.trim() || null,
        model: formData.model.trim() || null,
        serialNumber: formData.serialNumber.trim() || null,
        refrigerantGasType: formData.refrigerantGasType.trim() || null,
        machineImageUrl: formData.machineImageUrl || null,
        commissionDate: formData.commissionDate || null,
        warrantyExpiry: formData.warrantyExpiry || null,
      };

      if (isEditing && selectedMachine) {
        await updateAsset(selectedMachine.id, payload);
        toast.success("Machine updated");
      } else {
        const createdAsset = await createAsset(payload);
        if (createEnergyMeterConfig && energyMeterPayload) {
          try {
            await createAssetEnergyMeterConfig(createdAsset.data.id, energyMeterPayload);
            toast.success("Machine and energy meter configuration saved");
          } catch (error: any) {
            toast.error(error?.message || "Machine created, but failed to save energy meter configuration");
          }
        } else {
          toast.success("Machine created");
        }
      }
      if (canSelectPlant && selectedPlant !== resolvedPlantId) {
        setSelectedPlant(resolvedPlantId);
        setSelectedDepartmentFilter("all");
        setSelectedModuleFilter("all");
      } else {
        await fetchAssetsList();
      }

      invalidateOptions(["assets", "modules"]);
      setIsFormOpen(false);
      setEnableEnergyMeterOnCreate(false);
      setEnergyMeterForm(defaultEnergyMeterForm);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save machine");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedMachine) return;
    setSaving(true);
    const previous = assets;
    setAssets((curr) => curr.filter((row) => row.id !== selectedMachine.id));
    try {
      await deleteAsset(selectedMachine.id);
      toast.success("Machine deleted");
      invalidateOptions("assets");
      setIsDeleteOpen(false);
      await fetchAssetsList();
    } catch (error: any) {
      setAssets(previous);
      toast.error(error?.message || "Failed to delete machine");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMachineImage = async () => {
    if (!selectedMachine || !canManage) return;
    setSaving(true);
    try {
      await updateAsset(selectedMachine.id, { machineImageUrl: null });
      setSelectedMachine({ ...selectedMachine, machineImageUrl: null });
      setAssets((rows) =>
        rows.map((row) => (row.id === selectedMachine.id ? { ...row, machineImageUrl: null } : row)),
      );
      toast.success("Machine image removed");
      invalidateOptions("assets");
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove machine image");
    } finally {
      setSaving(false);
    }
  };

  const openEnergyMeterChecklist = async (machine: Asset) => {
    setSelectedMachine(machine);
    setEditingEnergyMeterConfigId(null);
    setEnergyMeterConfigToDelete(null);
    setEnergyMeterForm({
      ...defaultEnergyMeterForm,
      meterName: `${machine.code} Energy Meter`,
    });
    setIsEnergyMeterDialogOpen(true);
    await refreshEnergyMeterConfigs(machine.id, true);
  };

  const resetEnergyMeterForm = () => {
    setEditingEnergyMeterConfigId(null);
    setEnergyMeterForm(
      selectedMachine
        ? {
          ...defaultEnergyMeterForm,
          meterName: `${selectedMachine.code} Energy Meter`,
        }
        : defaultEnergyMeterForm,
    );
  };

  const updateEnergyMeterForm = <K extends keyof EnergyMeterFormState>(key: K, value: EnergyMeterFormState[K]) => {
    setEnergyMeterForm((current) => ({ ...current, [key]: value }));
  };

  const addEnergyDataPoint = () => {
    setEnergyMeterForm((current) => ({
      ...current,
      dataPoints: [...current.dataPoints, { label: "", register: "", unit: "", multiplier: "" }],
    }));
  };

  const updateEnergyDataPoint = (index: number, key: keyof EnergyMeterDataPointFormState, value: string) => {
    setEnergyMeterForm((current) => ({
      ...current,
      dataPoints: current.dataPoints.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point,
      ),
    }));
  };

  const removeEnergyDataPoint = (index: number) => {
    setEnergyMeterForm((current) => {
      if (current.dataPoints.length <= 1) {
        return current;
      }
      return {
        ...current,
        dataPoints: current.dataPoints.filter((_, pointIndex) => pointIndex !== index),
      };
    });
  };

  const buildEnergyMeterConfigPayload = (): AssetEnergyMeterConfigPayload | null => {
    const checklistName = energyMeterForm.checklistName.trim() || defaultEnergyMeterForm.checklistName;
    const meterName = energyMeterForm.meterName.trim();
    const ipAddress = energyMeterForm.ipAddress.trim();
    const modbusRegister = energyMeterForm.modbusRegister.trim();
    const bridgeEndpoint = energyMeterForm.bridgeEndpoint.trim();
    const notes = energyMeterForm.notes.trim();
    const normalizedDataPoints: Array<{ label: string; register: string; unit: string | null; multiplier: number | null }> = [];

    for (let index = 0; index < energyMeterForm.dataPoints.length; index += 1) {
      const point = energyMeterForm.dataPoints[index];
      const register = point.register.trim();
      if (!register) {
        continue;
      }

      const multiplier = parseOptionalNumber(point.multiplier);
      if (multiplier === "invalid") {
        toast.error(`Data point ${index + 1}: multiplier must be a valid number`);
        return null;
      }

      normalizedDataPoints.push({
        label: point.label.trim() || `Point ${index + 1}`,
        register,
        unit: point.unit.trim() || null,
        multiplier,
      });
    }

    if (!meterName) {
      toast.error("Meter name is required");
      return null;
    }

    if (normalizedDataPoints.length === 0) {
      toast.error("At least one data point register is required");
      return null;
    }

    if (energyMeterForm.connectionType === "MODBUS_TCP" && !ipAddress) {
      toast.error("IP address is required for Modbus TCP");
      return null;
    }

    const port = Number(energyMeterForm.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error("Port must be between 1 and 65535");
      return null;
    }

    const pollIntervalSeconds = Number(energyMeterForm.pollIntervalSeconds);
    if (!Number.isInteger(pollIntervalSeconds) || pollIntervalSeconds < 5 || pollIntervalSeconds > 86400) {
      toast.error("Poll interval must be between 5 and 86400 seconds");
      return null;
    }

    const modbusSlaveId = parseOptionalInteger(energyMeterForm.modbusSlaveId);
    if (modbusSlaveId === "invalid") {
      toast.error("Slave ID must be a whole number");
      return null;
    }
    if (modbusSlaveId !== null && (modbusSlaveId < 1 || modbusSlaveId > 247)) {
      toast.error("Slave ID must be between 1 and 247");
      return null;
    }
    if (energyMeterForm.connectionType === "MODBUS_RTU_RS485" && modbusSlaveId === null) {
      toast.error("Slave ID is required for Modbus RTU RS485");
      return null;
    }

    const baudRate = parseOptionalInteger(energyMeterForm.baudRate);
    if (baudRate === "invalid") {
      toast.error("Baud rate must be a whole number");
      return null;
    }
    if (baudRate !== null && (baudRate < 300 || baudRate > 115200)) {
      toast.error("Baud rate must be between 300 and 115200");
      return null;
    }

    const stopBits = parseOptionalInteger(energyMeterForm.stopBits);
    if (stopBits === "invalid") {
      toast.error("Stop bits must be a whole number");
      return null;
    }
    if (stopBits !== null && (stopBits < 1 || stopBits > 2)) {
      toast.error("Stop bits must be either 1 or 2");
      return null;
    }

    return {
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
      dataPoints: normalizedDataPoints,
      isActive: true,
    };
  };

  const editEnergyMeterConfig = (config: AssetEnergyMeterConfig) => {
    setEditingEnergyMeterConfigId(config.id);
    setEnergyMeterForm({
      checklistName: config.checklistName || defaultEnergyMeterForm.checklistName,
      meterName: config.meterName || "",
      connectionType: config.connectionType,
      ipAddress: config.ipAddress || "",
      port: String(config.port ?? 502),
      modbusSlaveId: config.modbusSlaveId !== null && config.modbusSlaveId !== undefined ? String(config.modbusSlaveId) : "",
      modbusRegister: config.modbusRegister || "",
      baudRate: config.baudRate !== null && config.baudRate !== undefined ? String(config.baudRate) : defaultEnergyMeterForm.baudRate,
      parity: config.parity || "NONE",
      stopBits: config.stopBits !== null && config.stopBits !== undefined ? String(config.stopBits) : defaultEnergyMeterForm.stopBits,
      pollIntervalSeconds: String(config.pollIntervalSeconds ?? 60),
      driverType: config.driverType,
      bridgeEndpoint: config.bridgeEndpoint || "",
      notes: config.notes || "",
      dataPoints:
        config.dataPoints && config.dataPoints.length > 0
          ? config.dataPoints.map((point) => ({
            label: point.label || "",
            register: point.register || "",
            unit: point.unit || "",
            multiplier: point.multiplier !== null && point.multiplier !== undefined ? String(point.multiplier) : "",
          }))
          : [{ label: "", register: "", unit: "", multiplier: "" }],
    });
  };

  const handleDeleteEnergyMeterConfig = async (config: AssetEnergyMeterConfig) => {
    if (!selectedMachine?.id || !config?.id) return;

    setEnergyMeterDeleteSubmitting(true);
    try {
      await deleteAssetEnergyMeterConfig(selectedMachine.id, config.id);

      await refreshEnergyMeterConfigs(selectedMachine.id, true);
      if (editingEnergyMeterConfigId === config.id) {
        resetEnergyMeterForm();
      }
      setEnergyMeterConfigToDelete(null);
      toast.success("Energy meter configuration deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete energy meter configuration");
    } finally {
      setEnergyMeterDeleteSubmitting(false);
    }
  };

  const handleSubmitEnergyMeterChecklist = async () => {
    if (!selectedMachine?.id) {
      toast.error("Select a machine before saving energy meter configuration");
      return;
    }

    const configPayload = buildEnergyMeterConfigPayload();
    if (!configPayload) {
      return;
    }

    setEnergyMeterSubmitting(true);
    try {
      if (editingEnergyMeterConfigId) {
        await updateAssetEnergyMeterConfig(selectedMachine.id, editingEnergyMeterConfigId, configPayload);
      } else {
        await createAssetEnergyMeterConfig(selectedMachine.id, configPayload);
      }

      await refreshEnergyMeterConfigs(selectedMachine.id, true);
      resetEnergyMeterForm();
      toast.success(editingEnergyMeterConfigId ? "Energy meter configuration updated" : "Energy meter configuration saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save energy meter configuration");
    } finally {
      setEnergyMeterSubmitting(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: Asset) => <span className="font-semibold text-primary">{item.code}</span> },
    { key: "name", header: "Name", render: (item: Asset) => <span className="font-medium">{item.name}</span> },
    {
      key: "plant",
      header: "Plant",
      render: (item: Asset) => getPlantName(item.plantId),
      hideOnMobile: true,
    },
    {
      key: "department",
      header: "Department",
      render: (item: Asset) => getDepartmentName(item.departmentId),
      hideOnMobile: true,
    },
    {
      key: "module",
      header: "Module",
      render: (item: Asset) => getModuleName(item.moduleId),
      hideOnMobile: true,
    },
    {
      key: "assetType",
      header: "Asset Type",
      render: (item: Asset) => item.assetType || "-",
      hideOnMobile: true,
    },
    {
      key: "criticality",
      header: "Criticality",
      render: (item: Asset) => (
        <StatusBadge variant={item.criticality === "HIGH" ? "critical" : item.criticality === "MEDIUM" ? "warning" : "default"}>
          {item.criticality}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: Asset) => (
        <StatusBadge variant={item.status === "ACTIVE" ? "active" : item.status === "UNDER_MAINTENANCE" ? "in_progress" : "inactive"}>
          {item.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Asset) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedMachine(item);
              setIsViewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedMachine(item);
              void handleOpenQr(item);
            }}
            disabled={qrLoading}
          >
            <QrCode className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => {
                setSelectedMachine(item);
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="Machines & Equipment"
        description="Manage machines under Plant -> Department -> Module -> Machine hierarchy"
        actions={
          canManage ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <input
                ref={bulkUploadInputRef}
                type="file"
                accept=".csv,text/csv,.xls,application/vnd.ms-excel,text/xml"
                className="hidden"
                aria-label="Bulk upload machine Excel or CSV"
                title="Bulk upload machine Excel or CSV"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleBulkMachineFileChange(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => bulkUploadInputRef.current?.click()}
                disabled={bulkUploading}
              >
                <Upload className="h-4 w-4" />
                {bulkUploading ? "Uploading..." : "Bulk Upload Machines"}
              </Button>
              <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => void handleDownloadMachineTemplate()}>
                <Download className="h-4 w-4" />
                Demo File
              </Button>
              <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={handleShowMachineImportInstructions}>
                View Instructions
              </Button>
              <Button onClick={handleAdd} className="w-full gap-2 gradient-primary text-primary-foreground shadow-glow sm:w-auto">
                <Plus className="h-4 w-4" />
                Add Machine
              </Button>
            </div>
          ) : undefined
        }
      />
      <Card className="shadow-card">
        <CardContent className="py-4">
          <HierarchyBreadcrumb currentLevel="machine" />
        </CardContent>
      </Card>
      <FilterToolbar
        left={
          <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Cog className="h-5 w-5 text-primary" />
            Equipment ({filtered.length})
          </CardTitle>
        }
        right={
          <>
            {canSelectPlant && (
              <SelectField
                label=""
                value={selectedPlant}
                onChange={(value) => {
                  setSelectedPlant(value);
                  setSelectedDepartmentFilter("all");
                  setSelectedModuleFilter("all");
                }}
                options={plantsOptions}
                placeholder="Select plant"
                className="w-full sm:w-[180px] min-w-[160px] flex-shrink-0"
              />
            )}
            <SelectField
              label=""
              value={selectedDepartmentFilter}
              onChange={(value) => {
                setSelectedDepartmentFilter(value);
                setSelectedModuleFilter("all");
              }}
              options={[{ value: "all", label: "All Departments" }, ...departmentFilterOptions]}
              className="w-full sm:w-[220px] min-w-[180px] flex-shrink-0"
            />
            <SelectField
              label=""
              value={selectedModuleFilter}
              onChange={setSelectedModuleFilter}
              options={[{ value: "all", label: "All Modules" }, ...moduleFilterOptions]}
              className="w-full sm:w-[220px] min-w-[180px] flex-shrink-0"
            />
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
            </div>
            <SelectField
              label=""
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All" },
                { value: "MACHINE", label: "Machine" },
                { value: "UTILITY", label: "Utility" },
              ]}
              className="w-full sm:w-[160px] min-w-[140px] flex-shrink-0"
            />
          </>
        }
      />
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold">Machine List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (<TableSkeleton />) : canSelectPlant && !selectedPlant ? (<EmptyState title="Select a plant" description="Choose a plant to view machine data." />) : filtered.length === 0 ? (<EmptyState title="No machines found" description="Add your first machine record to start work orders and logs." actionLabel={canManage ? "Add Machine" : undefined} onAction={canManage ? handleAdd : undefined} />) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(item: Asset) => item.id}
              mobileCard={(item: Asset) => (
                <MobileCard
                  onView={() => {
                    setSelectedMachine(item);
                    setIsViewOpen(true);
                  }}
                  onEdit={canManage ? () => handleEdit(item) : undefined}
                  onDelete={
                    canManage
                      ? () => {
                        setSelectedMachine(item);
                        setIsDeleteOpen(true);
                      }
                      : undefined
                  }
                >
                  <MobileCardHeader
                    title={item.code}
                    subtitle={item.name}
                    badge={<StatusBadge variant={item.status === "ACTIVE" ? "active" : "inactive"}>{item.status}</StatusBadge>}
                  />
                  <MobileCardRow label="Department" value={getDepartmentName(item.departmentId)} />
                  <MobileCardRow label="Module" value={getModuleName(item.moduleId)} />
                  <MobileCardRow label="Asset Type" value={item.assetType || "-"} />
                  <MobileCardRow label="Criticality" value={item.criticality} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open && !saving) {
            setEnableEnergyMeterOnCreate(false);
            setEnergyMeterForm(defaultEnergyMeterForm);
          }
        }}
        title={isEditing ? "Edit Machine" : "Add New Machine"}
        description="Manage machine/equipment"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add"}
        isLoading={saving}
        submitDisabled={!canSubmitMachineForm}
        size="lg"
      >
        <FormGrid>
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="MCH-001" required />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="CNC Lathe" required />
          <SelectField label="Type" value={formData.type} onChange={(value) => setFormData({ ...formData, type: value })} options={[{ value: "MACHINE", label: "Machine" }, { value: "UTILITY", label: "Utility" }]} />
          <SelectField
            label="Asset Type"
            required
            value={formData.assetType}
            onChange={(value) => setFormData({ ...formData, assetType: value })}
            options={[
              { value: "BOILER", label: "Boiler" },
              { value: "COMPRESSOR", label: "Compressor" },
              { value: "CHILLER", label: "Chiller" },
              { value: "HVAC", label: "HVAC" },
              { value: "PUMP", label: "Pump" },
              { value: "MOTOR", label: "Motor" },
              { value: "GENERATOR", label: "Generator" },
              { value: "FAN", label: "Fan" },
              { value: "CONVEYOR", label: "Conveyor" },
              { value: "ROBOT", label: "Robot" },
              { value: "CNC", label: "CNC" },
              { value: "TRANSFORMER", label: "Transformer" },
              { value: "GEARBOX", label: "Gearbox" },
              { value: "COOLING_TOWER", label: "Cooling Tower" },
            ]}
            placeholder="Select asset type"
          />
          <SelectField label="Criticality" value={formData.criticality} onChange={(value) => setFormData({ ...formData, criticality: value })} options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
          {canSelectPlant ? (
            <SelectField label="Plant" required value={formData.plantId} onChange={handlePlantChange} options={plantsOptions} placeholder="Select plant" />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <SelectField
            label="Department"
            required
            value={formData.departmentId}
            onChange={handleDepartmentChange}
            options={departmentOptions}
            placeholder="Select department"
            disabled={canSelectPlant ? !formData.plantId : false}
            hint={
              canSelectPlant && !formData.plantId
                ? "Select plant first."
                : departmentOptions.length === 0
                  ? "No departments for selected plant."
                  : undefined
            }
          />
          <SelectField
            label="Module"
            required
            value={formData.moduleId}
            onChange={(value) => setFormData({ ...formData, moduleId: value })}
            options={moduleOptions}
            placeholder="Select module"
            disabled={!formData.departmentId}
            hint={!formData.departmentId ? "Select department first." : moduleOptions.length === 0 ? "No modules for selected department." : undefined}
          />
          <SelectField
            label="Cost Center"
            value={formData.costCenterId}
            onChange={(value) => setFormData({ ...formData, costCenterId: value })}
            options={costCenterOptions}
            placeholder="Select cost center"
            disabled={!formData.departmentId}
            hint={!formData.departmentId ? "Select department first." : costCenterOptions.length === 0 ? "No cost centers for selected scope." : undefined}
          />
          {!isEditing ? (
            <div className="col-span-1 sm:col-span-2 space-y-3 rounded-md border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="machine-enable-energy-meter"
                  checked={enableEnergyMeterOnCreate}
                  onCheckedChange={(checked) => {
                    const nextEnabled = Boolean(checked);
                    setEnableEnergyMeterOnCreate(nextEnabled);
                    if (nextEnabled) {
                      setEnergyMeterForm((current) => ({
                        ...current,
                        meterName: current.meterName.trim().length > 0
                          ? current.meterName
                          : `${formData.code.trim() || "Machine"} Energy Meter`,
                      }));
                    }
                  }}
                />
                <div className="space-y-1">
                  <label htmlFor="machine-enable-energy-meter" className="text-sm font-medium text-foreground">
                    Enable Energy Meter Configuration
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Turn this on to save machine and energy meter data together in one step.
                  </p>
                </div>
              </div>

              {enableEnergyMeterOnCreate ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <InputField
                      label="Configuration Name"
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

                  <div className="space-y-3 rounded-md border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Device Data Points</p>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addEnergyDataPoint}>
                        <Plus className="h-3.5 w-3.5" />
                        Add Data Point
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Map Modbus registers that should be collected for this machine meter.</p>
                    <div className="space-y-3">
                      {energyMeterForm.dataPoints.map((point, index) => (
                        <div key={`create-data-point-${index}`} className="grid gap-3 rounded-md border border-border/50 bg-background/80 p-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto]">
                          <InputField
                            label={`Label ${index + 1}`}
                            value={point.label}
                            onChange={(value) => updateEnergyDataPoint(index, "label", value)}
                            placeholder="Active Energy"
                          />
                          <InputField
                            label="Register"
                            value={point.register}
                            onChange={(value) => updateEnergyDataPoint(index, "register", value)}
                            placeholder="40001"
                            required
                          />
                          <InputField
                            label="Unit"
                            value={point.unit}
                            onChange={(value) => updateEnergyDataPoint(index, "unit", value)}
                            placeholder="kWh"
                          />
                          <InputField
                            label="Multiplier"
                            value={point.multiplier}
                            onChange={(value) => updateEnergyDataPoint(index, "multiplier", value)}
                            placeholder="0.1"
                          />
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-destructive"
                              onClick={() => removeEnergyDataPoint(index)}
                              disabled={energyMeterForm.dataPoints.length <= 1}
                              aria-label={`Remove create data point ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

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
                </div>
              ) : null}
            </div>
          ) : null}
          <SelectField label="Status" value={formData.status} onChange={(value) => setFormData({ ...formData, status: value })} options={[{ value: "ACTIVE", label: "Active" }, { value: "UNDER_MAINTENANCE", label: "Under Maintenance" }, { value: "INACTIVE", label: "Inactive" }]} />
          <InputField label="Make" value={formData.make} onChange={(value) => setFormData({ ...formData, make: value })} />
          <InputField label="Model" value={formData.model} onChange={(value) => setFormData({ ...formData, model: value })} />
          <InputField label="Serial Number" value={formData.serialNumber} onChange={(value) => setFormData({ ...formData, serialNumber: value })} />
          <InputField
            label="Refrigerant Gas Type"
            value={formData.refrigerantGasType}
            onChange={(value) => setFormData({ ...formData, refrigerantGasType: value })}
            placeholder="R134a / R410A / Ammonia"
          />
          <div className="col-span-1 sm:col-span-2 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-primary" />
              Machine Image
            </label>
            <Input
              type="file"
              accept="image/*"
              onChange={(event) => void handleImageUpload(event.target.files?.[0] || null)}
            />
            {formData.machineImageUrl ? (
              <div className="rounded-md border border-border/60 p-2 w-fit">
                <img src={formData.machineImageUrl} alt="Machine preview" className="h-20 w-20 object-cover rounded" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload JPG/PNG/WebP image (max 5MB)</p>
            )}
            {formData.machineImageUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormData({ ...formData, machineImageUrl: "" })}>
                Remove Image
              </Button>
            ) : null}
          </div>
          <InputField label="Commission Date" value={formData.commissionDate} onChange={(value) => setFormData({ ...formData, commissionDate: value })} type="date" />
          <InputField label="Warranty Expiry" value={formData.warrantyExpiry} onChange={(value) => setFormData({ ...formData, warrantyExpiry: value })} type="date" />
        </FormGrid>
      </FormDialog>
      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedMachine?.name || ""}
        subtitle={selectedMachine?.code}
        contentClassName="sm:max-w-3xl max-h-[80vh] overflow-y-auto"
      >
        {selectedMachine && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{selectedMachine.code}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {getPlantName(selectedMachine.plantId)} {"->"} {getDepartmentName(selectedMachine.departmentId)} {"->"} {getModuleName(selectedMachine.moduleId)}
                </p>
              </div>
              <StatusBadge variant={selectedMachine.status === "ACTIVE" ? "active" : selectedMachine.status === "UNDER_MAINTENANCE" ? "in_progress" : "inactive"}>
                {selectedMachine.status.replace(/_/g, " ")}
              </StatusBadge>
            </div>

            <div className="space-y-3">
              <div className="w-full flex justify-center">
                <div className="w-full max-w-[360px] h-[220px] sm:h-[240px] border border-border/60 rounded-xl bg-muted/30 flex items-center justify-center overflow-hidden shadow-sm">
                  {selectedMachine.machineImageUrl ? (
                    <img
                      src={selectedMachine.machineImageUrl}
                      alt={selectedMachine.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="h-10 w-10 mb-2" />
                      <p className="text-sm">No Image Available</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedMachine.machineImageUrl && canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void handleRemoveMachineImage()}
                  disabled={saving}
                >
                  {saving ? "Removing..." : "Remove Image"}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: "Plant", value: getPlantName(selectedMachine.plantId) },
                { label: "Department", value: getDepartmentName(selectedMachine.departmentId) },
                { label: "Module", value: getModuleName(selectedMachine.moduleId) },
                { label: "Machine Name", value: selectedMachine.name },
                { label: "Machine Code", value: selectedMachine.code },
                { label: "Machine Type", value: `${selectedMachine.type} / ${selectedMachine.assetType || "-"}` },
                { label: "Manufacturer", value: selectedMachine.manufacturer || selectedMachine.make || "-" },
                { label: "Model", value: selectedMachine.model || "-" },
                { label: "Capacity", value: getCapacityText(selectedMachine) },
                { label: "Commissioning Date", value: selectedMachine.commissionDate || "-" },
                { label: "Location", value: selectedMachine.location || "-" },
                { label: "Criticality", value: selectedMachine.criticality },
                { label: "AMC Contract", value: assetAmcSummary?.covered ? assetAmcSummary.contract?.contractName || assetAmcSummary.contract?.contractNumber || "-" : "Not Covered" },
                { label: "QR Code ID", value: selectedMachine.qrCodeId || "-" },
                { label: "Created At", value: formatTimestamp(selectedMachine.createdAt) },
                { label: "Updated At", value: formatTimestamp(selectedMachine.updatedAt) },
                { label: "Cost Center", value: getCostCenterName(selectedMachine.costCenterId) },
                { label: "Serial Number", value: selectedMachine.serialNumber || "-" },
                { label: "Refrigerant Gas Type", value: selectedMachine.refrigerantGasType || "-" },
                { label: "Warranty Expiry", value: selectedMachine.warrantyExpiry || "-" },
              ].map((field) => (
                <div key={field.label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                  <p className="mt-1 break-words text-sm font-medium text-foreground">{field.value || "-"}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AMC Summary</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {assetAmcLoading ? "Loading AMC details..." : assetAmcSummary?.covered ? "Asset is covered under AMC" : "No active AMC coverage"}
                  </p>
                </div>
                {assetAmcSummary?.covered ? <StatusBadge variant="active">{assetAmcSummary.contract?.status || "ACTIVE"}</StatusBadge> : null}
              </div>
              {assetAmcSummary?.covered ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contract</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.contract?.contractName || assetAmcSummary.contract?.contractNumber}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Visit</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.nextVisit?.visitDate || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending Breakdowns</p>
                    <p className="mt-1 text-sm font-medium">{assetAmcSummary.pendingBreakdowns}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Energy Meter Configuration</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {energyMeterConfigsLoading
                      ? "Loading configuration..."
                      : energyMeterConfigs.length > 0
                        ? `${energyMeterConfigs.length} configuration${energyMeterConfigs.length === 1 ? "" : "s"} saved`
                        : "No configuration saved yet"}
                  </p>
                </div>
                {canManage ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => { void openEnergyMeterChecklist(selectedMachine); }}>
                    <Gauge className="h-4 w-4" />
                    Configure
                  </Button>
                ) : null}
              </div>
              {energyMeterConfigs.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {energyMeterConfigs.slice(0, 3).map((config) => (
                    <div key={config.id} className="rounded-lg border border-border/60 bg-background/80 p-3">
                      <p className="text-sm font-medium text-foreground">{config.meterName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {config.connectionType === "MODBUS_TCP"
                          ? `TCP ${config.ipAddress || "-"}:${config.port}`
                          : `RS485 Slave ${config.modbusSlaveId || "-"}`} | Data points: {config.dataPoints?.length || 0}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                Close
              </Button>
              {canManage ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsViewOpen(false);
                    void handleEdit(selectedMachine);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              <Button className="gap-2" onClick={() => void handleDownloadQrForMachine()} disabled={qrLoading}>
                <Download className="h-4 w-4" />
                Download QR
              </Button>
            </div>
          </div>
        )}
      </ViewDialog>

      <FormDialog
        open={isEnergyMeterDialogOpen}
        onOpenChange={(open) => {
          setIsEnergyMeterDialogOpen(open);
          if (!open && !energyMeterSubmitting) {
            setEnergyMeterConfigToDelete(null);
            resetEnergyMeterForm();
          }
        }}
        title={`Energy Meter Configuration${selectedMachine ? ` - ${selectedMachine.code}` : ""}`}
        description="Configure Modbus TCP or RS485 communication and map multiple data points from a single meter device."
        onSubmit={() => {
          void handleSubmitEnergyMeterChecklist();
        }}
        submitLabel={editingEnergyMeterConfigId ? "Update Configuration" : "Save Configuration"}
        isLoading={energyMeterSubmitting}
        size="lg"
      >
        {editingEnergyMeterConfigId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs">
            <p className="font-medium text-foreground">Editing existing configuration</p>
            <Button type="button" variant="outline" size="sm" onClick={resetEnergyMeterForm}>
              Cancel Edit
            </Button>
          </div>
        ) : null}

        {energyMeterConfigs.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Existing Configurations</p>
            {energyMeterConfigs.map((config) => (
              <div key={config.id} className="rounded-md border border-border/60 bg-background/80 p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{config.meterName}</p>
                    <p className="mt-1 text-muted-foreground">
                      {config.connectionType === "MODBUS_TCP"
                        ? `TCP ${config.ipAddress || "-"}:${config.port}`
                        : `RS485 Slave ${config.modbusSlaveId || "-"}`} | Driver {config.driverType} | Points {config.dataPoints?.length || 0}
                    </p>
                    {editingEnergyMeterConfigId === config.id ? (
                      <p className="mt-1 text-[11px] font-medium text-primary">Currently editing this configuration</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => editEnergyMeterConfig(config)}
                      aria-label={`Edit configuration ${config.meterName}`}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setEnergyMeterConfigToDelete(config)}
                      aria-label={`Delete configuration ${config.meterName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="Configuration Name"
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

        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Device Data Points</p>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addEnergyDataPoint}>
              <Plus className="h-3.5 w-3.5" />
              Add Data Point
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Map multiple Modbus registers from a single RS485/TCP meter device.</p>
          <div className="space-y-3">
            {energyMeterForm.dataPoints.map((point, index) => (
              <div key={`data-point-${index}`} className="grid gap-3 rounded-md border border-border/50 bg-muted/20 p-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto]">
                <InputField
                  label={`Label ${index + 1}`}
                  value={point.label}
                  onChange={(value) => updateEnergyDataPoint(index, "label", value)}
                  placeholder="Active Energy"
                />
                <InputField
                  label="Register"
                  value={point.register}
                  onChange={(value) => updateEnergyDataPoint(index, "register", value)}
                  placeholder="40001"
                  required
                />
                <InputField
                  label="Unit"
                  value={point.unit}
                  onChange={(value) => updateEnergyDataPoint(index, "unit", value)}
                  placeholder="kWh"
                />
                <InputField
                  label="Multiplier"
                  value={point.multiplier}
                  onChange={(value) => updateEnergyDataPoint(index, "multiplier", value)}
                  placeholder="0.1"
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    onClick={() => removeEnergyDataPoint(index)}
                    disabled={energyMeterForm.dataPoints.length <= 1}
                    aria-label={`Remove data point ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

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

      <ViewDialog open={isQrOpen} onOpenChange={setIsQrOpen} title="Asset QR Code" subtitle={selectedMachine?.code}>
        <div className="space-y-4">
          {qrImageDataUrl ? (
            <div className="flex justify-center">
              <img src={qrImageDataUrl} alt="Asset QR code" className="h-64 w-64 rounded-md border border-border bg-white p-2" />
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground">QR image is being generated...</div>
          )}
          {qrData ? (
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Resolver URL:</span> {qrData.publicResolverUrl}</p>
              <p className="mt-1"><span className="font-medium text-foreground">Token:</span> {qrData.qrToken}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" className="gap-2" onClick={handleRotateQr} disabled={qrLoading || !selectedMachine}>
              <RefreshCcw className="h-4 w-4" />
              Rotate
            </Button>
            <Button variant="secondary" className="gap-2" onClick={downloadQrImage} disabled={!qrImageDataUrl}>
              <Download className="h-4 w-4" />
              Download QR
            </Button>
            <Button className="gap-2" onClick={printQrLabel} disabled={!qrImageDataUrl}>
              <Printer className="h-4 w-4" />
              Print Label
            </Button>
          </div>
        </div>
      </ViewDialog>

      <DeleteConfirmDialog
        open={Boolean(energyMeterConfigToDelete)}
        onOpenChange={(open) => {
          if (!open && !energyMeterDeleteSubmitting) {
            setEnergyMeterConfigToDelete(null);
          }
        }}
        title="Delete Energy Meter Configuration"
        itemName={energyMeterConfigToDelete?.meterName}
        onConfirm={() => {
          if (!energyMeterConfigToDelete) return;
          void handleDeleteEnergyMeterConfig(energyMeterConfigToDelete);
        }}
        isLoading={energyMeterDeleteSubmitting}
      />

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Machine" itemName={selectedMachine?.name} onConfirm={confirmDelete} isLoading={saving} />
    </PageShell>
  );
}
