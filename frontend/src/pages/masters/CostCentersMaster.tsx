import { useEffect, useMemo, useState } from "react";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Wallet, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { createCostCenter, deleteCostCenter, listCostCenters, type CostCenter, updateCostCenter } from "@/api/costCenters";
import { listDepartments, type Department } from "@/api/departments";
import { useMastersOptions } from "@/hooks/useMastersOptions";

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
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
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

  const fetchCostCentersList = async () => {
    setLoading(true);
    try {
      const effectivePlantId = canSelectPlant ? selectedPlant || undefined : defaultPlantId || undefined;
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
    } catch (error: any) {
      toast.error(error?.message || "Failed to load cost centers");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentsList = async (plantId?: string) => {
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
    } catch (error: any) {
      toast.error(error?.message || "Failed to load departments");
    }
  };

  useEffect(() => {
    fetchCostCentersList();
  }, [searchQuery, selectedPlant, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    fetchPlants();
    fetchDepartmentsList(canSelectPlant ? selectedPlant : defaultPlantId);
  }, []);

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
      invalidateOptions(["departments", "assets"]);
      setIsFormOpen(false);
      await fetchCostCentersList();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save cost center");
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
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete cost center");
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
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Cost Centers</h1>
          <p className="text-sm text-muted-foreground">Manage cost centers</p>
        </div>
        {canManage && (
          <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Cost Center
          </Button>
        )}
      </div>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Cost Centers ({filtered.length})
            </CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {canSelectPlant && (
                <SelectField
                  label=""
                  value={selectedPlant}
                  onChange={(value) => {
                    setSelectedPlant(value);
                    setFormData((prev) => ({ ...prev, plantId: value, departmentId: "" }));
                    void fetchDepartmentsList(value);
                  }}
                  options={plantsOptions}
                  placeholder="Select plant"
                  className="w-full sm:w-[180px]"
                />
              )}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
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
            <div className="text-center py-12 text-muted-foreground">Select a plant to view cost center data.</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No cost centers found.</div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(item: CostCenter) => item.id}
              mobileCard={(item: CostCenter) => (
                <MobileCard onView={() => { setSelectedCC(item); setIsViewOpen(true); }} onEdit={canManage ? () => handleEdit(item) : undefined} onDelete={canManage ? () => { setSelectedCC(item); setIsDeleteOpen(true); } : undefined}>
                  <MobileCardHeader title={item.code} subtitle={item.name} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                  <MobileCardRow label="Department" value={getDeptName(item.departmentId)} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={isEditing ? "Edit Cost Center" : "Add New Cost Center"} description="Manage cost center" onSubmit={handleSubmit} submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="CC-001" required />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="Production Line A" required />
          {canSelectPlant ? (
            <SelectField label="Plant" value={formData.plantId} onChange={handlePlantChange} options={plantsOptions} placeholder="Select plant" />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => { }} disabled />
          )}
          <SelectField label="Department" value={formData.departmentId} onChange={(value) => setFormData({ ...formData, departmentId: value })} options={deptOptions} placeholder="Select" hint={deptOptions.length === 0 ? "No departments for selected plant." : undefined} />
          <SelectField label="Status" value={formData.isActive ? "Active" : "Inactive"} onChange={(value) => setFormData({ ...formData, isActive: value === "Active" })} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
        </div>
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
    </div>
  );
}
