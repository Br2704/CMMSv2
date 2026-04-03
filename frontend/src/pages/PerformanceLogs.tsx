import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { listPlants } from "@/api/plants";
import { listDepartments } from "@/api/departments";
import { listModules } from "@/api/modules";
import { listAssets } from "@/api/assets";
import {
  createPerformanceLog,
  deletePerformanceLog,
  listPerformanceLogs,
  updatePerformanceLog,
  type PerformanceLog,
  type PerformanceLogPayload,
} from "@/api/performanceLogs";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField, InputField, TextareaField } from "@/components/shared/FormField";
import { FormDialog } from "@/components/shared/FormDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

interface SelectOption {
  value: string;
  label: string;
}

interface FormState {
  plantId: string;
  departmentId: string;
  moduleId: string;
  assetId: string;
  capturedAt: string;
  runtimeHours: string;
  energyKwh: string;
  productionOutput: string;
  efficiencyValue: string;
  efficiencyUnit: string;
  notes: string;
}

const emptyForm: FormState = {
  plantId: "",
  departmentId: "",
  moduleId: "",
  assetId: "",
  capturedAt: new Date().toISOString().slice(0, 16),
  runtimeHours: "",
  energyKwh: "",
  productionOutput: "",
  efficiencyValue: "",
  efficiencyUnit: "",
  notes: "",
};

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function PerformanceLogs() {
  const { user, activePlantId } = useAuthStore();
  const userIsSuperAdmin = isSuperAdmin(user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [plants, setPlants] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [modules, setModules] = useState<SelectOption[]>([]);
  const [assets, setAssets] = useState<SelectOption[]>([]);

  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<PerformanceLog | null>(null);
  const [deleting, setDeleting] = useState<PerformanceLog | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const selectedPlantId = useMemo(() => (userIsSuperAdmin ? form.plantId : activePlantId || ""), [form.plantId, userIsSuperAdmin, activePlantId]);

  const fetchLogs = async (requestedPage = page) => {
    setLoading(true);
    try {
      const response = await listPerformanceLogs({
        page: requestedPage,
        limit: 20,
        search: search || undefined,
        plantId: userIsSuperAdmin ? undefined : activePlantId || undefined,
      });
      setLogs(response.data || []);
      setTotalPages(response.pagination?.totalPages || 1);
      setPage(response.pagination?.page || requestedPage);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load performance logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlants = async () => {
    if (!userIsSuperAdmin) return;
    try {
      const response = await listPlants({ page: 1, limit: 200 });
      setPlants((response.data || []).map((item) => ({ value: item.id, label: `${item.plantCode} - ${item.plantName}` })));
    } catch {
      setPlants([]);
    }
  };

  const fetchDepartments = async (plantId: string) => {
    if (!plantId) {
      setDepartments([]);
      return;
    }
    try {
      const response = await listDepartments({ page: 1, limit: 200, plantId });
      setDepartments((response.data || []).map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` })));
    } catch {
      setDepartments([]);
    }
  };

  const fetchModules = async (plantId: string, departmentId: string) => {
    if (!plantId || !departmentId) {
      setModules([]);
      return;
    }
    try {
      const response = await listModules({ page: 1, limit: 200, plantId, departmentId });
      setModules((response.data || []).map((item) => ({ value: item.id, label: `${item.code || item.name} - ${item.name}` })));
    } catch {
      setModules([]);
    }
  };

  const fetchAssets = async (plantId: string, departmentId: string, moduleId: string) => {
    if (!plantId || !departmentId || !moduleId) {
      setAssets([]);
      return;
    }
    try {
      const response = await listAssets({ page: 1, limit: 200, plantId, departmentId, moduleId });
      setAssets((response.data || []).map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` })));
    } catch {
      setAssets([]);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [search]);

  useEffect(() => {
    fetchPlants();
  }, []);

  useEffect(() => {
    if (selectedPlantId) {
      fetchDepartments(selectedPlantId);
    }
  }, [selectedPlantId]);

  useEffect(() => {
    fetchModules(selectedPlantId, form.departmentId);
  }, [selectedPlantId, form.departmentId]);

  useEffect(() => {
    fetchAssets(selectedPlantId, form.departmentId, form.moduleId);
  }, [selectedPlantId, form.departmentId, form.moduleId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, plantId: userIsSuperAdmin ? "" : activePlantId || "" });
    setOpen(true);
  };

  const openEdit = (row: PerformanceLog) => {
    setEditing(row);
    setForm({
      plantId: row.plantId,
      departmentId: "",
      moduleId: "",
      assetId: row.assetId,
      capturedAt: row.capturedAt.slice(0, 16),
      runtimeHours: row.runtimeHours || "",
      energyKwh: row.energyKwh || "",
      productionOutput: row.productionOutput || "",
      efficiencyValue: row.efficiencyValue || "",
      efficiencyUnit: row.efficiencyUnit || "",
      notes: row.notes || "",
    });
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!selectedPlantId || !form.assetId || !form.capturedAt) {
      toast.error("Plant, machine and captured time are required");
      return;
    }

    const payload: PerformanceLogPayload = {
      plantId: selectedPlantId,
      assetId: form.assetId,
      capturedAt: new Date(form.capturedAt).toISOString(),
      runtimeHours: parseNumber(form.runtimeHours),
      energyKwh: parseNumber(form.energyKwh),
      productionOutput: parseNumber(form.productionOutput),
      efficiencyValue: parseNumber(form.efficiencyValue),
      efficiencyUnit: form.efficiencyUnit.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await updatePerformanceLog(editing.id, payload);
        toast.success("Performance log updated");
      } else {
        await createPerformanceLog(payload);
        toast.success("Performance log created");
      }
      setOpen(false);
      await fetchLogs(1);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save performance log");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await deletePerformanceLog(deleting.id);
      toast.success("Performance log deleted");
      setDeleteOpen(false);
      await fetchLogs(page);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete performance log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Performance Logs</h1>
          <p className="text-sm text-muted-foreground">Capture machine performance metrics for benchmarking.</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add Log</Button>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <Input placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" onClick={() => fetchLogs(1)}>Search</Button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading logs...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Captured At</th>
                    <th className="py-2">Plant</th>
                    <th className="py-2">Asset</th>
                    <th className="py-2">Runtime</th>
                    <th className="py-2">Energy</th>
                    <th className="py-2">Efficiency</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2">{new Date(row.capturedAt).toLocaleString()}</td>
                      <td className="py-2">{row.plantId}</td>
                      <td className="py-2">{row.assetId}</td>
                      <td className="py-2">{row.runtimeHours || "-"}</td>
                      <td className="py-2">{row.energyKwh || "-"}</td>
                      <td className="py-2">{row.efficiencyValue ? `${row.efficiencyValue} ${row.efficiencyUnit || ""}` : "-"}</td>
                      <td className="py-2 text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setDeleting(row); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No logs found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
            <div className="space-x-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchLogs(page - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit Performance Log" : "Add Performance Log"}
        onSubmit={onSubmit}
        submitLabel={editing ? "Update" : "Create"}
        isLoading={saving}
        size="lg"
      >
        {userIsSuperAdmin && (
          <SelectField
            label="Plant"
            required
            value={form.plantId}
            onChange={(value) => setForm((prev) => ({ ...prev, plantId: value, departmentId: "", moduleId: "", assetId: "" }))}
            options={plants}
            placeholder="Select plant"
          />
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <SelectField
            label="Department"
            required
            value={form.departmentId}
            onChange={(value) => setForm((prev) => ({ ...prev, departmentId: value, moduleId: "", assetId: "" }))}
            options={departments}
            placeholder="Select department"
          />
          <SelectField
            label="Module"
            required
            value={form.moduleId}
            onChange={(value) => setForm((prev) => ({ ...prev, moduleId: value, assetId: "" }))}
            options={modules}
            placeholder="Select module"
          />
        </div>

        <SelectField label="Machine" required value={form.assetId} onChange={(value) => setForm((prev) => ({ ...prev, assetId: value }))} options={assets} />

        <InputField label="Captured At" required type="text" value={form.capturedAt} onChange={(value) => setForm((prev) => ({ ...prev, capturedAt: value }))} hint="Use YYYY-MM-DDTHH:mm format" />

        <div className="grid md:grid-cols-2 gap-3">
          <InputField label="Runtime Hours" type="number" value={form.runtimeHours} onChange={(value) => setForm((prev) => ({ ...prev, runtimeHours: value }))} />
          <InputField label="Energy (kWh)" type="number" value={form.energyKwh} onChange={(value) => setForm((prev) => ({ ...prev, energyKwh: value }))} />
          <InputField label="Production Output" type="number" value={form.productionOutput} onChange={(value) => setForm((prev) => ({ ...prev, productionOutput: value }))} />
          <InputField label="Efficiency Value" type="number" value={form.efficiencyValue} onChange={(value) => setForm((prev) => ({ ...prev, efficiencyValue: value }))} />
          <InputField label="Efficiency Unit" value={form.efficiencyUnit} onChange={(value) => setForm((prev) => ({ ...prev, efficiencyUnit: value }))} />
        </div>

        <TextareaField label="Notes" value={form.notes} onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))} />
      </FormDialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Performance Log"
        description="This will soft delete the selected performance log."
        itemName={deleting?.id}
        onConfirm={onDelete}
        isLoading={saving}
      />
    </div>
  );
}
