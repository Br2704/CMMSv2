import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppSwitch } from "@/components/ui/app-switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { AsyncSelect } from "@/components/ui/async-select";
import { listPlants } from "@/api/plants";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { DetailRow, DetailSection, ViewDialog } from "@/components/shared/ViewDialog";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import BackButton from "@/components/masters/BackButton";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/input";
import {
  createAmcContract,
  listAmcContracts,
  notifyAmcVendor,
  updateAmcContract,
  type AmcContract,
  type AmcContractPayload,
  type AmcMachineGroup,
  type AmcNotificationSettings,
} from "@/api/amc";
import { listAssets, type Asset } from "@/api/assets";
import { listUsers, type UserProfile } from "@/api/users";
import { listVendors, type Vendor } from "@/api/vendors";
import { ChevronDown, Eye, Layers3, Loader2, Mail, Plus, Search, Send, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { isAdminLevel, isSuperAdmin } from "@/lib/permission-engine";
import { useMastersOptions } from "@/hooks/useMastersOptions";

const CONTRACT_TYPE_OPTIONS = [
  { value: "COMPREHENSIVE", label: "Comprehensive" },
  { value: "NON_COMPREHENSIVE", label: "Non Comprehensive" },
  { value: "LABOUR", label: "Labour Only" },
  { value: "VISIT_BASED", label: "Visit Based" },
];

const VISIT_FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half Yearly" },
  { value: "YEARLY", label: "Yearly" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "RENEWAL_DUE", label: "Renewal Due" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
];

const GROUP_TYPE_OPTIONS = [
  { value: "MODULE", label: "Module Group" },
  { value: "CUSTOM", label: "Custom Machine Group" },
];

const DEFAULT_NOTIFICATION_SETTINGS: AmcNotificationSettings = {
  notifyEmail: true,
  notifyInApp: true,
  notifyOnVisitScheduled: true,
  notifyOnBreakdown: true,
  notifyOnRenewal: true,
  notifyOnServiceReportSubmitted: true,
  notifyOnServiceReportVerified: true,
  escalationEmails: [],
  notifyBeforeDays: [30, 15, 7, 0],
};

interface MachineGroupDraft {
  name: string;
  groupType: "MODULE" | "CUSTOM";
  moduleIds: string[];
  assetIds: string[];
  description: string;
}

interface ContractFormState {
  contractName: string;
  contractNumber: string;
  vendorId: string;
  plantId: string;
  contractType: string;
  startDate: string;
  endDate: string;
  visitFrequency: string;
  responseTimeSla: string;
  resolutionTimeSla: string;
  contractValue: string;
  status: string;
  manualMachineIds: string[];
  machineGroups: AmcMachineGroup[];
  vendorUserIds: string[];
  notificationSettings: AmcNotificationSettings;
  terms: string;
}

const emptyGroupDraft: MachineGroupDraft = {
  name: "",
  groupType: "MODULE",
  moduleIds: [],
  assetIds: [],
  description: "",
};

const emptyForm: ContractFormState = {
  contractName: "",
  contractNumber: "",
  vendorId: "",
  plantId: "",
  contractType: "COMPREHENSIVE",
  startDate: "",
  endDate: "",
  visitFrequency: "MONTHLY",
  responseTimeSla: "",
  resolutionTimeSla: "",
  contractValue: "",
  status: "ACTIVE",
  manualMachineIds: [],
  machineGroups: [],
  vendorUserIds: [],
  notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  terms: "",
};

function dedupeIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createClientGroupId() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `group-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function MultiSelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  options: { value: string; label: string }[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const selectedLabels = options.filter((option) => value.includes(option.value)).map((option) => option.label);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 w-full justify-between font-normal">
            <span className="truncate text-left">{selectedLabels.length > 0 ? `${selectedLabels.length} selected` : placeholder}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[360px] space-y-2 p-2">
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])
                    }
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selectedLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedLabels.slice(0, 8).map((item) => (
            <Badge key={item} variant="secondary" className="text-xs">
              {item}
            </Badge>
          ))}
          {selectedLabels.length > 8 ? <Badge variant="outline">+{selectedLabels.length - 8}</Badge> : null}
        </div>
      ) : null}
    </div>
  );
}

function getStatusVariant(status: string) {
  switch (status) {
    case "ACTIVE":
      return "active" as const;
    case "RENEWAL_DUE":
      return "warning" as const;
    case "ON_HOLD":
      return "in_progress" as const;
    case "EXPIRED":
    case "CANCELLED":
      return "inactive" as const;
    default:
      return "default" as const;
  }
}

export default function AMCConfigMaster() {
  const { user } = useAuthStore();
  const canManage = isAdminLevel(user?.roles ?? []);
  const canSelectPlant = isSuperAdmin(user?.roles ?? []);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, modulesOptions, fetchPlants, fetchModules } = useMastersOptions();

  const [contracts, setContracts] = useState<AmcContract[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<AmcContract | null>(null);
  const [editingContract, setEditingContract] = useState<AmcContract | null>(null);
  const [formData, setFormData] = useState<ContractFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [groupDraft, setGroupDraft] = useState<MachineGroupDraft>({ ...emptyGroupDraft });

  const refreshSelectedContract = useCallback(
    async (contractId?: string | null) => {
      if (!contractId) return;
      const latestContracts = await loadData();
      const latest = latestContracts.find((contract) => contract.id === contractId) || null;
      if (latest) {
        setSelectedContract(latest);
      }
    },
    [loadData],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const plantId = canSelectPlant ? undefined : defaultPlantId || undefined;
      const [contractsResponse, assetsResponse, vendorsResponse, usersResponse] = await Promise.all([
        listAmcContracts({ page: 1, limit: 200, plantId }),
        listAssets({ page: 1, limit: 500, plantId }),
        listVendors({ page: 1, limit: 200 }),
        listUsers({ page: 1, limit: 300, plantId }),
      ]);
      setContracts(contractsResponse.data);
      setAssets(assetsResponse.data);
      setVendors(vendorsResponse.data);
      setUsers(usersResponse.data);
      return contractsResponse.data;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load AMC master data"));
    } finally {
      setLoading(false);
    }
    return [] as AmcContract[];
  }, [canSelectPlant, defaultPlantId]);

  useEffect(() => {
    void fetchPlants();
    void loadData();
  }, [fetchPlants, loadData]);

  useEffect(() => {
    if (!isViewOpen || !selectedContract?.id) return;
    void refreshSelectedContract(selectedContract.id);
  }, [isViewOpen, refreshSelectedContract, selectedContract?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !isViewOpen || !selectedContract?.id) return;

    const handleFocus = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSelectedContract(selectedContract.id);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [isViewOpen, refreshSelectedContract, selectedContract?.id]);

  useEffect(() => {
    const scopedPlantId = formData.plantId || (canSelectPlant ? undefined : defaultPlantId || undefined);
    void fetchModules(scopedPlantId || undefined);
  }, [canSelectPlant, defaultPlantId, fetchModules, formData.plantId]);

  const plantLabel = (plantId: string | null) =>
    plantsOptions.find((item) => item.value === plantId)?.label || "-";

  const filteredAssets = useMemo(
    () => assets.filter((asset) => !formData.plantId || asset.plantId === formData.plantId),
    [assets, formData.plantId],
  );

  const machineOptions = useMemo(
    () => filteredAssets.map((asset) => ({ value: asset.id, label: `${asset.code} - ${asset.name}` })),
    [filteredAssets],
  );

  const vendorOptions = vendors.map((vendor) => ({ value: vendor.id, label: `${vendor.code} - ${vendor.name}` }));

  const vendorUserOptions = useMemo(
    () =>
      users
        .filter((row) => row.isActive)
        .filter((row) => {
          if (!row.roles || row.roles.length === 0) {
            return true;
          }
          return row.roles.some((role) => role.toUpperCase() === "VENDOR");
        })
        .map((row) => ({
          value: row.userId,
          label: `${row.fullName} (${row.email})`,
        })),
    [users],
  );

  const moduleLabelById = useMemo(
    () => new Map(modulesOptions.map((item) => [item.value, item.label])),
    [modulesOptions],
  );

  const groupedMachineIds = useMemo(
    () =>
      dedupeIds(
        formData.machineGroups.flatMap((group) => {
          const moduleMachineIds = filteredAssets
            .filter((asset) => asset.moduleId && group.moduleIds.includes(asset.moduleId))
            .map((asset) => asset.id);
          return [...group.assetIds, ...moduleMachineIds];
        }),
      ),
    [filteredAssets, formData.machineGroups],
  );

  const resolvedMachineIds = useMemo(
    () => dedupeIds([...formData.manualMachineIds, ...groupedMachineIds]),
    [formData.manualMachineIds, groupedMachineIds],
  );

  const resolvedMachines = useMemo(
    () => filteredAssets.filter((asset) => resolvedMachineIds.includes(asset.id)),
    [filteredAssets, resolvedMachineIds],
  );

  const filteredContracts = contracts.filter((contract) => {
    const text = `${contract.contractName} ${contract.contractNumber} ${contract.vendor?.name ?? ""}`.toLowerCase();
    const searchMatch = !search || text.includes(search.toLowerCase());
    const statusMatch = statusFilter === "all" || contract.status === statusFilter;
    return searchMatch && statusMatch;
  });

  const stats = useMemo(
    () => ({
      total: contracts.length,
      active: contracts.filter((item) => item.status === "ACTIVE").length,
      groupedContracts: contracts.filter((item) => item.machineGroups.length > 0).length,
      emailAutomation: contracts.filter((item) => item.notificationSettings.notifyEmail).length,
    }),
    [contracts],
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

  const resetForm = () => {
    setEditingContract(null);
    setGroupDraft({ ...emptyGroupDraft });
    setFormData({
      ...emptyForm,
      plantId: canSelectPlant ? "" : defaultPlantId,
      notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
    });
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (contract: AmcContract) => {
    const groupedIds = dedupeIds(
      contract.machineGroups.flatMap((group) => {
        const moduleMachineIds = assets
          .filter((asset) => asset.moduleId && group.moduleIds.includes(asset.moduleId))
          .map((asset) => asset.id);
        return [...group.assetIds, ...moduleMachineIds];
      }),
    );

    setEditingContract(contract);
    setGroupDraft({ ...emptyGroupDraft });
    setFormData({
      contractName: contract.contractName,
      contractNumber: contract.contractNumber,
      vendorId: contract.vendorId,
      plantId: contract.plantId || "",
      contractType: contract.contractType || "COMPREHENSIVE",
      startDate: contract.startDate,
      endDate: contract.endDate,
      visitFrequency: contract.visitFrequency || "MONTHLY",
      responseTimeSla: contract.responseTimeSla == null ? "" : String(contract.responseTimeSla),
      resolutionTimeSla: contract.resolutionTimeSla == null ? "" : String(contract.resolutionTimeSla),
      contractValue: contract.contractValue == null ? "" : String(contract.contractValue),
      status: contract.status,
      manualMachineIds: contract.machineIds.filter((machineId) => !groupedIds.includes(machineId)),
      machineGroups: contract.machineGroups,
      vendorUserIds: contract.vendorUserIds,
      notificationSettings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...contract.notificationSettings,
        escalationEmails: contract.notificationSettings.escalationEmails || [],
        notifyBeforeDays: contract.notificationSettings.notifyBeforeDays?.length
          ? contract.notificationSettings.notifyBeforeDays
          : DEFAULT_NOTIFICATION_SETTINGS.notifyBeforeDays,
      },
      terms: contract.terms || "",
    });
    setIsFormOpen(true);
  };

  const handleAddGroup = () => {
    const hasScope = groupDraft.assetIds.length > 0 || groupDraft.moduleIds.length > 0;
    if (!groupDraft.name.trim() || !hasScope) {
      toast.error("Group name and at least one module or machine are required");
      return;
    }

    const nextGroup: AmcMachineGroup = {
      id: createClientGroupId(),
      name: groupDraft.name.trim(),
      groupType: groupDraft.groupType,
      moduleIds: dedupeIds(groupDraft.moduleIds),
      assetIds: dedupeIds(groupDraft.assetIds),
      description: groupDraft.description.trim() || null,
    };

    setFormData((current) => ({
      ...current,
      machineGroups: [...current.machineGroups, nextGroup],
    }));
    setGroupDraft({ ...emptyGroupDraft });
  };

  const handleRemoveGroup = (groupId: string) => {
    setFormData((current) => ({
      ...current,
      machineGroups: current.machineGroups.filter((group) => group.id !== groupId),
    }));
  };

  const handleSubmit = async () => {
    if (!canManage) return;
    if (!formData.contractName.trim() || !formData.vendorId || !formData.contractType || !formData.startDate || !formData.endDate || resolvedMachineIds.length === 0) {
      toast.error("Please fill all required AMC contract fields");
      return;
    }

    const notifyBeforeDays = dedupeIds(
      formData.notificationSettings.notifyBeforeDays
        .map((value) => String(value).trim())
        .filter(Boolean),
    )
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((a, b) => b - a);

    const payload: AmcContractPayload = {
      contractName: formData.contractName.trim(),
      contractNumber: formData.contractNumber.trim() || undefined,
      vendorId: formData.vendorId,
      plantId: (canSelectPlant ? formData.plantId : defaultPlantId) || null,
      contractType: formData.contractType,
      startDate: formData.startDate,
      endDate: formData.endDate,
      visitFrequency: formData.visitFrequency,
      responseTimeSla: formData.responseTimeSla ? Number(formData.responseTimeSla) : null,
      resolutionTimeSla: formData.resolutionTimeSla ? Number(formData.resolutionTimeSla) : null,
      contractValue: formData.contractValue ? Number(formData.contractValue) : null,
      status: formData.status,
      machineIds: resolvedMachineIds,
      machineGroups: formData.machineGroups,
      vendorUserIds: formData.vendorUserIds,
      notificationSettings: {
        ...formData.notificationSettings,
        escalationEmails: formData.notificationSettings.escalationEmails.filter(Boolean),
        notifyBeforeDays: notifyBeforeDays.length > 0 ? notifyBeforeDays : [...DEFAULT_NOTIFICATION_SETTINGS.notifyBeforeDays],
      },
      terms: formData.terms.trim() || null,
    };

    setSaving(true);
    try {
      if (editingContract) {
        await updateAmcContract(editingContract.id, payload);
        toast.success("AMC contract updated");
      } else {
        await createAmcContract(payload);
        toast.success("AMC contract created");
      }
      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save AMC contract"));
    } finally {
      setSaving(false);
    }
  };

  const handleRunAlerts = async () => {
    setSaving(true);
    try {
      const response = await notifyAmcVendor({});
      toast.success(response.message || "AMC renewal alerts processed");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to run AMC alerts"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "contract",
      header: "Contract",
      render: (contract: AmcContract) => (
        <div>
          <p className="font-semibold text-primary">{contract.contractName}</p>
          <p className="text-xs text-muted-foreground">{contract.contractNumber}</p>
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (contract: AmcContract) => contract.vendor?.name || "-",
    },
    {
      key: "plant",
      header: "Plant",
      render: (contract: AmcContract) => contract.plant?.plantName || plantLabel(contract.plantId),
      hideOnMobile: true,
    },
    {
      key: "scope",
      header: "Scope",
      render: (contract: AmcContract) => `${contract.machines.length} machines / ${contract.machineGroups.length} groups`,
      hideOnMobile: true,
    },
    {
      key: "automation",
      header: "Automation",
      render: (contract: AmcContract) => (
        <div className="flex flex-wrap gap-1">
          {contract.notificationSettings.notifyEmail ? <Badge variant="secondary">Email</Badge> : null}
          {contract.notificationSettings.notifyInApp ? <Badge variant="outline">In-App</Badge> : null}
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Status",
      render: (contract: AmcContract) => <StatusBadge variant={getStatusVariant(contract.status)}>{contract.status.replace(/_/g, " ")}</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (contract: AmcContract) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedContract(contract); setIsViewOpen(true); void refreshSelectedContract(contract.id); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage ? (
            <Button variant="ghost" size="sm" onClick={() => openEdit(contract)}>
              Edit
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="AMC Master"
        description="Configure AMC contracts, grouped machine coverage, vendor portal access, and contract-level alerts"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="gap-2" onClick={handleRunAlerts} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Run Renewal Alerts
            </Button>
            {canManage ? (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New Contract
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Contracts</p><p className="mt-2 text-2xl font-semibold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active</p><p className="mt-2 text-2xl font-semibold">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Grouped Scope</p><p className="mt-2 text-2xl font-semibold">{stats.groupedContracts}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Email Automation</p><p className="mt-2 text-2xl font-semibold">{stats.emailAutomation}</p></CardContent></Card>
      </div>

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            AMC Contracts ({filteredContracts.length})
          </span>
        }
        toolbar={
          <Toolbar
            left={
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="amc-config-search" name="amcConfigSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contract, vendor, code..." className="pl-9" />
              </div>
            }
            right={
              <SelectField
                label=""
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: "all", label: "All Status" }, ...STATUS_OPTIONS]}
                className="w-full sm:w-[180px]"
              />
            }
          />
        }
      >
          {loading ? (
            <TableSkeleton />
          ) : (
            <ResponsiveTable
              data={filteredContracts}
              columns={columns}
              keyExtractor={(contract: AmcContract) => contract.id}
              mobileCard={(contract: AmcContract) => (
                <MobileCard onView={() => { setSelectedContract(contract); setIsViewOpen(true); void refreshSelectedContract(contract.id); }} onEdit={canManage ? () => openEdit(contract) : undefined}>
                  <MobileCardHeader
                    title={contract.contractName}
                    subtitle={contract.vendor?.name || "-"}
                    badge={<StatusBadge variant={getStatusVariant(contract.status)}>{contract.status.replace(/_/g, " ")}</StatusBadge>}
                  />
                  <MobileCardRow label="Plant" value={contract.plant?.plantName || plantLabel(contract.plantId)} />
                  <MobileCardRow label="Scope" value={`${contract.machines.length} machines / ${contract.machineGroups.length} groups`} />
                  <MobileCardRow label="Alerts" value={contract.notificationSettings.notifyEmail ? "Email + workflow" : "Workflow only"} />
                </MobileCard>
              )}
            />
          )}
      </DataTableShell>

      <FormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            resetForm();
          }
        }}
        title={editingContract ? "Edit AMC Contract" : "Create AMC Contract"}
        description="Manage plant-wise contract scope, grouped vendor coverage, SLA, and advanced notification policies"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : editingContract ? "Update" : "Create"}
        isLoading={saving}
        size="xl"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label="Contract Name *" value={formData.contractName} onChange={(value) => setFormData((current) => ({ ...current, contractName: value }))} required />
          <InputField label="Contract Code" value={formData.contractNumber} onChange={(value) => setFormData((current) => ({ ...current, contractNumber: value }))} placeholder="AMC-2026-001" />
          {canSelectPlant ? (
            <AsyncSelect
              label="Plant *"
              value={formData.plantId}
              onChange={(value) => {
                setFormData((current) => ({ ...current, plantId: value, manualMachineIds: [], machineGroups: [] }));
                setGroupDraft({ ...emptyGroupDraft });
              }}
              fetchFn={listPlants}
              labelExtractor={(plant) => plant.plantCode ? `${plant.plantCode} - ${plant.plantName}` : plant.plantName}
              valueExtractor={(plant) => plant.id}
              placeholder="Select plant"
            />
          ) : (
            <InputField label="Plant" value={plantLabel(defaultPlantId)} onChange={() => {}} disabled />
          )}
          <AsyncSelect
            label="Vendor *"
            value={formData.vendorId}
            onChange={(value) => setFormData((current) => ({ ...current, vendorId: value }))}
            fetchFn={listVendors}
            labelExtractor={(vendor) => `${vendor.code} - ${vendor.name}`}
            valueExtractor={(vendor) => vendor.id}
            placeholder="Select vendor"
            required
          />
          <SelectField label="Contract Type *" value={formData.contractType} onChange={(value) => setFormData((current) => ({ ...current, contractType: value }))} options={CONTRACT_TYPE_OPTIONS} required />
          <SelectField label="Visit Frequency *" value={formData.visitFrequency} onChange={(value) => setFormData((current) => ({ ...current, visitFrequency: value }))} options={VISIT_FREQUENCY_OPTIONS} required />
          <InputField label="Start Date *" type="date" value={formData.startDate} onChange={(value) => setFormData((current) => ({ ...current, startDate: value }))} required />
          <InputField label="End Date *" type="date" value={formData.endDate} onChange={(value) => setFormData((current) => ({ ...current, endDate: value }))} required />
          <InputField label="Response SLA (hrs)" type="number" value={formData.responseTimeSla} onChange={(value) => setFormData((current) => ({ ...current, responseTimeSla: value }))} />
          <InputField label="Resolution SLA (hrs)" type="number" value={formData.resolutionTimeSla} onChange={(value) => setFormData((current) => ({ ...current, resolutionTimeSla: value }))} />
          <InputField label="Contract Value" type="number" value={formData.contractValue} onChange={(value) => setFormData((current) => ({ ...current, contractValue: value }))} />
          <SelectField label="Status" value={formData.status} onChange={(value) => setFormData((current) => ({ ...current, status: value }))} options={STATUS_OPTIONS} />
          <div className="sm:col-span-2">
            <MultiSelectField
              label="Direct Machine Assignment"
              value={formData.manualMachineIds}
              onChange={(value) => setFormData((current) => ({ ...current, manualMachineIds: value }))}
              options={machineOptions}
              placeholder="Select individual machines"
            />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Vendor Machine Groups</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Build reusable AMC coverage groups by module or custom machine bundles for the selected vendor.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InputField label="Group Name" value={groupDraft.name} onChange={(value) => setGroupDraft((current) => ({ ...current, name: value }))} placeholder="Boiler House Bundle" />
              <SelectField label="Group Type" value={groupDraft.groupType} onChange={(value) => setGroupDraft((current) => ({ ...current, groupType: value as "MODULE" | "CUSTOM" }))} options={GROUP_TYPE_OPTIONS} />
              <div className="sm:col-span-2">
                <MultiSelectField
                  label="Modules"
                  value={groupDraft.moduleIds}
                  onChange={(value) => setGroupDraft((current) => ({ ...current, moduleIds: value }))}
                  options={modulesOptions}
                  placeholder="Select modules"
                />
              </div>
              <div className="sm:col-span-2">
                <MultiSelectField
                  label="Machines"
                  value={groupDraft.assetIds}
                  onChange={(value) => setGroupDraft((current) => ({ ...current, assetIds: value }))}
                  options={machineOptions}
                  placeholder="Select machines for this group"
                />
              </div>
              <TextareaField label="Group Notes" value={groupDraft.description} onChange={(value) => setGroupDraft((current) => ({ ...current, description: value }))} className="sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" className="gap-2" onClick={handleAddGroup}>
                <Plus className="h-4 w-4" />
                Add Machine Group
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {formData.machineGroups.length > 0 ? formData.machineGroups.map((group) => (
                <div key={group.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{group.name}</p>
                        <Badge variant="secondary">{group.groupType}</Badge>
                        <Badge variant="outline">{group.moduleIds.length} modules</Badge>
                        <Badge variant="outline">{group.assetIds.length} machines</Badge>
                      </div>
                      {group.description ? <p className="text-xs text-muted-foreground">{group.description}</p> : null}
                      <div className="flex flex-wrap gap-1.5">
                        {group.moduleIds.map((moduleId) => (
                          <Badge key={moduleId} variant="secondary">{moduleLabelById.get(moduleId) || moduleId}</Badge>
                        ))}
                        {group.assetIds.map((assetId) => {
                          const machine = filteredAssets.find((asset) => asset.id === assetId);
                          return (
                            <Badge key={assetId} variant="outline">
                              {machine ? `${machine.code} - ${machine.name}` : assetId}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveGroup(group.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No machine groups added yet.
                </div>
              )}
            </div>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-border/70 p-4">
            <p className="text-sm font-semibold">Resolved Contract Scope</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Direct assignment and group-based machines are merged before the contract is saved.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {resolvedMachines.length > 0 ? resolvedMachines.map((machine) => (
                <Badge key={machine.id} variant="secondary">{machine.code} - {machine.name}</Badge>
              )) : <span className="text-sm text-muted-foreground">No machines selected yet</span>}
            </div>
          </div>

          <div className="sm:col-span-2">
            <MultiSelectField label="Vendor Portal Users" value={formData.vendorUserIds} onChange={(value) => setFormData((current) => ({ ...current, vendorUserIds: value }))} options={vendorUserOptions} placeholder="Select vendor users" />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Notification and Mail Triggers</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AppSwitch
                checked={formData.notificationSettings.notifyEmail}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyEmail: checked } }))}
                label="Email Notifications"
                description="Send contract-triggered mail to vendor, machine incharge, and plant admins."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyInApp}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyInApp: checked } }))}
                label="In-App Notifications"
                description="Push alerts into the notification center."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyOnVisitScheduled}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyOnVisitScheduled: checked } }))}
                label="AMC Visit Scheduled"
                description="Trigger when visit reminders move into the configured reminder window."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyOnBreakdown}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyOnBreakdown: checked } }))}
                label="Breakdown Raised"
                description="Trigger when a breakdown work order is raised for an AMC-covered machine."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyOnRenewal}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyOnRenewal: checked } }))}
                label="Renewal Alerts"
                description="Trigger on the configured renewal day offsets."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyOnServiceReportSubmitted}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyOnServiceReportSubmitted: checked } }))}
                label="Report Submitted"
                description="Trigger when a vendor submits an AMC service report."
              />
              <AppSwitch
                checked={formData.notificationSettings.notifyOnServiceReportVerified}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, notificationSettings: { ...current.notificationSettings, notifyOnServiceReportVerified: checked } }))}
                label="Report Verification"
                description="Trigger when machine incharge verifies or rejects the report."
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InputField
                label="Renewal / Visit Reminder Days"
                value={formData.notificationSettings.notifyBeforeDays.join(", ")}
                onChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    notificationSettings: {
                      ...current.notificationSettings,
                      notifyBeforeDays: value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item >= 0),
                    },
                  }))
                }
                placeholder="30, 15, 7, 0"
              />
              <InputField
                label="Escalation Emails"
                value={formData.notificationSettings.escalationEmails.join(", ")}
                onChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    notificationSettings: {
                      ...current.notificationSettings,
                      escalationEmails: value.split(",").map((item) => item.trim()).filter(Boolean),
                    },
                  }))
                }
                placeholder="service@vendor.com, plantadmin@company.com"
              />
            </div>
          </div>

          <TextareaField label="Terms / Scope Notes" value={formData.terms} onChange={(value) => setFormData((current) => ({ ...current, terms: value }))} className="sm:col-span-2" />
        </div>
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedContract?.contractName || ""} subtitle={selectedContract?.contractNumber || ""}>
        {selectedContract ? (
          <div className="space-y-5">
            <DetailSection title="Contract">
              <DetailRow label="Vendor" value={selectedContract.vendor?.name || "-"} />
              <DetailRow label="Plant" value={selectedContract.plant?.plantName || plantLabel(selectedContract.plantId)} />
              <DetailRow label="Type" value={selectedContract.contractType || "-"} />
              <DetailRow label="Status" value={<StatusBadge variant={getStatusVariant(selectedContract.status)}>{selectedContract.status.replace(/_/g, " ")}</StatusBadge>} />
              <DetailRow label="Visit Frequency" value={selectedContract.visitFrequency || "-"} />
              <DetailRow label="Next Visit" value={selectedContract.nextVisitDate || "-"} />
            </DetailSection>
            <DetailSection title="SLA and Value">
              <DetailRow label="Response SLA" value={selectedContract.responseTimeSla != null ? `${selectedContract.responseTimeSla} hrs` : "-"} />
              <DetailRow label="Resolution SLA" value={selectedContract.resolutionTimeSla != null ? `${selectedContract.resolutionTimeSla} hrs` : "-"} />
              <DetailRow label="Contract Value" value={selectedContract.contractValue ? formatCurrency(selectedContract.contractValue) : "-"} />
              <DetailRow label="Period" value={`${format(new Date(selectedContract.startDate), "dd MMM yyyy")} - ${format(new Date(selectedContract.endDate), "dd MMM yyyy")}`} />
            </DetailSection>
            <DetailSection title="Machine Scope">
              <DetailRow label="Covered Machines" value={`${selectedContract.machines.length}`} />
              <DetailRow label="Machine Groups" value={`${selectedContract.machineGroups.length}`} />
              <div className="col-span-2 flex flex-wrap gap-2">
                {selectedContract.machines.map((machine) => (
                  <Badge key={machine.id} variant="secondary">{machine.code} - {machine.name}</Badge>
                ))}
              </div>
            </DetailSection>
            {selectedContract.machineGroups.length > 0 ? (
              <DetailSection title="Group Definitions">
                <div className="col-span-2 space-y-2">
                  {selectedContract.machineGroups.map((group) => (
                    <div key={group.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{group.name}</p>
                        <Badge variant="secondary">{group.groupType}</Badge>
                        {group.moduleIds.map((moduleId) => (
                          <Badge key={moduleId} variant="outline">{moduleId}</Badge>
                        ))}
                      </div>
                      {group.description ? <p className="mt-2 text-xs text-muted-foreground">{group.description}</p> : null}
                    </div>
                  ))}
                </div>
              </DetailSection>
            ) : null}
            <DetailSection title="Notification Policy">
              <DetailRow label="Email" value={selectedContract.notificationSettings.notifyEmail ? "Enabled" : "Disabled"} />
              <DetailRow label="In-App" value={selectedContract.notificationSettings.notifyInApp ? "Enabled" : "Disabled"} />
              <DetailRow label="Reminder Days" value={selectedContract.notificationSettings.notifyBeforeDays.join(", ")} />
              <div className="col-span-2 flex flex-wrap gap-2">
                {selectedContract.notificationSettings.notifyOnVisitScheduled ? <Badge variant="secondary">Visit Scheduled</Badge> : null}
                {selectedContract.notificationSettings.notifyOnBreakdown ? <Badge variant="secondary">Breakdown</Badge> : null}
                {selectedContract.notificationSettings.notifyOnRenewal ? <Badge variant="secondary">Renewal</Badge> : null}
                {selectedContract.notificationSettings.notifyOnServiceReportSubmitted ? <Badge variant="secondary">Report Submitted</Badge> : null}
                {selectedContract.notificationSettings.notifyOnServiceReportVerified ? <Badge variant="secondary">Report Verified</Badge> : null}
              </div>
              <div className="col-span-2 flex flex-wrap gap-2">
                {selectedContract.notificationSettings.escalationEmails.length > 0 ? selectedContract.notificationSettings.escalationEmails.map((email) => (
                  <Badge key={email} variant="outline">{email}</Badge>
                )) : <span className="text-sm text-muted-foreground">No escalation emails configured</span>}
              </div>
            </DetailSection>
            <DetailSection title="Vendor Portal Users">
              <div className="col-span-2 flex flex-wrap gap-2">
                {selectedContract.vendorUsers.length > 0 ? selectedContract.vendorUsers.map((vendorUser) => (
                  <Badge key={vendorUser.id} variant="outline">{vendorUser.fullName}</Badge>
                )) : <span className="text-sm text-muted-foreground">No vendor portal users mapped</span>}
              </div>
            </DetailSection>
            {selectedContract.terms ? (
              <DetailSection title="Terms">
                <div className="col-span-2 text-sm text-muted-foreground">{selectedContract.terms}</div>
              </DetailSection>
            ) : null}
          </div>
        ) : null}
      </ViewDialog>
    </PageShell>
  );
}
