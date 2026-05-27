import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { AsyncSelect } from "@/components/ui/async-select";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import BackButton from "@/components/masters/BackButton";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createMachineInstrument,
  deleteMachineInstrument,
  listMachineInstruments,
  updateMachineInstrument,
  type MachineInstrument,
  type MachineInstrumentPayload,
} from "@/api/calibration";
import { listAssets, type Asset } from "@/api/assets";
import { listDepartments, type Department } from "@/api/departments";
import { listModules, type MachineModule } from "@/api/modules";
import { listPlants, type Plant } from "@/api/plants";
import { useAuthStore } from "@/store/auth.store";
import { isAdminLevel, isSuperAdmin } from "@/lib/permission-engine";
import { Edit, Gauge, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type InstrumentFormState = {
  plantId: string;
  departmentId: string;
  moduleId: string;
  assetId: string;
  instrumentName: string;
  instrumentType: string;
  serialNumber: string;
  rangeMin: string;
  rangeMax: string;
  unit: string;
  installationDate: string;
  status: string;
};

const emptyForm = (plantId: string): InstrumentFormState => ({
  plantId,
  departmentId: "",
  moduleId: "",
  assetId: "",
  instrumentName: "",
  instrumentType: "",
  serialNumber: "",
  rangeMin: "",
  rangeMax: "",
  unit: "",
  installationDate: "",
  status: "ACTIVE",
});

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function getRangeLabel(item: { rangeMin: string | null; rangeMax: string | null; unit: string | null }) {
  const left = item.rangeMin || "-";
  const right = item.rangeMax || "-";
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${left} to ${right}${unit}`;
}

export default function MachineInstrumentsMaster() {
  const { user } = useAuthStore();
  const canManage = isAdminLevel(user?.roles ?? []);
  const canSelectPlant = isSuperAdmin(user?.roles ?? []);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<MachineModule[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [instruments, setInstruments] = useState<MachineInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<MachineInstrument | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<InstrumentFormState>(emptyForm(defaultPlantId));

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;

  useEffect(() => {
    if (!canSelectPlant) return;
    void (async () => {
      try {
        const response = await listPlants({ page: 1, limit: 500, includeInactive: true });
        setPlants(response.data || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load plants"));
      }
    })();
  }, [canSelectPlant]);

  useEffect(() => {
    if (canSelectPlant && !resolvedPlantId) {
      setInstruments([]);
      setDepartments([]);
      setModules([]);
      setAssets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const [instrumentRes, departmentRes, moduleRes, assetRes] = await Promise.all([
          listMachineInstruments({
            page: 1,
            limit: 500,
            plantId: resolvedPlantId || undefined,
            departmentId: selectedDepartmentId || undefined,
            moduleId: selectedModuleId || undefined,
            includeInactive: true,
            search: searchQuery || undefined,
          }),
          listDepartments({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: true }),
          listModules({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: true }),
          listAssets({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: true }),
        ]);
        setInstruments(instrumentRes.data || []);
        setDepartments(departmentRes.data || []);
        setModules(moduleRes.data || []);
        setAssets(assetRes.data || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load machine instruments"));
      } finally {
        setLoading(false);
      }
    })();
  }, [canSelectPlant, resolvedPlantId, searchQuery, selectedDepartmentId, selectedModuleId]);

  const plantOptions = useMemo(
    () => plants.filter((plant) => plant.isActive ?? true).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
    [plants],
  );
  const departmentsForPlant = useMemo(
    () => departments.filter((department) => !resolvedPlantId || department.plantId === resolvedPlantId),
    [departments, resolvedPlantId],
  );
  const modulesForScope = useMemo(
    () =>
      modules.filter((item) => {
        if (formData.plantId && item.plantId !== formData.plantId) return false;
        if (formData.departmentId && item.departmentId !== formData.departmentId) return false;
        return true;
      }),
    [modules, formData.departmentId, formData.plantId],
  );
  const assetsForScope = useMemo(
    () =>
      assets.filter((item) => {
        if (formData.plantId && item.plantId !== formData.plantId) return false;
        if (formData.departmentId && item.departmentId !== formData.departmentId) return false;
        if (formData.moduleId && item.moduleId !== formData.moduleId) return false;
        return true;
      }),
    [assets, formData.departmentId, formData.moduleId, formData.plantId],
  );
  const assetById = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])) as Record<string, Asset>,
    [assets],
  );
  const refreshList = async () => {
    const response = await listMachineInstruments({
      page: 1,
      limit: 500,
      plantId: resolvedPlantId || undefined,
      departmentId: selectedDepartmentId || undefined,
      moduleId: selectedModuleId || undefined,
      includeInactive: true,
      search: searchQuery || undefined,
    });
    setInstruments(response.data || []);
  };

  const handleAdd = () => {
    setIsEditing(false);
    setSelectedInstrument(null);
    setFormData(emptyForm(resolvedPlantId || ""));
    setIsFormOpen(true);
  };

  const handleEdit = (instrument: MachineInstrument) => {
    const asset = assetById[instrument.assetId] || instrument.asset;
    setIsEditing(true);
    setSelectedInstrument(instrument);
    setFormData({
      plantId: asset?.plantId || resolvedPlantId || "",
      departmentId: asset?.departmentId || "",
      moduleId: asset?.moduleId || "",
      assetId: instrument.assetId,
      instrumentName: instrument.instrumentName,
      instrumentType: instrument.instrumentType,
      serialNumber: instrument.serialNumber || "",
      rangeMin: instrument.rangeMin || "",
      rangeMax: instrument.rangeMax || "",
      unit: instrument.unit || "",
      installationDate: instrument.installationDate || "",
      status: instrument.status,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    const plantId = canSelectPlant ? formData.plantId : defaultPlantId;
    if (!plantId || !formData.assetId || !formData.instrumentName.trim() || !formData.instrumentType.trim()) {
      toast.error("Plant, machine, instrument name, and instrument type are required");
      return;
    }

    setSaving(true);
    try {
      const payload: MachineInstrumentPayload = {
        plantId,
        assetId: formData.assetId,
        instrumentName: formData.instrumentName.trim(),
        instrumentType: formData.instrumentType.trim(),
        serialNumber: formData.serialNumber.trim() || null,
        rangeMin: formData.rangeMin.trim() || null,
        rangeMax: formData.rangeMax.trim() || null,
        unit: formData.unit.trim() || null,
        installationDate: formData.installationDate || null,
        status: formData.status,
      };

      if (isEditing && selectedInstrument) {
        await updateMachineInstrument(selectedInstrument.id, payload);
        toast.success("Machine instrument updated");
      } else {
        await createMachineInstrument(payload);
        toast.success("Machine instrument created");
      }

      setIsFormOpen(false);
      await refreshList();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save machine instrument"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedInstrument) return;
    setSaving(true);
    try {
      await deleteMachineInstrument(selectedInstrument.id);
      toast.success("Machine instrument deleted");
      setIsDeleteOpen(false);
      setInstruments((current) => current.filter((item) => item.id !== selectedInstrument.id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete machine instrument"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "machine",
      header: "Machine",
      render: (item: MachineInstrument) => (
        <div>
          <p className="font-medium">{item.asset?.code || "-"}</p>
          <p className="text-xs text-muted-foreground">{item.asset?.name || "Machine not found"}</p>
        </div>
      ),
    },
    {
      key: "instrument",
      header: "Instrument",
      render: (item: MachineInstrument) => (
        <div>
          <p className="font-medium">{item.instrumentName}</p>
          <p className="text-xs text-muted-foreground">{item.instrumentType}</p>
        </div>
      ),
    },
    { key: "serial", header: "Serial", render: (item: MachineInstrument) => item.serialNumber || "-", hideOnMobile: true },
    { key: "range", header: "Range", render: (item: MachineInstrument) => getRangeLabel(item), hideOnMobile: true },
    {
      key: "status",
      header: "Status",
      render: (item: MachineInstrument) => (
        <StatusBadge variant={item.status === "ACTIVE" ? "active" : item.status === "UNDER_CALIBRATION" ? "warning" : "inactive"}>
          {item.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: MachineInstrument) => canManage ? (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => { setSelectedInstrument(item); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ) : null,
    },
  ];

  return (
    <PageShell className="space-y-6">
      <BackButton />
      <PageHeader
        title="Machine Instruments Master"
        subtitle="Register machine-linked instruments and keep each calibration point tied to its machine hierarchy."
        actions={canManage ? <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" />Add Instrument</Button> : null}
      />

      <DataTableShell
        title={<span className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" />Machine Instruments ({instruments.length})</span>}
        toolbar={
          <Toolbar
            left={<div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9" placeholder="Search machine, instrument, serial..." /></div>}
            right={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {canSelectPlant ? <SelectField label="" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" className="w-full sm:w-[160px]" /> : null}
                <SelectField label="" value={selectedDepartmentId} onChange={(value) => { setSelectedDepartmentId(value); setSelectedModuleId(""); }} options={departmentsForPlant.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} placeholder="All departments" className="w-full sm:w-[180px]" />
                <SelectField label="" value={selectedModuleId} onChange={setSelectedModuleId} options={modules.filter((item) => !selectedDepartmentId || item.departmentId === selectedDepartmentId).map((item) => ({ value: item.id, label: item.code ? `${item.code} - ${item.name}` : item.name }))} placeholder="All modules" className="w-full sm:w-[180px]" />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : !resolvedPlantId && canSelectPlant ? (
          <EmptyState title="Select a plant" description="Choose a plant first to register instruments under its machines." />
        ) : instruments.length === 0 ? (
          <EmptyState title="No instruments found" description="Add the first instrument to start machine-linked calibration." actionLabel={canManage ? "Add Instrument" : undefined} onAction={canManage ? handleAdd : undefined} />
        ) : (
          <ResponsiveTable
            data={instruments}
            columns={columns}
            keyExtractor={(item: MachineInstrument) => item.id}
            mobileCard={(item: MachineInstrument) => (
              <MobileCard onEdit={canManage ? () => handleEdit(item) : undefined} onDelete={canManage ? () => { setSelectedInstrument(item); setIsDeleteOpen(true); } : undefined}>
                <MobileCardHeader title={item.instrumentName} subtitle={item.asset?.code || "Machine"} badge={<StatusBadge variant={item.status === "ACTIVE" ? "active" : item.status === "UNDER_CALIBRATION" ? "warning" : "inactive"}>{item.status.replace(/_/g, " ")}</StatusBadge>} />
                <MobileCardRow label="Machine" value={item.asset?.name || "-"} />
                <MobileCardRow label="Type" value={item.instrumentType} />
                <MobileCardRow label="Range" value={getRangeLabel(item)} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={isEditing ? "Edit Machine Instrument" : "Add Machine Instrument"}
        description="Keep the instrument linked to the correct machine and hierarchy."
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update Instrument" : "Create Instrument"}
        size="xl"
      >
        <FormGrid>
          {canSelectPlant ? (
            <AsyncSelect
              label="Plant"
              required
              value={formData.plantId}
              onChange={(value) => setFormData((current) => ({ ...current, plantId: value, departmentId: "", moduleId: "", assetId: "" }))}
              fetchFn={listPlants}
              labelExtractor={(plant) => `${plant.plantCode || "-"} - ${plant.plantName}`}
              valueExtractor={(plant) => plant.id}
              placeholder="Select plant"
            />
          ) : null}
          <AsyncSelect
            label="Department"
            value={formData.departmentId}
            onChange={(value) => setFormData((current) => ({ ...current, departmentId: value, moduleId: "", assetId: "" }))}
            fetchFn={async (params) => {
              if (canSelectPlant && !formData.plantId) return { data: [], total: 0 };
              return listDepartments({ ...params, plantId: formData.plantId || defaultPlantId || undefined });
            }}
            labelExtractor={(dep) => `${dep.code} - ${dep.name}`}
            valueExtractor={(dep) => dep.id}
            placeholder="Select department"
            disabled={canSelectPlant ? !formData.plantId : false}
          />
          <AsyncSelect
            label="Module"
            value={formData.moduleId}
            onChange={(value) => setFormData((current) => ({ ...current, moduleId: value, assetId: "" }))}
            fetchFn={async (params) => {
               if (!formData.departmentId) return { data: [], total: 0 };
               return listModules({ ...params, plantId: formData.plantId || defaultPlantId || undefined, departmentId: formData.departmentId });
            }}
            labelExtractor={(module) => `${module.code ? `${module.code} - ` : ""}${module.name}`}
            valueExtractor={(module) => module.id}
            placeholder="Select module"
            disabled={!formData.departmentId}
          />
          <AsyncSelect
            label="Machine"
            required
            value={formData.assetId}
            onChange={(value) => setFormData((current) => ({ ...current, assetId: value }))}
            fetchFn={async (params) => {
               if (!formData.moduleId) return { data: [], total: 0 };
               const response = await listAssets({ ...params, plantId: formData.plantId || defaultPlantId || undefined });
               const filtered = response.data.filter((asset) => asset.moduleId === formData.moduleId);
               return { data: filtered, total: filtered.length };
            }}
            labelExtractor={(asset) => `${asset.code} - ${asset.name}`}
            valueExtractor={(asset) => asset.id}
            placeholder="Select machine"
            disabled={!formData.moduleId}
          />
          <InputField label="Instrument Name" value={formData.instrumentName} onChange={(value) => setFormData((current) => ({ ...current, instrumentName: value }))} placeholder="Suction Pressure Gauge" required />
          <InputField label="Instrument Type" value={formData.instrumentType} onChange={(value) => setFormData((current) => ({ ...current, instrumentType: value }))} placeholder="Pressure Gauge" required />
          <InputField label="Serial Number" value={formData.serialNumber} onChange={(value) => setFormData((current) => ({ ...current, serialNumber: value }))} placeholder="PG-2026-014" />
          <InputField label="Range Min" value={formData.rangeMin} onChange={(value) => setFormData((current) => ({ ...current, rangeMin: value }))} placeholder="0" />
          <InputField label="Range Max" value={formData.rangeMax} onChange={(value) => setFormData((current) => ({ ...current, rangeMax: value }))} placeholder="10" />
          <InputField label="Unit" value={formData.unit} onChange={(value) => setFormData((current) => ({ ...current, unit: value }))} placeholder="bar / psi / deg C" />
          <InputField label="Installation Date" value={formData.installationDate} onChange={(value) => setFormData((current) => ({ ...current, installationDate: value }))} type="date" />
          <SelectField label="Status" value={formData.status} onChange={(value) => setFormData((current) => ({ ...current, status: value }))} options={[{ value: "ACTIVE", label: "Active" }, { value: "UNDER_CALIBRATION", label: "Under Calibration" }, { value: "INACTIVE", label: "Inactive" }]} required />
        </FormGrid>
      </FormDialog>

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Machine Instrument" itemName={selectedInstrument?.instrumentName} onConfirm={handleDelete} isLoading={saving} />
    </PageShell>
  );
}
