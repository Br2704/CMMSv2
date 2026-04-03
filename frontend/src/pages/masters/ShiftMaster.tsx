import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Clock, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/auth.store";
import { createShift, deleteShift, listShifts, type Shift, updateShift } from "@/api/shifts";
import { useMastersOptions } from "@/hooks/useMastersOptions";

interface ShiftFormState {
  shiftName: string;
  startTime: string;
  endTime: string;
  plantId: string;
  isActive: boolean;
}

const emptyForm: ShiftFormState = { shiftName: "", startTime: "06:00", endTime: "14:00", plantId: "", isActive: true };

export default function ShiftMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormState>({ ...emptyForm, plantId: defaultPlantId });

  const fetchShiftRows = async () => {
    setLoading(true);
    try {
      const response = await listShifts({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setShifts(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load shifts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftRows();
  }, [searchQuery, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    fetchPlants();
  }, []);

  const filtered = useMemo(() => shifts, [shifts]);

  const getPlantLabel = (plantId: string | null) => plantsOptions.find((option) => option.value === plantId)?.label || "-";

  const handleSubmit = async () => {
    if (!formData.shiftName.trim() || !formData.startTime || !formData.endTime) {
      toast.error("Please fill all required fields");
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
        shiftName: formData.shiftName.trim(),
        startTime: formData.startTime,
        endTime: formData.endTime,
        plantId: resolvedPlantId,
        isActive: formData.isActive,
      };

      if (selected) {
        await updateShift(selected.id, payload);
        toast.success("Shift updated");
      } else {
        await createShift(payload);
        toast.success("Shift created");
      }

      setIsFormOpen(false);
      setSelected(null);
      await fetchShiftRows();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save shift");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await deleteShift(selected.id);
      toast.success("Shift deleted");
      setIsDeleteOpen(false);
      await fetchShiftRows();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete shift");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "name", header: "Shift Name", render: (item: Shift) => <span className="font-medium">{item.shiftName}</span> },
    { key: "start", header: "Start Time", render: (item: Shift) => item.startTime },
    { key: "end", header: "End Time", render: (item: Shift) => item.endTime },
    { key: "plant", header: "Plant", render: (item: Shift) => getPlantLabel(item.plantId), hideOnMobile: true },
    { key: "status", header: "Status", render: (item: Shift) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Shift) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelected(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" onClick={() => { setFormData({ shiftName: item.shiftName, startTime: item.startTime, endTime: item.endTime, plantId: item.plantId || defaultPlantId, isActive: item.isActive }); setSelected(item); setIsFormOpen(true); }}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelected(item); setIsDeleteOpen(true); }}>
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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Shift Management</h1>
          <p className="text-sm text-muted-foreground">Configure plant shifts for data logging</p>
        </div>
        {canManage && (
          <Button onClick={() => { setFormData({ ...emptyForm, plantId: canSelectPlant ? (formData.plantId || plantsOptions[0]?.value || "") : defaultPlantId }); setSelected(null); setIsFormOpen(true); }} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Shift
          </Button>
        )}
      </motion.div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Shifts ({filtered.length})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search shifts..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No shifts found.</div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(item: Shift) => item.id}
              mobileCard={(item: Shift) => (
                <MobileCard
                  onView={() => { setSelected(item); setIsViewOpen(true); }}
                  onEdit={canManage ? () => { setFormData({ shiftName: item.shiftName, startTime: item.startTime, endTime: item.endTime, plantId: item.plantId || defaultPlantId, isActive: item.isActive }); setSelected(item); setIsFormOpen(true); } : undefined}
                  onDelete={canManage ? () => { setSelected(item); setIsDeleteOpen(true); } : undefined}
                >
                  <MobileCardHeader title={item.shiftName} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                  <MobileCardRow label="Start" value={item.startTime} />
                  <MobileCardRow label="End" value={item.endTime} />
                  <MobileCardRow label="Plant" value={getPlantLabel(item.plantId)} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={selected ? "Edit Shift" : "Add Shift"}
        description="Configure shift timing"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : selected ? "Update" : "Create"}
      >
        <div className="grid grid-cols-1 gap-4">
          <InputField label="Shift Name" value={formData.shiftName} onChange={(value) => setFormData({ ...formData, shiftName: value })} placeholder="Morning Shift" required />
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Start Time" value={formData.startTime} onChange={(value) => setFormData({ ...formData, startTime: value })} type="time" required />
            <InputField label="End Time" value={formData.endTime} onChange={(value) => setFormData({ ...formData, endTime: value })} type="time" required />
          </div>
          {canSelectPlant ? (
            <SelectField label="Plant" value={formData.plantId} onChange={(value) => setFormData({ ...formData, plantId: value })} options={plantsOptions} placeholder="Select plant" required />
          ) : (
            <InputField label="Plant" value={getPlantLabel(defaultPlantId)} onChange={() => {}} disabled />
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
        </div>
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selected?.shiftName || ""}>
        {selected && (
          <DetailSection title="Shift Details">
            <DetailRow label="Shift Name" value={selected.shiftName} />
            <DetailRow label="Start Time" value={selected.startTime} />
            <DetailRow label="End Time" value={selected.endTime} />
            <DetailRow label="Plant" value={getPlantLabel(selected.plantId)} />
            <DetailRow label="Status" value={selected.isActive ? "Active" : "Inactive"} />
          </DetailSection>
        )}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={confirmDelete}
        title="Delete Shift"
        description={`Are you sure you want to delete "${selected?.shiftName}"?`}
        isLoading={saving}
      />
    </div>
  );
}
