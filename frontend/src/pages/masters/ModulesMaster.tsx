import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Boxes, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import HierarchyBreadcrumb from "@/components/masters/HierarchyBreadcrumb";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { createModule, deleteModule, listModules, type MachineModule, updateModule } from "@/api/modules";
import { listDepartments, type Department } from "@/api/departments";
import { listAssets } from "@/api/assets";
import { useAuthStore, isAdmin, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormGrid } from "@/components/layout/FormGrid";

interface ModuleRow extends MachineModule {
  machineCount: number;
}

interface ModuleFormState {
  code: string;
  name: string;
  description: string;
  plantId: string;
  departmentId: string;
  isActive: boolean;
}

const emptyForm: ModuleFormState = {
  code: "",
  name: "",
  description: "",
  plantId: "",
  departmentId: "",
  isActive: true,
};

export default function ModulesMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user) || isRootAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants, invalidateOptions } = useMastersOptions();

  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>(canSelectPlant ? (defaultPlantId || "") : defaultPlantId);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleRow | null>(null);
  const [formData, setFormData] = useState<ModuleFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (canSelectPlant && !selectedPlant) {
        setDepartments([]);
        setModules([]);
        return;
      }
      const effectivePlantId = canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined;
      const effectiveDepartmentId = selectedDepartment === "all" ? undefined : selectedDepartment;

      const [modulesResponse, departmentsResponse, assetsResponse] = await Promise.all([
        listModules({
          page: 1,
          limit: 100,
          search: searchQuery || undefined,
          plantId: effectivePlantId,
          departmentId: effectiveDepartmentId,
        }),
        listDepartments({ page: 1, limit: 100, plantId: effectivePlantId }),
        listAssets({ page: 1, limit: 100, plantId: effectivePlantId, departmentId: effectiveDepartmentId }),
      ]);

      const machineCountMap = new Map<string, number>();
      assetsResponse.data.forEach((asset) => {
        if (!asset.moduleId) return;
        machineCountMap.set(asset.moduleId, (machineCountMap.get(asset.moduleId) || 0) + 1);
      });

      setDepartments(departmentsResponse.data);
      setModules(
        modulesResponse.data.map((module) => ({
          ...module,
          machineCount: machineCountMap.get(module.id) || 0,
        })),
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to load modules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  useEffect(() => {
    fetchData();
  }, [searchQuery, selectedPlant, selectedDepartment, defaultPlantId, canSelectPlant]);

  const departmentFilterOptions = useMemo(() => {
    const rows = !selectedPlant ? [] : departments.filter((department) => department.plantId === selectedPlant);
    return rows.map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` }));
  }, [departments, selectedPlant]);

  const formDepartmentOptions = useMemo(
    () =>
      departments
        .filter((department) => Boolean(formData.plantId) && department.plantId === formData.plantId)
        .map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
    [departments, formData.plantId],
  );

  const resolvedPlantIdForForm = canSelectPlant ? formData.plantId : defaultPlantId;
  const canSubmitModuleForm = Boolean(resolvedPlantIdForForm && formData.departmentId && formData.name.trim().length > 0);

  const getPlantName = (plantId: string | null) => plantsOptions.find((item) => item.value === plantId)?.label || "-";
  const getDepartmentName = (departmentId: string | null) => departments.find((item) => item.id === departmentId)?.name || "-";

  const handleAdd = () => {
    setSelectedModule(null);
    setFormData({ ...emptyForm, plantId: canSelectPlant ? selectedPlant : defaultPlantId });
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (module: ModuleRow) => {
    setSelectedModule(module);
    setFormData({
      code: module.code || "",
      name: module.name,
      description: module.description || "",
      plantId: module.plantId || "",
      departmentId: module.departmentId || "",
      isActive: module.isActive,
    });
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handlePlantChange = (plantId: string) => {
    setFormData((prev) => ({ ...prev, plantId, departmentId: "" }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Module name is required");
      return;
    }
    const resolvedPlantId = canSelectPlant ? formData.plantId : defaultPlantId;
    if (!resolvedPlantId || !formData.departmentId) {
      toast.error("Plant and department are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim() || null,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        plantId: resolvedPlantId,
        departmentId: formData.departmentId,
        isActive: formData.isActive,
      };

      if (isEditing && selectedModule) {
        await updateModule(selectedModule.id, payload);
        toast.success("Module updated");
      } else {
        await createModule(payload);
        toast.success("Module created");
      }

      invalidateOptions(["modules", "assets"]);
      setIsFormOpen(false);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save module");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedModule) return;
    setSaving(true);
    const previous = modules;
    setModules((curr) => curr.filter((module) => module.id !== selectedModule.id));
    try {
      await deleteModule(selectedModule.id);
      toast.success("Module deleted");
      invalidateOptions(["modules", "assets"]);
      setIsDeleteOpen(false);
      await fetchData();
    } catch (error: any) {
      setModules(previous);
      if (error?.status === 409) {
        toast.error(error?.message || "Module cannot be deleted because active machines exist.");
        return;
      }
      toast.error(error?.message || "Failed to delete module");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (item: ModuleRow) => <span className="font-semibold text-primary">{item.code || "-"}</span>,
    },
    { key: "name", header: "Module Name", render: (item: ModuleRow) => <span className="font-medium">{item.name}</span> },
    { key: "plant", header: "Plant", render: (item: ModuleRow) => getPlantName(item.plantId), hideOnMobile: true },
    { key: "department", header: "Department", render: (item: ModuleRow) => getDepartmentName(item.departmentId), hideOnMobile: true },
    { key: "machines", header: "Machines", render: (item: ModuleRow) => <span className="font-semibold">{item.machineCount}</span> },
    {
      key: "status",
      header: "Status",
      render: (item: ModuleRow) => (
        <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: ModuleRow) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedModule(item);
              setIsViewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" />
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
                setSelectedModule(item);
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
        title="Module Master"
        subtitle="Manage Plant -> Department -> Module hierarchy"
        actions={
          canManage ? (
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Module
            </Button>
          ) : undefined
        }
      />

      <Card className="shadow-card">
        <CardContent className="py-4">
          <HierarchyBreadcrumb currentLevel="module" />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Modules ({modules.length})
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canSelectPlant && (
                <SelectField
                  label=""
                  value={selectedPlant}
                  onChange={(value) => {
                    setSelectedPlant(value);
                    setSelectedDepartment("all");
                  }}
                  options={plantsOptions}
                  placeholder="Select plant"
                  className="min-w-[170px]"
                />
              )}
              <SelectField
                label=""
                value={selectedDepartment}
                onChange={setSelectedDepartment}
                options={[{ value: "all", label: "All Departments" }, ...departmentFilterOptions]}
                className="min-w-[190px]"
              />
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : canSelectPlant && !selectedPlant ? (
            <div className="text-center py-12 text-muted-foreground">Select a plant to view module data.</div>
          ) : modules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No modules found.</div>
          ) : (
            <ResponsiveTable
              data={modules}
              columns={columns}
              keyExtractor={(item: ModuleRow) => item.id}
              mobileCard={(item: ModuleRow) => (
                <MobileCard
                  onView={() => {
                    setSelectedModule(item);
                    setIsViewOpen(true);
                  }}
                  onEdit={canManage ? () => handleEdit(item) : undefined}
                  onDelete={
                    canManage
                      ? () => {
                        setSelectedModule(item);
                        setIsDeleteOpen(true);
                      }
                      : undefined
                  }
                >
                  <MobileCardHeader
                    title={item.code || "Module"}
                    subtitle={item.name}
                    badge={
                      <StatusBadge variant={item.isActive ? "active" : "inactive"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </StatusBadge>
                    }
                  />
                  <MobileCardRow label="Department" value={getDepartmentName(item.departmentId)} />
                  <MobileCardRow label="Machines" value={String(item.machineCount)} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={isEditing ? "Edit Module" : "Add Module"}
        description="Configure machine module under a department"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update Module" : "Create Module"}
        submitDisabled={!canSubmitModuleForm}
        size="lg"
      >
        <FormGrid>
          <InputField label="Module Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="MOD-001" />
          <InputField label="Module Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="Grinding Line" required />
          <TextareaField
            label="Description"
            value={formData.description}
            onChange={(value) => setFormData({ ...formData, description: value })}
            className="md:col-span-2"
          />
          {canSelectPlant ? (
            <SelectField
              label="Plant"
              value={formData.plantId}
              onChange={handlePlantChange}
              options={plantsOptions}
              placeholder="Select plant"
              required
            />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <SelectField
            label="Department"
            value={formData.departmentId}
            onChange={(value) => setFormData({ ...formData, departmentId: value })}
            options={formDepartmentOptions}
            placeholder="Select department"
            required
            disabled={canSelectPlant ? !formData.plantId : false}
            hint={
              canSelectPlant && !formData.plantId
                ? "Select plant first."
                : formDepartmentOptions.length === 0
                  ? "No departments for selected plant."
                  : undefined
            }
          />
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

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedModule?.name || ""} subtitle={selectedModule?.code || undefined}>
        {selectedModule && (
          <div className="space-y-6">
            <DetailSection title="Module Information">
              <DetailRow label="Code" value={selectedModule.code || "-"} />
              <DetailRow label="Name" value={selectedModule.name} />
              <DetailRow label="Plant" value={getPlantName(selectedModule.plantId)} />
              <DetailRow label="Department" value={getDepartmentName(selectedModule.departmentId)} />
              <DetailRow label="Description" value={selectedModule.description || "-"} />
              <DetailRow label="Machines" value={String(selectedModule.machineCount)} />
              <DetailRow
                label="Status"
                value={
                  <StatusBadge variant={selectedModule.isActive ? "active" : "inactive"}>
                    {selectedModule.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                }
              />
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Module"
        itemName={selectedModule?.name}
        onConfirm={confirmDelete}
        isLoading={saving}
      />
    </PageShell>
  );
}



