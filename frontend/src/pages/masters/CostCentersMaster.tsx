import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { isAdminLevel, isSuperAdmin } from "@/lib/permission-engine";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Edit, Trash2, Wallet, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { FormGrid } from "@/components/layout/FormGrid";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { AsyncSelect } from "@/components/ui/async-select";
import { listPlants } from "@/api/plants";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { createCostCenter, deleteCostCenter, listCostCenters, type CostCenter, type CostCenterPayload, updateCostCenter } from "@/api/costCenters";
import { listDepartments, type Department } from "@/api/departments";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { getErrorMessage } from "@/lib/utils";

interface CostCenterFormState {
  code: string;
  name: string;
  departmentId: string;
  plantId: string;
  isActive: boolean;
}

const emptyForm: CostCenterFormState = { code: "", name: "", departmentId: "", plantId: "", isActive: true };

export default function CostCentersMaster() {
  const { user } = useAuthStore();
  const canManage = isAdminLevel(user?.roles ?? []);
  const canSelectPlant = isSuperAdmin(user?.roles ?? []);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants, invalidateOptions } = useMastersOptions();

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>(canSelectPlant ? (defaultPlantId || "") : defaultPlantId);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState<CostCenterFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);

  const fetchCostCentersList = useCallback(async (plantIdOverride?: string) => {
    setLoading(true);
    try {
      const effectivePlantId = canSelectPlant ? (plantIdOverride ?? selectedPlant) || undefined : defaultPlantId || undefined;
      if (canSelectPlant && !effectivePlantId) {
        setCostCenters([]);
        return;
      }
      const response = await listCostCenters({
        page: 1,
        limit: 1000,
        search: searchQuery || undefined,
        plantId: effectivePlantId,
      });
      setCostCenters(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load cost centers"));
    } finally {
      setLoading(false);
    }
  }, [canSelectPlant, defaultPlantId, searchQuery, selectedPlant]);

  const fetchDepartmentsList = useCallback(async (plantId?: string) => {
    try {
      const effectivePlantId = plantId || (canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined);
      if (canSelectPlant && !effectivePlantId) {
        setDepartments([]);
        return;
      }
      const response = await listDepartments({
        page: 1,
        limit: 1000,
        plantId: effectivePlantId,
      });
      setDepartments(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load departments"));
    }
  }, [canSelectPlant, defaultPlantId, selectedPlant]);

  useEffect(() => {
    fetchCostCentersList();
  }, [fetchCostCentersList]);

  useEffect(() => {
    fetchPlants();
    fetchDepartmentsList(canSelectPlant ? selectedPlant : defaultPlantId);
  }, []);

  useEffect(() => {
    if (!canSelectPlant || selectedPlant || plantsOptions.length === 0) return;
    setSelectedPlant(plantsOptions[0].value);
  }, [canSelectPlant, selectedPlant, plantsOptions]);

  const filtered = useMemo(() => costCenters, [costCenters]);
  const deptOptions = useMemo(
    () =>
      departments
        .filter((department) => !formData.plantId || department.plantId === formData.plantId)
        .map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
    [departments, formData.plantId],
  );
  const getDeptName = (id: string | null) => departments.find((department) => department.id === id)?.name || "-";
  const getPlantName = (id: string | null) => plantsOptions.find((option) => option.value === id)?.label || "-";

  const handlePlantChange = async (plantId: string) => {
    setFormData((prev) => ({ ...prev, plantId, departmentId: "" }));
    await fetchDepartmentsList(plantId);
  };

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? selectedPlant : defaultPlantId });
    setSelectedCC(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (row: CostCenter) => {
    setFormData({
      code: row.code,
      name: row.name,
      departmentId: row.departmentId || "",
      plantId: row.plantId || "",
      isActive: row.isActive,
    });
    setSelectedCC(row);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const resolvedPlantId = canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId) {
      toast.error("Plant is required");
      return;
    }

    setSaving(true);
    try {
      const code = formData.code.trim();
      const payload: CostCenterPayload = {
        code: code || 'N/A',
        name: formData.name.trim(),
        departmentId: formData.departmentId || null,
        plantId: resolvedPlantId,
        isActive: formData.isActive,
      };
      if (isEditing && selectedCC) {
        await updateCostCenter(selectedCC.id, payload);
        toast.success("Cost center updated");
      } else {
        await createCostCenter(payload);
        toast.success("Cost center created");
      }
      if (canSelectPlant && selectedPlant !== resolvedPlantId) setSelectedPlant(resolvedPlantId);
      invalidateOptions(["departments", "assets"]);
      setIsFormOpen(false);
      await fetchCostCentersList(resolvedPlantId);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save cost center"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedCC) return;
    setSaving(true);
    try {
      await deleteCostCenter(selectedCC.id);
      toast.success("Cost center deleted");
      invalidateOptions(["departments", "assets"]);
      setIsDeleteOpen(false);
      await fetchCostCentersList();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete cost center"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: CostCenter) => <span className="font-semibold text-primary">{item.code}</span> },
    { key: "name", header: "Name", render: (item: CostCenter) => <span className="font-medium">{item.name}</span> },
    { key: "dept", header: "Department", render: (item: CostCenter) => getDeptName(item.departmentId), hideOnMobile: true },
    { key: "plant", header: "Plant", render: (item: CostCenter) => getPlantName(item.plantId), hideOnMobile: true },
    { key: "status", header: "Status", render: (item: CostCenter) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: CostCenter) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedCC(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedCC(item); setIsDeleteOpen(true); }}>
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
        title="Cost Centers"
        subtitle="Manage cost centers"
        actions={
          canManage ? (
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Cost Center
            </Button>
          ) : undefined
        }
      />
      <DataTableShell
        title={<><Wallet className="h-5 w-5 text-primary" /> Cost Centers ({filtered.length})</>}
        toolbar={
          <Toolbar
            left={
              canSelectPlant && (
                <SelectField
                  label=""
                  value={selectedPlant}
                  onChange={(value) => {
                    setSelectedPlant(value);
                    setFormData((prev) => ({ ...prev, plantId: value, departmentId: "" }));
                    void fetchDepartmentsList(value);
                  }}
                  options={plantsOptions}
                  placeholder="All Plants"
                />
              )
            }
            right={
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="cost-center-search" name="costCenterSearch" placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton rows={5} />
        ) : canSelectPlant && !selectedPlant ? (
          <EmptyState title="Select a plant" description="Choose a plant to view cost center data." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No cost centers" description="Add your first cost center using the Add Cost Center button." />
        ) : (
          <ResponsiveTable
            data={filtered}
            columns={columns}
            keyExtractor={(item: CostCenter) => item.id}
            mobileCard={(item: CostCenter) => (
              <MobileCard
                onView={() => { setSelectedCC(item); setIsViewOpen(true); }}
                onEdit={canManage ? () => handleEdit(item) : undefined}
                onDelete={canManage ? () => { setSelectedCC(item); setIsDeleteOpen(true); } : undefined}
              >
                <MobileCardHeader title={item.code} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                <MobileCardRow label="Name" value={item.name} />
                <MobileCardRow label="Department" value={getDeptName(item.departmentId)} />
                <MobileCardRow label="Plant" value={getPlantName(item.plantId)} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={isEditing ? "Edit Cost Center" : "Add New Cost Center"} description="Manage cost center" onSubmit={handleSubmit} submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add"} size="lg">
        <FormGrid>
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="Leave empty to auto-generate" hint="Optional - auto-generated if left blank" />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="Production Line A" required />
          {canSelectPlant ? (
            <AsyncSelect
              label="Plant"
              value={formData.plantId}
              onChange={async (value) => {
                 const plantId = (value as string | null) || "";
                 setFormData((prev) => ({ ...prev, plantId, departmentId: "" }));
                 await fetchDepartmentsList(plantId);
              }}
              fetchFn={listPlants}
              labelExtractor={(plant) => `${plant.plantCode || "-"} - ${plant.plantName}`}
              valueExtractor={(plant) => plant.id}
              placeholder="Select plant"
            />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <AsyncSelect
            label="Department"
            value={formData.departmentId}
            onChange={(value) => setFormData({ ...formData, departmentId: (value as string | null) || "" })}
            fetchFn={async (params) => listDepartments({ ...params, plantId: formData.plantId })}
            labelExtractor={(dept) => `${dept.code} - ${dept.name}`}
            valueExtractor={(dept) => dept.id}
            placeholder="Select"
            disabled={!formData.plantId}
          />
          <SelectField label="Status" value={formData.isActive ? "Active" : "Inactive"} onChange={(value) => setFormData({ ...formData, isActive: value === "Active" })} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
        </FormGrid>
      </FormDialog>
      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedCC?.name || ""} subtitle={selectedCC?.code}>
        {selectedCC && (
          <div className="space-y-6">
            <DetailSection title="Information">
              <DetailRow label="Code" value={selectedCC.code} />
              <DetailRow label="Name" value={selectedCC.name} />
              <DetailRow label="Plant" value={getPlantName(selectedCC.plantId)} />
              <DetailRow label="Department" value={getDeptName(selectedCC.departmentId)} />
              <DetailRow label="Status" value={<StatusBadge variant={selectedCC.isActive ? "active" : "inactive"}>{selectedCC.isActive ? "Active" : "Inactive"}</StatusBadge>} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>
      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Cost Center" itemName={selectedCC?.name} onConfirm={confirmDelete} isLoading={saving} />
    </PageShell>
  );
}
