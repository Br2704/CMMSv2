import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { KPICard } from "@/components/dashboard/KPICard";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { listPlants, type Plant } from "@/api/plants";
import {
  listCalibrationTasks,
  updateCalibrationTask,
  type CalibrationChecklistResult,
  type CalibrationTask,
} from "@/api/calibration";
import { isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

type TaskFormState = {
  status: string;
  remarks: string;
  checklist: CalibrationChecklistResult[];
  certificateUpload: { name: string; dataUrl: string } | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function statusVariant(status: string) {
  if (status === "COMPLETED") return "active" as const;
  if (status === "IN_PROGRESS") return "info" as const;
  if (status === "OVERDUE") return "critical" as const;
  return "warning" as const;
}

export default function Calibration() {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedTask, setSelectedTask] = useState<CalibrationTask | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormState>({ status: "SCHEDULED", remarks: "", checklist: [], certificateUpload: null });

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;
  const assetIdFilter = searchParams.get("assetId") || "";

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

  const loadTasks = useCallback(async () => {
    if (canSelectPlant && !resolvedPlantId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await listCalibrationTasks({
        page: 1,
        limit: 500,
        plantId: resolvedPlantId || undefined,
        assetId: assetIdFilter || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchQuery || undefined,
      });
      setTasks(response.data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load calibration tasks"));
    } finally {
      setLoading(false);
    }
  }, [assetIdFilter, canSelectPlant, resolvedPlantId, searchQuery, statusFilter]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const plantOptions = useMemo(
    () => plants.filter((plant) => plant.isActive ?? true).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
    [plants],
  );

  const stats = useMemo(() => {
    const overdue = tasks.filter((task) => task.status === "OVERDUE").length;
    const completed = tasks.filter((task) => task.status === "COMPLETED").length;
    const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS").length;
    const scheduled = tasks.filter((task) => task.status === "SCHEDULED").length;
    return { total: tasks.length, overdue, completed, inProgress, scheduled };
  }, [tasks]);

  const openTask = (task: CalibrationTask) => {
    setSelectedTask(task);
    setFormData({
      status: task.status,
      remarks: task.remarks || "",
      checklist: task.checklist || [],
      certificateUpload: task.certificateUpload,
    });
    setIsFormOpen(true);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      setFormData((current) => ({ ...current, certificateUpload: { name: file.name, dataUrl } }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to read certificate"));
    }
  };

  const handleSubmit = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await updateCalibrationTask(selectedTask.id, {
        status: formData.status,
        remarks: formData.remarks.trim() || null,
        checklist: formData.checklist,
        certificateUpload: formData.certificateUpload,
      });
      toast.success("Calibration task updated");
      setIsFormOpen(false);
      await loadTasks();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update calibration task"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "id",
      header: "CAL ID",
      render: (item: CalibrationTask) => (
        <div>
          <p className="font-medium text-primary">{item.calibrationId}</p>
          <p className="text-xs text-muted-foreground">{item.calibrationType}</p>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Asset",
      render: (item: CalibrationTask) => (
        <div>
          <p className="font-medium">{item.asset?.code || "-"}</p>
          <p className="text-xs text-muted-foreground">{item.asset?.name || "-"}</p>
        </div>
      ),
    },
    {
      key: "instrument",
      header: "Instrument",
      render: (item: CalibrationTask) => (
        <div>
          <p>{item.instrument?.instrumentName || "-"}</p>
          <p className="text-xs text-muted-foreground">{item.instrument?.serialNumber || item.instrument?.instrumentType || "-"}</p>
        </div>
      ),
    },
    { key: "template", header: "Template", render: (item: CalibrationTask) => item.template?.templateName || "-", hideOnMobile: true },
    {
      key: "due",
      header: "Due Date",
      render: (item: CalibrationTask) => (
        <div>
          <p className="text-sm font-medium">{format(new Date(item.dueDate), "dd MMM yyyy")}</p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.dueDate), { addSuffix: true })}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (item: CalibrationTask) => <StatusBadge variant={statusVariant(item.status)}>{item.status.replace(/_/g, " ")}</StatusBadge> },
    { key: "actions", header: "Action", render: (item: CalibrationTask) => <Button variant="outline" size="sm" onClick={() => openTask(item)}>Open Task</Button> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Calibration Tasks</h1>
          <p className="text-sm text-muted-foreground">Execute due instrument calibrations and capture results against each machine-linked instrument.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Tasks" value={stats.total} subtitle="scheduled instruments" icon={Gauge} variant="primary" />
        <KPICard title="Completed" value={stats.completed} subtitle="closed calibrations" icon={CheckCircle2} variant="success" />
        <KPICard title="In Progress" value={stats.inProgress} subtitle="technician working" icon={Wrench} variant="info" />
        <KPICard title="Overdue" value={stats.overdue} subtitle="needs attention" icon={AlertTriangle} variant="destructive" />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <FilterToolbar
            search={<><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" placeholder="Search task, machine, instrument..." /></>}
            filters={
              <div className="grid w-full gap-3 sm:grid-cols-2">
                {canSelectPlant ? <SelectField label="" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" /> : null}
                <SelectField label="" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "All status" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "OVERDUE", label: "Overdue" }, { value: "COMPLETED", label: "Completed" }]} placeholder="Select status" />
              </div>
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base sm:text-lg font-semibold">Calibration Queue ({tasks.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
            <ResponsiveTable
              data={tasks}
              columns={columns}
              keyExtractor={(item: CalibrationTask) => item.id}
              emptyMessage="No calibration tasks found for the selected filters."
              mobileCard={(item: CalibrationTask) => (
                <MobileCard onEdit={() => openTask(item)}>
                  <MobileCardHeader title={item.calibrationId} subtitle={item.instrument?.instrumentName || "-"} badge={<StatusBadge variant={statusVariant(item.status)}>{item.status.replace(/_/g, " ")}</StatusBadge>} />
                  <MobileCardRow label="Machine" value={item.asset?.code || "-"} />
                  <MobileCardRow label="Due" value={format(new Date(item.dueDate), "dd MMM yyyy")} />
                  <MobileCardRow label="Template" value={item.template?.templateName || "-"} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={selectedTask?.calibrationId || "Calibration Task"} description="Capture reference values, measured values, pass/fail, and certificate details." onSubmit={handleSubmit} submitLabel={saving ? "Saving..." : "Update Task"} size="xl">
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField label="Machine" value={selectedTask?.asset ? `${selectedTask.asset.code} - ${selectedTask.asset.name}` : ""} onChange={() => {}} disabled />
          <InputField label="Instrument" value={selectedTask?.instrument ? `${selectedTask.instrument.instrumentName}${selectedTask.instrument.serialNumber ? ` (${selectedTask.instrument.serialNumber})` : ""}` : ""} onChange={() => {}} disabled />
          <InputField label="Template" value={selectedTask?.template?.templateName || ""} onChange={() => {}} disabled />
          <InputField label="Due Date" value={selectedTask?.dueDate ? format(new Date(selectedTask.dueDate), "dd MMM yyyy hh:mm a") : ""} onChange={() => {}} disabled />
          <SelectField label="Task Status" value={formData.status} onChange={(value) => setFormData((current) => ({ ...current, status: value }))} options={[{ value: "SCHEDULED", label: "Scheduled" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "COMPLETED", label: "Completed" }, { value: "OVERDUE", label: "Overdue" }]} required />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Checklist Readings</p>
          {formData.checklist.length === 0 ? <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">No checklist tasks linked to this calibration template.</div> : formData.checklist.map((item, index) => (
            <div key={item.id || index} className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-medium">{item.title}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={item.taskStatus} onChange={(event) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, taskStatus: event.target.value } : task) }))}>
                    <option value="PENDING">Pending</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="RECHECK">Recheck</option>
                  </select>
                  <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={item.passFail} onChange={(event) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, passFail: event.target.value } : task) }))}>
                    <option value="PENDING">Pending</option>
                    <option value="PASS">Pass</option>
                    <option value="FAIL">Fail</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Input value={item.referenceValue} onChange={(event) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, referenceValue: event.target.value } : task) }))} placeholder="Reference value" />
                <Input value={item.measuredValue} onChange={(event) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, measuredValue: event.target.value, deviation: task.referenceValue && event.target.value ? String(Number(event.target.value) - Number(task.referenceValue)) : task.deviation } : task) }))} placeholder="Measured value" />
                <Input value={item.deviation} onChange={(event) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, deviation: event.target.value } : task) }))} placeholder="Deviation" />
              </div>
              <TextareaField label="Remarks" value={item.remarks} onChange={(value) => setFormData((current) => ({ ...current, checklist: current.checklist.map((task, taskIndex) => taskIndex === index ? { ...task, remarks: value } : task) }))} placeholder="Observation, adjustment, or seal note" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Certificate Upload</label>
            <Input type="file" accept=".pdf,image/*" onChange={(event) => { void handleUpload(event.target.files); }} />
            <p className="text-xs text-muted-foreground">{formData.certificateUpload ? `Attached: ${formData.certificateUpload.name}` : "Upload calibration certificate or proof image."}</p>
          </div>
          <TextareaField label="Overall Remarks" value={formData.remarks} onChange={(value) => setFormData((current) => ({ ...current, remarks: value }))} placeholder="Final calibration summary, seal number, or handover note" />
        </div>
      </FormDialog>
    </div>
  );
}
