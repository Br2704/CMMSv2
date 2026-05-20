import { useEffect, useMemo, useState } from "react";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { createDepartment, deleteDepartment, listDepartments, type Department, updateDepartment } from "@/api/departments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Building2, Eye } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import HierarchyBreadcrumb from "@/components/masters/HierarchyBreadcrumb";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Toolbar } from "@/components/layout/Toolbar";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { usePermissions } from "@/hooks/usePermissions";

interface DepartmentFormState {
  code: string;
  name: string;
  plantId: string;
  isActive: boolean;
}

const emptyForm: DepartmentFormState = { code: "", name: "", plantId: "", isActive: true };

export default function DepartmentMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const { can } = usePermissions();
  const canCreateDepartment = can("DEPARTMENTS", "create");
  const canUpdateDepartment = can("DEPARTMENTS", "update");
  const canDeleteDepartment = can("DEPARTMENTS", "delete");
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants, invalidateOptions } = useMastersOptions();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>(canSelectPlant ? (defaultPlantId || "") : defaultPlantId);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState<DepartmentFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);

  const fetchDepartments = async (plantIdOverride?: string) => {
    setLoading(true);
    try {
      const scopedPlantId = canSelectPlant ? (plantIdOverride ?? selectedPlant) || undefined : defaultPlantId || undefined;
      if (canSelectPlant && !scopedPlantId) {
        setDepartments([]);
        return;
      }
      const response = await listDepartments({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: scopedPlantId,
      });
      setDepartments(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [searchQuery, selectedPlant, defaultPlantId, canSelectPlant]);

  const plantOptions = useMemo(
    () => plantsOptions,
    [plantsOptions],
  );

  useEffect(() => {
    if (!canSelectPlant || selectedPlant || plantOptions.length === 0) {
      return;
    }
    setSelectedPlant(plantOptions[0].value);
  }, [canSelectPlant, selectedPlant, plantOptions]);

  const getPlantName = (plantId: string | null) => {
    const label = plantsOptions.find((item) => item.value === plantId)?.label || "";
    if (!label) return "-";
    const codeToken = label.split(" - ")[0]?.trim();
    return codeToken || "-";
  };

  const filtered = useMemo(() => departments, [departments]);

  const canSubmitDepartmentForm =
    formData.code.trim().length > 0 &&
    formData.name.trim().length > 0 &&
    (canSelectPlant ? Boolean(formData.plantId) : Boolean(defaultPlantId));

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? selectedPlant : defaultPlantId });
    setSelectedDept(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (department: Department) => {
    setFormData({
      code: department.code,
      name: department.name,
      plantId: department.plantId || "",
      isActive: department.isActive,
    });
    setSelectedDept(department);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and name are required");
      return;
    }

    const resolvedPlantId = canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId) {
      toast.error("Plant is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        plantId: resolvedPlantId,
        isActive: formData.isActive,
      };

      if (isEditing && selectedDept) {
        await updateDepartment(selectedDept.id, payload);
        toast.success("Department updated");
      } else {
        await createDepartment(payload);
        toast.success("Department created");
      }

      if (canSelectPlant && selectedPlant !== resolvedPlantId) {
        setSelectedPlant(resolvedPlantId);
      }

      invalidateOptions(["departments", "modules", "assets"]);
      setIsFormOpen(false);
      await fetchDepartments(resolvedPlantId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save department");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedDept) return;
    setSaving(true);
    const previous = departments;
    setDepartments((curr) => curr.filter((department) => department.id !== selectedDept.id));
    try {
      await deleteDepartment(selectedDept.id);
      toast.success("Department deleted");
      invalidateOptions(["departments", "modules", "assets"]);
      setIsDeleteOpen(false);
      await fetchDepartments();
    } catch (error: any) {
      setDepartments(previous);
      if (error?.status === 409) {
        toast.error(error?.message || "Department cannot be deleted because modules/assets exist.");
        return;
      }
      toast.error(error?.message || "Failed to delete department");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: Department) => <span className="font-semibold text-primary">{item.code}</span> },
    { key: "name", header: "Name", render: (item: Department) => <span className="font-medium">{item.name}</span> },
    { key: "plant", header: "Plant", render: (item: Department) => getPlantName(item.plantId), hideOnMobile: true },
    { key: "status", header: "Status", render: (item: Department) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Department) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedDept(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canUpdateDepartment && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canDeleteDepartment && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedDept(item); setIsDeleteOpen(true); }}>
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
        title="Department Master"
        subtitle="Manage departments"
        actions={
          canCreateDepartment ? (
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Department
            </Button>
          ) : undefined
        }
      />

      <Card className="shadow-card">
        <CardContent className="py-4">
          <HierarchyBreadcrumb currentLevel="department" />
        </CardContent>
      </Card>

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Departments ({filtered.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {canSelectPlant && (
                  <SelectField
                    label=""
                    value={selectedPlant}
                    onChange={setSelectedPlant}
                    options={plantOptions}
                    placeholder="Select plant"
                    className="w-full sm:w-[180px]"
                  />
                )}
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search departments..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
                </div>
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : canSelectPlant && !selectedPlant ? (
          <EmptyState
            title="Select a plant"
            description="Choose a plant to view department data."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No departments found"
            description="Add a department to continue hierarchy setup."
            actionLabel={canCreateDepartment ? "Add Department" : undefined}
            onAction={canCreateDepartment ? handleAdd : undefined}
          />
        ) : (
          <ResponsiveTable
            data={filtered}
            columns={columns}
            keyExtractor={(item: Department) => item.id}
            mobileCard={(item: Department) => (
              <MobileCard
                onView={() => { setSelectedDept(item); setIsViewOpen(true); }}
                onEdit={canUpdateDepartment ? () => handleEdit(item) : undefined}
                onDelete={canDeleteDepartment ? () => { setSelectedDept(item); setIsDeleteOpen(true); } : undefined}
              >
                <MobileCardHeader
                  title={item.code}
                  subtitle={item.name}
                  badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>}
                />
                <MobileCardRow label="Plant" value={getPlantName(item.plantId)} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={isEditing ? "Edit Department" : "Add New Department"}
        description={isEditing ? "Update department" : "Add a new department"}
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add Department"}
        submitDisabled={!canSubmitDepartmentForm}
        size="lg"
      >
        <FormGrid>
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="DEPT-001" required />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="Production" required />
          {canSelectPlant ? (
            <SelectField
              label="Plant"
              value={formData.plantId}
              onChange={(value) => setFormData({ ...formData, plantId: value })}
              options={plantOptions}
              placeholder="Select plant"
              required
            />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <SelectField
            label="Status"
            value={formData.isActive ? "Active" : "Inactive"}
            onChange={(value) => setFormData({ ...formData, isActive: value === "Active" })}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
        </FormGrid>
      </FormDialog>

      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedDept?.name || ""}
        subtitle={selectedDept?.code}
      >
        {selectedDept && (
          <div className="space-y-6">
            <DetailSection title="Information">
              <DetailRow label="Code" value={selectedDept.code} />
              <DetailRow label="Name" value={selectedDept.name} />
              <DetailRow label="Plant" value={getPlantName(selectedDept.plantId)} />
              <DetailRow label="Status" value={<StatusBadge variant={selectedDept.isActive ? "active" : "inactive"}>{selectedDept.isActive ? "Active" : "Inactive"}</StatusBadge>} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Department"
        itemName={selectedDept?.name}
        onConfirm={confirmDelete}
        isLoading={saving}
      />
    </PageShell>
  );
}
