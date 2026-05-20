import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { listAssets, type Asset } from "@/api/assets";
import { listDepartments, type Department } from "@/api/departments";
import {
  createSpareItem,
  deleteSpareItem,
  listSpareItems,
  updateSpareItem,
  type SpareItem,
  type SpareItemPayload,
} from "@/api/inventory";
import { listModules, type MachineModule } from "@/api/modules";
import { listPlants, type Plant } from "@/api/plants";
import { KPICard } from "@/components/dashboard/KPICard";
import { FormDialog } from "@/components/shared/FormDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField, SwitchField } from "@/components/shared/FormField";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { DetailRow, DetailSection, ViewDialog } from "@/components/shared/ViewDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

import { usePermissions } from "@/hooks/usePermissions";
import { isSuperAdmin, useAuthStore } from "@/store/auth.store";

const ALL_FILTER = "__all__";
const PLANT_SCOPE_VALUE = "__plant_scope__";

type ScopeTab = "overall" | "machine" | "critical";

type SpareFormData = {
  code: string;
  name: string;
  category: string;
  unit: string;
  currentStock: string;
  minLevel: string;
  reorderLevel: string;
  location: string;
  departmentId: string;
  moduleId: string;
  assetId: string;
  plantId: string;
  isCritical: boolean;
};

const emptyFormState = (plantId: string): SpareFormData => ({
  code: "",
  name: "",
  category: "",
  unit: "Pcs",
  currentStock: "0",
  minLevel: "0",
  reorderLevel: "0",
  location: "",
  departmentId: "",
  moduleId: "",
  assetId: PLANT_SCOPE_VALUE,
  plantId,
  isCritical: false,
});

function normalizeCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function stockVariant(item: SpareItem) {
  if (item.currentStock <= item.minLevel) return "critical" as const;
  if (item.currentStock <= item.reorderLevel) return "warning" as const;
  return "active" as const;
}

function stockLabel(item: SpareItem) {
  if (item.currentStock <= item.minLevel) return "Critical";
  if (item.currentStock <= item.reorderLevel) return "Low";
  return "Healthy";
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

export default function Inventory() {
  const queryClient = useQueryClient();
  const { user, activePlantId, activePlantName } = useAuthStore();
  const { can } = usePermissions();
  const isGlobalUser = isSuperAdmin(user);
  const canCreate = can("inventory", "create");
  const canUpdate = can("inventory", "update");
  const canDelete = can("inventory", "delete");

  const [selectedPlantId, setSelectedPlantId] = useState(activePlantId || "");
  const [selectedAssetFilter, setSelectedAssetFilter] = useState(ALL_FILTER);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState(ALL_FILTER);
  const [selectedModuleFilter, setSelectedModuleFilter] = useState(ALL_FILTER);
  const [scopeTab, setScopeTab] = useState<ScopeTab>("overall");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SpareItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<SpareItem | null>(null);
  const [formData, setFormData] = useState<SpareFormData>(emptyFormState(activePlantId || ""));

  useEffect(() => {
    if (!isGlobalUser) {
      setSelectedPlantId(activePlantId || "");
    }
  }, [activePlantId, isGlobalUser]);

  const plantsQuery = useQuery({
    queryKey: ["spare-maintenance-plants"],
    queryFn: async () => (await listPlants({ page: 1, limit: 200, includeInactive: false })).data || [],
    enabled: isGlobalUser,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isGlobalUser) return;
    if (selectedPlantId) return;
    if (plantsQuery.data && plantsQuery.data.length > 0) {
      setSelectedPlantId(plantsQuery.data[0].id);
    }
  }, [isGlobalUser, plantsQuery.data, selectedPlantId]);

  const resolvedPlantId = isGlobalUser ? selectedPlantId : activePlantId || "";

  const assetsQuery = useQuery({
    queryKey: ["spare-maintenance-assets", resolvedPlantId],
    queryFn: async () => {
      if (!resolvedPlantId) return [];
      const response = await listAssets({ page: 1, limit: 1000, plantId: resolvedPlantId, includeInactive: false });
      return response.data || [];
    },
    enabled: Boolean(resolvedPlantId),
    staleTime: 30_000,
  });

  const hierarchyQuery = useQuery({
    queryKey: ["spare-maintenance-hierarchy"],
    queryFn: async () => {
      const [departmentsResponse, modulesResponse] = await Promise.all([
        listDepartments({ page: 1, limit: 1000, includeInactive: false }),
        listModules({ page: 1, limit: 1000, includeInactive: false }),
      ]);
      return {
        departments: departmentsResponse.data || [],
        modules: modulesResponse.data || [],
      };
    },
    staleTime: 60_000,
  });

  const sparesQuery = useQuery({
    queryKey: ["spare-maintenance-items", resolvedPlantId],
    queryFn: async () => {
      if (!resolvedPlantId) return [];
      const response = await listSpareItems({ page: 1, limit: 1000, plantId: resolvedPlantId, includeInactive: false });
      return response.data || [];
    },
    enabled: Boolean(resolvedPlantId),
    staleTime: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: SpareItemPayload & { id?: string }) => {
      if (payload.id) {
        const { id, ...body } = payload;
        return (await updateSpareItem(id, body)).data;
      }
      return (await createSpareItem(payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-maintenance-items"] });
      toast.success(editingItem ? "Spare item updated" : "Spare item added");
      setIsFormOpen(false);
      setEditingItem(null);
    },
    onError: (error: unknown) => {
      const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "Failed to save spare item";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteSpareItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-maintenance-items"] });
      toast.success("Spare item deleted");
      setIsDeleteOpen(false);
      setSelectedItem(null);
    },
    onError: (error: unknown) => {
      const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "Failed to delete spare item";
      toast.error(message);
    },
  });

  const plants = useMemo(() => plantsQuery.data || [], [plantsQuery.data]);
  const departments = useMemo(() => (hierarchyQuery.data?.departments || []) as Department[], [hierarchyQuery.data?.departments]);
  const modules = useMemo(() => (hierarchyQuery.data?.modules || []) as MachineModule[], [hierarchyQuery.data?.modules]);
  const assets = useMemo(() => assetsQuery.data || [], [assetsQuery.data]);
  const spareItems = useMemo(() => sparesQuery.data || [], [sparesQuery.data]);
  const plantMap = useMemo(() => new Map(plants.map((plant) => [plant.id, plant])), [plants]);
  const departmentMap = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const moduleMap = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const departmentsForPlant = useMemo(
    () => departments.filter((department) => department.plantId === resolvedPlantId).sort((left, right) => left.name.localeCompare(right.name)),
    [departments, resolvedPlantId],
  );
  const modulesForFilter = useMemo(
    () =>
      modules
        .filter((module) => module.plantId === resolvedPlantId && (selectedDepartmentFilter === ALL_FILTER || module.departmentId === selectedDepartmentFilter))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [modules, resolvedPlantId, selectedDepartmentFilter],
  );
  const departmentsForForm = useMemo(
    () => departments.filter((department) => department.plantId === formData.plantId).sort((left, right) => left.name.localeCompare(right.name)),
    [departments, formData.plantId],
  );
  const modulesForForm = useMemo(
    () =>
      modules
        .filter((module) => module.plantId === formData.plantId && (!formData.departmentId || module.departmentId === formData.departmentId))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [formData.departmentId, formData.plantId, modules],
  );
  const machineOptionsForForm = useMemo(
    () =>
      sortByName(
        assets.filter((asset) => {
          if (asset.plantId !== formData.plantId) return false;
          if (formData.departmentId && asset.departmentId !== formData.departmentId) return false;
          if (formData.moduleId && asset.moduleId !== formData.moduleId) return false;
          return true;
        }),
      ).map((asset) => ({
        value: asset.id,
        label: `${asset.code} - ${asset.name}`,
      })),
    [assets, formData.departmentId, formData.moduleId, formData.plantId],
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return spareItems.filter((item) => {
      const asset = item.assetId ? assetMap.get(item.assetId) : null;
      const machineName = asset?.name || "";
      const machineCode = asset?.code || "";
      const departmentId = asset?.departmentId || "";
      const moduleId = asset?.moduleId || "";

      const matchesScope =
        scopeTab === "overall"
          ? true
          : scopeTab === "machine"
            ? Boolean(item.assetId)
            : Boolean(item.assetId) && item.isCritical;
      const matchesMachine = selectedAssetFilter === ALL_FILTER || item.assetId === selectedAssetFilter;
      const matchesDepartment = selectedDepartmentFilter === ALL_FILTER || departmentId === selectedDepartmentFilter;
      const matchesModule = selectedModuleFilter === ALL_FILTER || moduleId === selectedModuleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "critical" && item.currentStock <= item.minLevel) ||
        (statusFilter === "low" && item.currentStock > item.minLevel && item.currentStock <= item.reorderLevel) ||
        (statusFilter === "healthy" && item.currentStock > item.reorderLevel);
      const matchesSearch =
        !query ||
        [item.code, item.name, item.category || "", item.location || "", machineName, machineCode].join(" ").toLowerCase().includes(query);

      return matchesScope && matchesMachine && matchesDepartment && matchesModule && matchesStatus && matchesSearch;
    });
  }, [assetMap, scopeTab, searchQuery, selectedAssetFilter, selectedDepartmentFilter, selectedModuleFilter, spareItems, statusFilter]);

  const machineLinkedItems = useMemo(() => spareItems.filter((item) => Boolean(item.assetId)), [spareItems]);
  const criticalMachineItems = useMemo(() => spareItems.filter((item) => Boolean(item.assetId) && item.isCritical), [spareItems]);
  const plantLevelItems = useMemo(() => spareItems.filter((item) => !item.assetId), [spareItems]);
  const lowStockItems = useMemo(() => spareItems.filter((item) => item.currentStock <= item.reorderLevel), [spareItems]);
  const coveredMachines = useMemo(() => new Set(machineLinkedItems.map((item) => item.assetId)).size, [machineLinkedItems]);
  const scopeCards = [
    { key: "overall" as ScopeTab, title: "Overall", caption: "Plant spares", count: spareItems.length, icon: Package },
    { key: "machine" as ScopeTab, title: "Machine Wise", caption: "Mapped stock", count: machineLinkedItems.length, icon: Wrench },
    { key: "critical" as ScopeTab, title: "Critical", caption: "Priority parts", count: criticalMachineItems.length, icon: ShieldAlert },
  ];

  const machineOptions = useMemo(
    () =>
      sortByName(assets).map((asset) => ({
        value: asset.id,
        label: `${asset.code} - ${asset.name}`,
      })),
    [assets],
  );

  const selectedPlant = resolvedPlantId
    ? plantMap.get(resolvedPlantId) || ({ id: resolvedPlantId, plantName: activePlantName || "Selected Plant" } as Plant)
    : null;

  const openCreateDialog = () => {
    if (!resolvedPlantId) {
      toast.error("Select a plant first");
      return;
    }
    setEditingItem(null);
    setFormData(emptyFormState(resolvedPlantId));
    setIsFormOpen(true);
  };

  const openEditDialog = (item: SpareItem) => {
    const plantId = item.plantId || resolvedPlantId;
    const asset = item.assetId ? assetMap.get(item.assetId) : null;
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      category: item.category || "",
      unit: item.unit,
      currentStock: String(item.currentStock),
      minLevel: String(item.minLevel),
      reorderLevel: String(item.reorderLevel),
      location: item.location || "",
      departmentId: asset?.departmentId || "",
      moduleId: asset?.moduleId || "",
      assetId: item.assetId || PLANT_SCOPE_VALUE,
      plantId: plantId || "",
      isCritical: item.isCritical,
    });
    setIsFormOpen(true);
  };

  const handleView = (item: SpareItem) => {
    setSelectedItem(item);
    setIsViewOpen(true);
  };

  const handleDeleteClick = (item: SpareItem) => {
    setSelectedItem(item);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and spare name are required");
      return;
    }
    if (!formData.plantId) {
      toast.error("Plant is required");
      return;
    }
    if (formData.assetId !== PLANT_SCOPE_VALUE && (!formData.departmentId || !formData.moduleId || !formData.assetId)) {
      toast.error("Plant, department, module, and machine are required for machine-wise spare items");
      return;
    }

    const payload: SpareItemPayload & { id?: string } = {
      ...(editingItem ? { id: editingItem.id } : {}),
      code: formData.code.trim(),
      name: formData.name.trim(),
      category: formData.category.trim() || null,
      unit: formData.unit.trim() || "Pcs",
      currentStock: normalizeCount(formData.currentStock),
      minLevel: normalizeCount(formData.minLevel),
      reorderLevel: normalizeCount(formData.reorderLevel),
      location: formData.location.trim() || null,
      assetId: formData.assetId === PLANT_SCOPE_VALUE ? null : formData.assetId,
      plantId: formData.plantId,
      isCritical: formData.assetId === PLANT_SCOPE_VALUE ? false : formData.isCritical,
      isActive: true,
    };

    await saveMutation.mutateAsync(payload);
  };

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (item: SpareItem) => <span className="font-semibold text-primary">{item.code}</span>,
    },
    {
      key: "name",
      header: "Spare",
      render: (item: SpareItem) => (
        <div className="space-y-1">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.category || "Uncategorized"}</p>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Machine / Scope",
      render: (item: SpareItem) => {
        const asset = item.assetId ? assetMap.get(item.assetId) : null;
        return (
          <div className="space-y-1">
            <p className="font-medium">{asset ? asset.name : "Overall Plant Spare"}</p>
            <p className="text-xs text-muted-foreground">{asset ? asset.code : selectedPlant?.plantName || "Plant level"}</p>
          </div>
        );
      },
      hideOnMobile: true,
    },
    {
      key: "type",
      header: "Type",
      render: (item: SpareItem) => (
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={item.isCritical ? "critical" : "info"} showDot={false}>
            {item.isCritical ? "Critical" : item.assetId ? "Machine Spare" : "Plant Spare"}
          </StatusBadge>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      render: (item: SpareItem) => (
        <div className="space-y-1">
          <p className="font-semibold">
            {item.currentStock} {item.unit}
          </p>
          <p className="text-xs text-muted-foreground">
            Min {item.minLevel} / Reorder {item.reorderLevel}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: SpareItem) => <StatusBadge variant={stockVariant(item)}>{stockLabel(item)}</StatusBadge>,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: SpareItem) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleView(item)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canUpdate ? (
            <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteClick(item)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const isLoading = sparesQuery.isLoading || assetsQuery.isLoading || plantsQuery.isLoading;
  const showPlantPrompt = isGlobalUser && !resolvedPlantId && !plantsQuery.isLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-4 sm:space-y-6"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Spare Maintenance</h1>
            <p className="text-sm text-muted-foreground">Update machine-wise spares, critical spares, and plant-level spare maintenance from one page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info" showDot={false}>
              Module: INVENTORY
            </StatusBadge>
            {selectedPlant ? (
              <StatusBadge variant="active" showDot={false}>
                {selectedPlant.plantName || activePlantName || "Plant Selected"}
              </StatusBadge>
            ) : null}
          </div>
        </div>

        {canCreate ? (
          <Button onClick={openCreateDialog} className="gap-2 gradient-primary text-primary-foreground shadow-glow">
            <Plus className="h-4 w-4" />
            Add Spare
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Total Spares" value={spareItems.length} subtitle="In this plant scope" icon={Package} variant="primary" />
        <KPICard title="Critical Machine Spares" value={criticalMachineItems.length} subtitle="Flagged as critical" icon={ShieldAlert} variant="destructive" />
        <KPICard title="Machines Covered" value={coveredMachines} subtitle="Machine-wise spare lists" icon={Wrench} variant="info" />
        <KPICard title="Low / Critical Stock" value={lowStockItems.length} subtitle="Needs store attention" icon={AlertTriangle} variant="warning" />
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg font-semibold">Spare Scope</CardTitle>
                  <StatusBadge variant={canUpdate ? "active" : "inactive"} showDot={false}>
                    {canUpdate ? "Update" : "Read only"}
                  </StatusBadge>
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plant, machine, and stock filters</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {scopeCards.map((scope) => {
                const Icon = scope.icon;
                const active = scopeTab === scope.key;

                return (
                  <button
                    key={scope.key}
                    type="button"
                    onClick={() => setScopeTab(scope.key)}
                    className={cn(
                      "group rounded-2xl border px-4 py-4 text-left transition-all duration-200",
                      active
                        ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/15"
                        : "border-border/70 bg-muted/[0.18] hover:border-primary/30 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                            active
                              ? "border-primary/25 bg-primary/10 text-primary"
                              : "border-border/60 bg-background text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{scope.title}</p>
                          <p className="text-xs text-muted-foreground">{scope.caption}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-xl font-semibold leading-none", active ? "text-primary" : "text-foreground")}>{scope.count}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Items</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/[0.18] p-3 sm:p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-3">
              <SelectField
                label="Plant"
                value={resolvedPlantId || ""}
                onChange={setSelectedPlantId}
                options={plants.map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` }))}
                placeholder={isGlobalUser ? "Select plant" : activePlantName || "Active plant"}
                disabled={!isGlobalUser || plantsQuery.isLoading}
              />
                </div>
                <div className="xl:col-span-3">
              <SelectField
                label="Department"
                value={selectedDepartmentFilter}
                onChange={(value) => {
                  setSelectedDepartmentFilter(value);
                  setSelectedModuleFilter(ALL_FILTER);
                  setSelectedAssetFilter(ALL_FILTER);
                }}
                options={[{ value: ALL_FILTER, label: "All departments" }, ...departmentsForPlant.map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` }))]}
                placeholder="Filter by department"
                disabled={!resolvedPlantId}
              />
                </div>
                <div className="xl:col-span-2">
              <SelectField
                label="Module"
                value={selectedModuleFilter}
                onChange={(value) => {
                  setSelectedModuleFilter(value);
                  setSelectedAssetFilter(ALL_FILTER);
                }}
                options={[{ value: ALL_FILTER, label: "All modules" }, ...modulesForFilter.map((module) => ({ value: module.id, label: `${module.code || module.name} - ${module.name}` }))]}
                placeholder="Filter by module"
                disabled={!resolvedPlantId}
              />
                </div>
                <div className="xl:col-span-2">
              <SelectField
                label="Machine"
                value={selectedAssetFilter}
                onChange={setSelectedAssetFilter}
                options={[{ value: ALL_FILTER, label: "All machines / plant spares" }, ...machineOptions]}
                placeholder="Filter by machine"
                disabled={!resolvedPlantId}
              />
                </div>
                <div className="xl:col-span-2">
              <SelectField
                label="Stock"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All stock states" },
                  { value: "critical", label: "Critical" },
                  { value: "low", label: "Low" },
                  { value: "healthy", label: "Healthy" },
                ]}
              />
                </div>
                <div className="md:col-span-2 xl:col-span-12">
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Search</span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-10 rounded-xl border-border/70 bg-background pl-9"
                        placeholder="Search spare code, name, or machine..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0" />
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg font-semibold">Spare List ({filteredItems.length})</CardTitle>
              <p className="text-sm text-muted-foreground">
                Plant-wide spares: {plantLevelItems.length} | Machine spares: {machineLinkedItems.length} | Critical machine spares: {criticalMachineItems.length}
              </p>
            </div>
            <StatusBadge variant={canUpdate ? "active" : "inactive"} showDot={false}>
              {canUpdate ? "Update Access Enabled" : "Read Only Access"}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent>
          {showPlantPrompt ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Select a plant to load spare maintenance data.</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <ResponsiveTable
              data={filteredItems}
              columns={columns}
              keyExtractor={(item) => item.id}
              emptyMessage="No spare items match the current plant, machine, or status filters."
              mobileCard={(item) => {
                const asset = item.assetId ? assetMap.get(item.assetId) : null;
                return (
                  <MobileCard
                    onView={() => handleView(item)}
                    onEdit={canUpdate ? () => openEditDialog(item) : undefined}
                    onDelete={canDelete ? () => handleDeleteClick(item) : undefined}
                  >
                    <MobileCardHeader
                      title={item.code}
                      subtitle={item.name}
                      badge={<StatusBadge variant={stockVariant(item)}>{stockLabel(item)}</StatusBadge>}
                    />
                    <MobileCardRow label="Machine" value={asset ? asset.name : "Overall Plant Spare"} />
                    <MobileCardRow label="Type" value={item.isCritical ? "Critical" : item.assetId ? "Machine Spare" : "Plant Spare"} />
                    <MobileCardRow label="Stock" value={`${item.currentStock} ${item.unit}`} />
                  </MobileCard>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingItem ? "Edit Spare Maintenance Item" : "Add Spare Maintenance Item"}
        description="Maintain machine-wise spare records, critical spare flags, and plant-level spares."
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Update Spare" : "Add Spare"}
        isLoading={saveMutation.isPending}
        submitDisabled={editingItem ? !canUpdate : !canCreate}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Plant"
            value={formData.plantId}
            onChange={(value) => setFormData((current) => ({ ...current, plantId: value, departmentId: "", moduleId: "", assetId: PLANT_SCOPE_VALUE, isCritical: false }))}
            options={
              isGlobalUser
                ? plants.map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` }))
                : formData.plantId
                  ? [{ value: formData.plantId, label: activePlantName || "Active Plant" }]
                  : []
            }
            placeholder="Select plant"
            disabled={!isGlobalUser}
            required
          />
          <SelectField
            label="Department"
            value={formData.departmentId}
            onChange={(value) => setFormData((current) => ({ ...current, departmentId: value, moduleId: "", assetId: PLANT_SCOPE_VALUE, isCritical: false }))}
            options={departmentsForForm.map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` }))}
            placeholder="Select department"
            disabled={!formData.plantId}
          />
          <SelectField
            label="Module"
            value={formData.moduleId}
            onChange={(value) => setFormData((current) => ({ ...current, moduleId: value, assetId: PLANT_SCOPE_VALUE, isCritical: false }))}
            options={modulesForForm.map((module) => ({ value: module.id, label: `${module.code || module.name} - ${module.name}` }))}
            placeholder="Select module"
            disabled={!formData.departmentId}
          />
          <SelectField
            label="Machine Scope"
            value={formData.assetId}
            onChange={(value) => {
              if (value === PLANT_SCOPE_VALUE) {
                setFormData((current) => ({ ...current, departmentId: "", moduleId: "", assetId: value, isCritical: false }));
                return;
              }
              const asset = assetMap.get(value);
              setFormData((current) => ({
                ...current,
                departmentId: asset?.departmentId || current.departmentId,
                moduleId: asset?.moduleId || current.moduleId,
                assetId: value,
                isCritical: current.isCritical,
              }));
            }}
            options={[{ value: PLANT_SCOPE_VALUE, label: "Overall plant spare" }, ...machineOptionsForForm]}
            placeholder="Select machine or plant scope"
          />
          <InputField label="Spare Code" value={formData.code} onChange={(value) => setFormData((current) => ({ ...current, code: value }))} placeholder="SPR-001" required />
          <InputField label="Spare Name" value={formData.name} onChange={(value) => setFormData((current) => ({ ...current, name: value }))} placeholder="Compressor Bearing" required />
          <InputField label="Category" value={formData.category} onChange={(value) => setFormData((current) => ({ ...current, category: value }))} placeholder="Bearings / Belts / Electrical" />
          <InputField label="Unit" value={formData.unit} onChange={(value) => setFormData((current) => ({ ...current, unit: value }))} placeholder="Pcs" />
          <InputField label="Current Stock" type="number" value={formData.currentStock} onChange={(value) => setFormData((current) => ({ ...current, currentStock: value }))} />
          <InputField label="Minimum Level" type="number" value={formData.minLevel} onChange={(value) => setFormData((current) => ({ ...current, minLevel: value }))} />
          <InputField label="Reorder Level" type="number" value={formData.reorderLevel} onChange={(value) => setFormData((current) => ({ ...current, reorderLevel: value }))} />
          <InputField label="Store Location" value={formData.location} onChange={(value) => setFormData((current) => ({ ...current, location: value }))} placeholder="Rack A-02 / Store Room" />
        </div>

        <SwitchField
          label="Mark as Critical Spare"
          checked={formData.assetId !== PLANT_SCOPE_VALUE && formData.isCritical}
          onChange={(checked) => setFormData((current) => ({ ...current, isCritical: checked }))}
          disabled={formData.assetId === PLANT_SCOPE_VALUE}
          description={formData.assetId === PLANT_SCOPE_VALUE ? "Plant-level spares are not flagged as machine critical." : "Critical spares are highlighted in the critical maintenance view."}
        />
      </FormDialog>

      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedItem?.name || "Spare Details"}
        subtitle={selectedItem?.code}
      >
        {selectedItem ? (
          <div className="space-y-6">
            <DetailSection title="Spare Identity">
              <DetailRow label="Spare Code" value={selectedItem.code} />
              <DetailRow label="Spare Name" value={selectedItem.name} />
              <DetailRow label="Category" value={selectedItem.category || "-"} />
              <DetailRow label="Store Location" value={selectedItem.location || "-"} />
            </DetailSection>

            <DetailSection title="Machine Scope">
              <DetailRow label="Plant" value={selectedItem.plantId ? plantMap.get(selectedItem.plantId)?.plantName || activePlantName || "-" : activePlantName || "-"} />
              <DetailRow label="Machine" value={selectedItem.assetId ? assetMap.get(selectedItem.assetId)?.name || "Mapped machine" : "Overall Plant Spare"} />
              <DetailRow label="Machine Code" value={selectedItem.assetId ? assetMap.get(selectedItem.assetId)?.code || "-" : "-"} />
              <DetailRow label="Spare Type" value={selectedItem.isCritical ? "Critical Machine Spare" : selectedItem.assetId ? "Machine Spare" : "Plant Spare"} />
            </DetailSection>

            <DetailSection title="Stock Control">
              <DetailRow label="Current Stock" value={`${selectedItem.currentStock} ${selectedItem.unit}`} />
              <DetailRow label="Minimum Level" value={`${selectedItem.minLevel} ${selectedItem.unit}`} />
              <DetailRow label="Reorder Level" value={`${selectedItem.reorderLevel} ${selectedItem.unit}`} />
              <DetailRow label="Status" value={<StatusBadge variant={stockVariant(selectedItem)}>{stockLabel(selectedItem)}</StatusBadge>} />
            </DetailSection>
          </div>
        ) : null}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Spare Maintenance Item"
        itemName={selectedItem?.name}
        onConfirm={() => {
          if (!selectedItem) return;
          deleteMutation.mutate(selectedItem.id);
        }}
        isLoading={deleteMutation.isPending}
      />
    </motion.div>
  );
}
