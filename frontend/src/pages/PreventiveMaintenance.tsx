import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Loader2, Play, Search, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { KPICard } from "@/components/dashboard/KPICard";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { SpareUsageEditor, type SpareUsageDraft } from "@/components/spares/SpareUsageEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { listSpareItems, type SpareItem, type SpareUsageItem } from "@/api/inventory";
import { listPMSchedules, updatePMSchedule, type PMChecklistTaskResult, type PMSchedule, type PMScheduleChecklist } from "@/api/pm";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

type DraftTask = PMChecklistTaskResult;

function normalizeChecklist(value: PMSchedule["checklist"]): PMScheduleChecklist {
  if (!value) return { checklistTasks: [], spareUsage: [] };
  if (typeof value === "string") {
    try {
      return normalizeChecklist(JSON.parse(value) as PMScheduleChecklist);
    } catch {
      return { checklistTasks: [], spareUsage: [] };
    }
  }
  return {
    ...value,
    checklistTasks: Array.isArray(value.checklistTasks) ? value.checklistTasks : [],
    spareUsage: Array.isArray(value.spareUsage) ? value.spareUsage : [],
  };
}

function buildSpareUsagePayload(rows: SpareUsageDraft[], availableSpares: SpareItem[]): SpareUsageItem[] {
  return rows
    .map((row) => {
      const quantity = Number(row.quantity);
      if (!row.spareItemId || !Number.isFinite(quantity) || quantity <= 0) return null;
      const match = availableSpares.find((item) => item.id === row.spareItemId);
      if (!match) return null;
      return {
        spareItemId: match.id,
        quantity,
        spareCode: match.code,
        spareName: match.name,
      };
    })
    .filter((item): item is SpareUsageItem => Boolean(item));
}

function statusVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "active" as const;
    case "IN_PROGRESS":
      return "info" as const;
    case "OVERDUE":
      return "critical" as const;
    default:
      return "warning" as const;
  }
}

function taskStatusVariant(status: string) {
  switch (status) {
    case "DONE":
      return "active" as const;
    case "ISSUE_FOUND":
      return "critical" as const;
    case "SKIPPED":
      return "warning" as const;
    default:
      return "info" as const;
  }
}

async function filesToDataUrls(files: FileList | null) {
  if (!files || files.length === 0) return [] as Array<{ name: string; dataUrl: string }>;
  const readers = Array.from(files).map(
    (file) =>
      new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result || "") });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }),
  );
  return Promise.all(readers);
}

export default function PreventiveMaintenance() {
  const queryClient = useQueryClient();
  const { activePlantId } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState<PMSchedule | null>(null);
  const [draftTasks, setDraftTasks] = useState<DraftTask[]>([]);
  const [draftSpareUsage, setDraftSpareUsage] = useState<SpareUsageDraft[]>([]);
  const [executionNotes, setExecutionNotes] = useState("");
  const [savingState, setSavingState] = useState<"idle" | "progress" | "complete">("idle");

  const schedulesQuery = useQuery({
    queryKey: ["pm_schedules", activePlantId],
    queryFn: async () => (await listPMSchedules({ page: 1, limit: 1000, plantId: activePlantId || undefined })).data || [],
  });

  const schedules = useMemo(() => schedulesQuery.data || [], [schedulesQuery.data]);

  const availableSparesQuery = useQuery({
    queryKey: ["pm_task_spares", selectedTask?.id, selectedTask?.plantId, selectedTask?.assetId],
    enabled: Boolean(selectedTask?.plantId),
    queryFn: async () => {
      const response = await listSpareItems({ page: 1, limit: 1000, plantId: selectedTask?.plantId || undefined, includeInactive: false });
      return (response.data || []).filter((item) => !item.assetId || item.assetId === selectedTask?.assetId);
    },
  });

  const availableSpares = useMemo(() => availableSparesQuery.data || [], [availableSparesQuery.data]);
  const spareOptions = useMemo(
    () => availableSpares.map((item) => ({ value: item.id, label: `${item.code} - ${item.name} (${item.currentStock})` })),
    [availableSpares],
  );

  const filteredSchedules = useMemo(() => {
    return schedules.filter((item) => {
      const target = [item.pmId, item.asset?.code, item.asset?.name, item.template?.templateName, item.maintenanceType, item.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = searchQuery.trim().length === 0 || target.includes(searchQuery.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesType = typeFilter === "all" || item.maintenanceType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [schedules, searchQuery, statusFilter, typeFilter]);

  const overdueCount = filteredSchedules.filter((item) => item.status !== "COMPLETED" && new Date(item.nextDue) < new Date()).length;
  const inProgressCount = filteredSchedules.filter((item) => item.status === "IN_PROGRESS").length;
  const completedCount = filteredSchedules.filter((item) => item.status === "COMPLETED").length;

  const openTaskDialog = (task: PMSchedule) => {
    const checklist = normalizeChecklist(task.checklist);
    setSelectedTask(task);
    setDraftTasks(
      (checklist.checklistTasks || []).map((entry, index) => ({
        id: entry.id || `task-${index + 1}`,
        title: entry.title,
        taskStatus: entry.taskStatus || "PENDING",
        condition: entry.condition || "NORMAL",
        remarks: entry.remarks || "",
        photos: Array.isArray(entry.photos) ? entry.photos : [],
      })),
    );
    setDraftSpareUsage(
      (checklist.spareUsage || []).map((item) => ({
        spareItemId: String(item.spareItemId || ""),
        quantity: String(item.quantity || ""),
      })),
    );
    setExecutionNotes("");
  };

  const closeTaskDialog = () => {
    setSelectedTask(null);
    setDraftTasks([]);
    setDraftSpareUsage([]);
    setExecutionNotes("");
    setSavingState("idle");
  };

  const updateDraftTask = (index: number, patch: Partial<DraftTask>) => {
    setDraftTasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const handleUploadPhotos = async (index: number, files: FileList | null) => {
    try {
      const nextPhotos = await filesToDataUrls(files);
      setDraftTasks((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? { ...item, photos: [...item.photos, ...nextPhotos] } : item)),
      );
    } catch {
      toast.error("Failed to load selected photo.");
    }
  };

  const persistTask = async (mode: "progress" | "complete") => {
    if (!selectedTask) return;
    setSavingState(mode);
    try {
      const currentChecklist = normalizeChecklist(selectedTask.checklist);
      const nextChecklist: PMScheduleChecklist = {
        ...currentChecklist,
        checklistTasks: draftTasks,
        technicianRemarks: executionNotes,
        spareUsage: buildSpareUsagePayload(draftSpareUsage, availableSpares),
      } as PMScheduleChecklist & { technicianRemarks: string };

      const payload: Record<string, unknown> = {
        checklist: nextChecklist,
        status: mode === "complete" ? "COMPLETED" : selectedTask.status === "SCHEDULED" ? "IN_PROGRESS" : selectedTask.status,
      };

      if (mode === "complete") {
        const nowIso = new Date().toISOString();
        payload.last_completed = nowIso;
        payload.completed_at = nowIso;
      }

      await updatePMSchedule(selectedTask.id, payload);
      await queryClient.invalidateQueries({ queryKey: ["pm_schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["spare-maintenance-items"] });
      toast.success(mode === "complete" ? "PM task completed." : "PM task progress saved.");
      closeTaskDialog();
    } catch (error: unknown) {
      toast.error(typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "Failed to update PM task.");
    } finally {
      setSavingState("idle");
    }
  };

  const columns = [
    { key: "pmId", header: "PM ID", render: (item: PMSchedule) => <span className="font-medium">{item.pmId}</span> },
    { key: "asset", header: "Asset", render: (item: PMSchedule) => <div><p className="font-medium">{item.asset?.code || "-"}</p><p className="text-xs text-muted-foreground">{item.asset?.name || "Unassigned asset"}</p></div> },
    { key: "template", header: "Template", render: (item: PMSchedule) => item.template?.templateName || normalizeChecklist(item.checklist).taskSummary || "-", hideOnMobile: true },
    { key: "type", header: "Maintenance Type", render: (item: PMSchedule) => <StatusBadge variant={item.maintenanceType === "PD" ? "info" : "primary"}>{item.maintenanceType}</StatusBadge> },
    { key: "due", header: "Due Date", render: (item: PMSchedule) => <div><p className="font-medium">{format(new Date(item.nextDue), "dd MMM yyyy, hh:mm a")}</p><p className="text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(item.nextDue), { addSuffix: true })}</p></div> },
    { key: "status", header: "Status", render: (item: PMSchedule) => <StatusBadge variant={statusVariant(item.status)}>{item.status.replace(/_/g, " ")}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      render: (item: PMSchedule) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openTaskDialog(item)}>
            {item.status === "COMPLETED" ? <ClipboardCheck className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {item.status === "COMPLETED" ? "View" : "Open Task"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="PM / PD Tasks"
        subtitle="Generated asset-based preventive and predictive maintenance tasks with technician checklist execution."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Scheduled Tasks" value={filteredSchedules.length} subtitle="Live PM/PD task queue" icon={Wrench} variant="primary" />
        <KPICard title="Overdue" value={overdueCount} subtitle="Past due and still open" icon={AlertTriangle} variant="destructive" />
        <KPICard title="In Progress" value={inProgressCount} subtitle="Technicians actively working" icon={Clock3} variant="info" />
        <KPICard title="Completed" value={completedCount} subtitle="Tasks closed after execution" icon={CheckCircle2} variant="success" />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          <FilterToolbar
            search={
              <>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search PM ID, asset, template..." className="h-10 pl-9" />
              </>
            }
            filters={
              <>
                <div className="w-full sm:w-[170px]">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-[170px]">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Maintenance Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                      <SelectItem value="PD">PD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Scheduled Maintenance Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {schedulesQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <ResponsiveTable
              data={filteredSchedules}
              columns={columns}
              keyExtractor={(item) => item.id}
              emptyMessage="No PM/PD tasks found for the selected filters."
              mobileCard={(item) => (
                <MobileCard onView={() => openTaskDialog(item)}>
                  <MobileCardHeader title={item.pmId} subtitle={item.asset?.name || item.template?.templateName || "Scheduled task"} badge={<StatusBadge variant={statusVariant(item.status)}>{item.status}</StatusBadge>} />
                  <MobileCardRow label="Asset" value={item.asset?.code || "-"} />
                  <MobileCardRow label="Template" value={item.template?.templateName || "-"} />
                  <MobileCardRow label="Type" value={item.maintenanceType} />
                  <MobileCardRow label="Due Date" value={format(new Date(item.nextDue), "dd MMM yyyy, hh:mm a")} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) closeTaskDialog(); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto sm:max-w-[1080px]">
          <DialogHeader>
            <DialogTitle>{selectedTask?.pmId || "PM Task"}</DialogTitle>
            <DialogDescription>
              {selectedTask?.asset?.code || "-"} • {selectedTask?.template?.templateName || normalizeChecklist(selectedTask?.checklist || null).taskSummary || "Maintenance task"}
            </DialogDescription>
          </DialogHeader>

          {selectedTask ? (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Asset</p>
                  <p className="font-medium">{selectedTask.asset?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Template</p>
                  <p className="font-medium">{selectedTask.template?.templateName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Assigned Team</p>
                  <p className="font-medium">{selectedTask.assignedTeam?.teamName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Responsible User</p>
                  <p className="font-medium">{selectedTask.responsibleUser?.fullName || "-"}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Checklist Execution</p>
                  <p className="text-sm text-muted-foreground">Technicians can update task status, condition, remarks, and attach field photos.</p>
                </div>
                {draftTasks.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-6 text-sm text-muted-foreground">No checklist tasks were generated for this PM task.</CardContent>
                  </Card>
                ) : (
                  draftTasks.map((task, index) => (
                    <Card key={task.id} className="border-border/70">
                      <CardContent className="space-y-4 pt-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">{index + 1}. {task.title}</p>
                            <p className="text-xs text-muted-foreground">Execution item for this maintenance activity.</p>
                          </div>
                          <StatusBadge variant={taskStatusVariant(task.taskStatus)}>{task.taskStatus.replace(/_/g, " ")}</StatusBadge>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Task Status</Label>
                            <Select value={task.taskStatus} onValueChange={(value) => updateDraftTask(index, { taskStatus: value })} disabled={selectedTask.status === "COMPLETED"}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PENDING">Pending</SelectItem>
                                <SelectItem value="DONE">Done</SelectItem>
                                <SelectItem value="ISSUE_FOUND">Issue Found</SelectItem>
                                <SelectItem value="SKIPPED">Skipped</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Condition</Label>
                            <Select value={task.condition} onValueChange={(value) => updateDraftTask(index, { condition: value })} disabled={selectedTask.status === "COMPLETED"}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NORMAL">Normal</SelectItem>
                                <SelectItem value="ATTENTION_REQUIRED">Attention Required</SelectItem>
                                <SelectItem value="CRITICAL">Critical</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Remarks</Label>
                          <Textarea value={task.remarks} onChange={(event) => updateDraftTask(index, { remarks: event.target.value })} disabled={selectedTask.status === "COMPLETED"} placeholder="Add execution remarks, readings, or observations..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Photo Upload</Label>
                          <Input type="file" accept="image/*" multiple disabled={selectedTask.status === "COMPLETED"} onChange={(event) => void handleUploadPhotos(index, event.target.files)} />
                          {task.photos.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              {task.photos.map((photo, photoIndex) => (
                                <div key={`${photo.name}-${photoIndex}`} className="overflow-hidden rounded-lg border">
                                  <img src={photo.dataUrl} alt={photo.name} className="h-28 w-full object-cover" />
                                  <div className="flex items-center justify-between gap-2 p-2">
                                    <p className="truncate text-xs">{photo.name}</p>
                                    {selectedTask.status !== "COMPLETED" ? (
                                      <Button variant="ghost" size="sm" onClick={() => updateDraftTask(index, { photos: task.photos.filter((_, idx) => idx !== photoIndex) })}>Remove</Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Spares Used</p>
                  <p className="text-sm text-muted-foreground">Any spares recorded here will reduce stock automatically when the task is completed.</p>
                </div>
                <SpareUsageEditor rows={draftSpareUsage} onChange={setDraftSpareUsage} options={spareOptions} />
              </div>

              <div className="space-y-2">
                <Label>Execution Summary</Label>
                <Textarea value={executionNotes} onChange={(event) => setExecutionNotes(event.target.value)} disabled={selectedTask.status === "COMPLETED"} placeholder="Overall technician notes, escalation details, and completion summary..." />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeTaskDialog}>Close</Button>
            {selectedTask?.status !== "COMPLETED" ? (
              <>
                <Button variant="outline" disabled={savingState !== "idle"} onClick={() => void persistTask("progress")}>
                  {savingState === "progress" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Progress
                </Button>
                <Button className="gradient-primary text-primary-foreground" disabled={savingState !== "idle"} onClick={() => void persistTask("complete")}>
                  {savingState === "complete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Complete Task
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
