import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Download, Edit, Eye, Plus, Trash2, Search } from "lucide-react";
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
import { AuditInfo } from "@/components/shared/AuditInfo";
import { BulkActionsBar } from "@/components/shared/BulkActionsBar";
import { useAuthStore } from "@/store/auth.store";
import { isAdminLevel, isSuperAdmin } from "@/lib/permission-engine";
import { createShift, deleteShift, listShifts, type Shift, updateShift } from "@/api/shifts";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { useCsvExport } from "@/hooks/useCsvExport";
import { getErrorMessage } from "@/lib/utils";

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
  const canManage = isAdminLevel(user?.roles ?? []);
  const canSelectPlant = isSuperAdmin(user?.roles ?? []);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();
  const { exportCsv } = useCsvExport<Shift>();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormState>({ ...emptyForm, plantId: defaultPlantId });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchShiftRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listShifts({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setShifts(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load shifts"));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, canSelectPlant, defaultPlantId]);

  useEffect(() => {
    fetchShiftRows();
  }, [fetchShiftRows]);

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
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save shift"));
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
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete shift"));
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === shifts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shifts.map((s) => s.id)));
    }
  };

  const handleBulkToggle = async (active: boolean) => {
    const ids = Array.from(selectedIds);
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => updateShift(id, { isActive: active })));
      toast.success(`${ids.length} shifts ${active ? "activated" : "deactivated"}`);
      setSelectedIds(new Set());
      await fetchShiftRows();
    } catch (error) {
      toast.error(getErrorMessage(error, `Failed to ${active ? "activate" : "deactivate"} shifts`));
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const items = selectedIds.size > 0 ? shifts.filter((s) => selectedIds.has(s.id)) : shifts;
    if (items.length === 0) return;
    exportCsv({
      items,
      filename: "shifts",
      columns: [
        { key: "shiftName", header: "Shift Name", render: (s) => s.shiftName },
        { key: "startTime", header: "Start Time", render: (s) => s.startTime },
        { key: "endTime", header: "End Time", render: (s) => s.endTime },
        { key: "isActive", header: "Status", render: (s) => s.isActive ? "Active" : "Inactive" },
      ],
    });
    toast.success(`Exported ${items.length} shifts`);
  };

  const columns = [
    {
      key: "select",
      header: "",
      className: "w-10",
      render: (item: Shift) => (
        <input type="checkbox" id={`select-shift-${item.id}`} name="selectShift" className="h-4 w-4 rounded border-input" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} onClick={(e) => e.stopPropagation()} />
      ),
    },
    { key: "name", header: "Shift Name", render: (item: Shift) => <span className="font-medium">{item.shiftName}</span> },
    { key: "start", header: "Start Time", render: (item: Shift) => item.startTime },
    { key: "end", header: "End Time", render: (item: Shift) => item.endTime },
    { key: "plant", header: "Plant", render: (item: Shift) => getPlantLabel(item.plantId), hideOnMobile: true },
    { key: "status", header: "Status", render: (item: Shift) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "audit",
      header: "Updated",
      hideOnMobile: true,
      render: (item: Shift) => {
        if (!item.updatedAt) return <span className="text-xs text-muted-foreground">-</span>;
        const d = new Date(item.updatedAt);
        return <span className="text-xs text-muted-foreground whitespace-nowrap">{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>;
      },
    },
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
    <PageShell>
      <BackButton />
      <PageHeader
        title="Shift Management"
        subtitle="Configure plant shifts for data logging"
        actions={
          canManage ? (
            <Button onClick={() => { setFormData({ ...emptyForm, plantId: canSelectPlant ? (formData.plantId || plantsOptions[0]?.value || "") : defaultPlantId }); setSelected(null); setIsFormOpen(true); }} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Shift
            </Button>
          ) : undefined
        }
      />

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            Shifts ({shifts.length})
            {selectedIds.size > 0 && <span className="text-xs text-muted-foreground">({selectedIds.size} selected)</span>}
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search shifts..." className="h-10 pl-9" />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton rows={5} />
        ) : shifts.length === 0 ? (
          <EmptyState title="No shifts configured" description="Add your first shift using the Add Shift button." />
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <input type="checkbox" id="select-all-shifts" name="selectAllShifts" className="h-4 w-4 rounded border-input" checked={shifts.length > 0 && selectedIds.size === shifts.length} onChange={toggleSelectAll} />
              <span className="text-xs text-muted-foreground">{selectedIds.size === shifts.length ? "Deselect all" : "Select all"}</span>
              <button className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={handleExportCsv} disabled={shifts.length === 0}>
                <Download className="h-3 w-3" /> Export CSV
              </button>
            </div>
            <ResponsiveTable
              data={shifts}
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
                  <MobileCardRow label="Updated" value={item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("en-IN") : "-"} />
                </MobileCard>
              )}
            />
          </div>
        )}
      </DataTableShell>

      <BulkActionsBar
        selectedCount={selectedIds.size}
        totalCount={shifts.length}
        onClearSelection={() => setSelectedIds(new Set())}
        onActivate={() => handleBulkToggle(true)}
        onDeactivate={() => handleBulkToggle(false)}
        onExport={handleExportCsv}
        isProcessing={saving}
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={selected ? "Edit Shift" : "Add Shift"}
        description="Configure shift timing"
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : selected ? "Update" : "Create"}
      >
        <FormGrid>
          <InputField label="Shift Name" value={formData.shiftName} onChange={(value) => setFormData({ ...formData, shiftName: value })} placeholder="Morning Shift" required className="sm:col-span-2" />
          <InputField label="Start Time" value={formData.startTime} onChange={(value) => setFormData({ ...formData, startTime: value })} type="time" required />
          <InputField label="End Time" value={formData.endTime} onChange={(value) => setFormData({ ...formData, endTime: value })} type="time" required />
          {canSelectPlant ? (
            <AsyncSelect
              label="Plant"
              value={formData.plantId}
              onChange={(value) => setFormData({ ...formData, plantId: (value as string | null) || "" })}
              fetchFn={listPlants}
              labelExtractor={(plant) => `${plant.plantCode || "-"} - ${plant.plantName}`}
              valueExtractor={(plant) => plant.id}
              placeholder="Select plant"
              required
            />
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
        </FormGrid>
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selected?.shiftName || ""}>
        {selected && (
          <div className="space-y-6">
            <DetailSection title="Shift Details">
              <DetailRow label="Shift Name" value={selected.shiftName} />
              <DetailRow label="Start Time" value={selected.startTime} />
              <DetailRow label="End Time" value={selected.endTime} />
              <DetailRow label="Plant" value={getPlantLabel(selected.plantId)} />
              <DetailRow label="Status" value={selected.isActive ? "Active" : "Inactive"} />
            </DetailSection>
            <DetailSection title="Audit Trail">
              <AuditInfo createdAt={selected.createdAt} updatedAt={selected.updatedAt} />
            </DetailSection>
          </div>
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
    </PageShell>
  );
}
