import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AppSwitch } from "@/components/ui/app-switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, Save, Plus, Trash2, Eye, Send, Clock, CheckCircle, XCircle, Loader2, History, CalendarClock } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { createReportSchedule, deleteReportSchedule, listReportHistory, listReportSchedules, sendReportNow, updateReportSchedule, type ReportSchedule } from "@/api/reports";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { useMastersOptions } from "@/hooks/useMastersOptions";

const REPORT_SECTIONS = [
  { value: "work_orders", label: "Work Orders" },
  { value: "pm_schedules", label: "PM Schedules" },
  { value: "safety_incidents", label: "Safety Incidents" },
  { value: "assets", label: "Assets Summary" },
  { value: "inventory", label: "Spare Maintenance / Spare Items" },
  { value: "amc_contracts", label: "AMC Contracts" },
  { value: "calibration", label: "Calibration Records" },
  { value: "esg_metrics", label: "ESG Metrics" },
];

const FREQUENCIES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
];

const emptyForm = {
  reportName: "",
  description: "",
  frequency: "DAILY",
  sendTime: "08:00",
  recipients: "",
  isEnabled: true,
  reportSections: [] as string[],
  includeCharts: true,
  includeTables: true,
  includeDetailedLogs: false,
  plantId: "",
};

export default function EmailReportsMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();

  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [logs, setLogs] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ReportSchedule | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm, plantId: defaultPlantId });
  const [isEditing, setIsEditing] = useState(false);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const response = await listReportSchedules({
        page: 1,
        limit: 100,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setSchedules(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load report schedules");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (scheduleId: string) => {
    setLogsLoading(true);
    try {
      const response = await listReportHistory({
        page: 1,
        limit: 50,
        schedule_id: scheduleId,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setLogs(response.data as Array<Record<string, any>>);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load send history");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
    fetchSchedules();
  }, [defaultPlantId, canSelectPlant]);

  const getSectionLabel = (value: string) => REPORT_SECTIONS.find((section) => section.value === value)?.label || value;
  const getPlantName = (plantId: string | null) => plantsOptions.find((option) => option.value === plantId)?.label || "-";

  const handleAdd = () => {
    setFormData({ ...emptyForm, plantId: canSelectPlant ? "" : defaultPlantId });
    setIsEditing(false);
    setSelectedSchedule(null);
    setIsFormOpen(true);
  };

  const handleEdit = (schedule: ReportSchedule) => {
    setFormData({
      reportName: schedule.reportName,
      description: schedule.description || "",
      frequency: schedule.frequency,
      sendTime: schedule.sendTime || "08:00",
      recipients: (schedule.recipients || []).join(", "),
      isEnabled: schedule.isEnabled,
      reportSections: schedule.reportSections || [],
      includeCharts: schedule.includeCharts,
      includeTables: schedule.includeTables,
      includeDetailedLogs: schedule.includeDetailedLogs,
      plantId: schedule.plantId || (canSelectPlant ? "" : defaultPlantId),
    });
    setSelectedSchedule(schedule);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.reportName.trim()) {
      toast.error("Report name is required");
      return;
    }
    if (formData.reportSections.length === 0) {
      toast.error("Select at least one report section");
      return;
    }

    const recipients = formData.recipients.split(",").map((value) => value.trim()).filter(Boolean);
    if (recipients.length === 0) {
      toast.error("At least one recipient email is required");
      return;
    }

    const resolvedPlantId = canSelectPlant ? formData.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId) {
      toast.error("Plant is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        reportName: formData.reportName.trim(),
        description: formData.description.trim() || null,
        frequency: formData.frequency,
        sendTime: formData.sendTime || "08:00",
        recipients,
        isEnabled: formData.isEnabled,
        reportSections: formData.reportSections,
        includeCharts: formData.includeCharts,
        includeTables: formData.includeTables,
        includeDetailedLogs: formData.includeDetailedLogs,
        plantId: resolvedPlantId,
      };

      if (isEditing && selectedSchedule) {
        await updateReportSchedule(selectedSchedule.id, payload);
        toast.success("Schedule updated");
      } else {
        await createReportSchedule(payload);
        toast.success("Schedule created");
      }

      setIsFormOpen(false);
      await fetchSchedules();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSubmitting(true);
    try {
      await deleteReportSchedule(id);
      toast.success("Schedule deleted");
      await fetchSchedules();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (schedule: ReportSchedule, enabled: boolean) => {
    setSubmitting(true);
    try {
      await updateReportSchedule(schedule.id, { isEnabled: enabled });
      await fetchSchedules();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update status");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNow = async (scheduleId: string) => {
    setSubmitting(true);
    try {
      const response = await sendReportNow(scheduleId);
      toast.success(response.message || "Report send triggered");
      await fetchSchedules();
      if (selectedSchedule?.id === scheduleId && isHistoryOpen) {
        await fetchHistory(scheduleId);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to send report");
    } finally {
      setSubmitting(false);
    }
  };

  const handleHistory = async (schedule: ReportSchedule) => {
    setSelectedSchedule(schedule);
    setIsHistoryOpen(true);
    await fetchHistory(schedule.id);
  };

  const toggleSection = (section: string) => {
    setFormData((prev) => ({
      ...prev,
      reportSections: prev.reportSections.includes(section)
        ? prev.reportSections.filter((value) => value !== section)
        : [...prev.reportSections, section],
    }));
  };

  const stats = useMemo(() => {
    return {
      total: schedules.length,
      active: schedules.filter((schedule) => schedule.isEnabled).length,
      sent: schedules.filter((schedule) => !!schedule.lastSentAt).length,
      disabled: schedules.filter((schedule) => !schedule.isEnabled).length,
    };
  }, [schedules]);

  return (
    <div className="space-y-6">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Email Report Configuration</h1>
          <p className="text-muted-foreground">Configure automated email reports with schedule history</p>
        </div>
        <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow">
          <Plus className="h-4 w-4" />
          Add Report Schedule
        </Button>
      </motion.div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-card"><CardContent className="p-4"><div className="text-2xl font-bold text-primary">{stats.total}</div><p className="text-sm text-muted-foreground">Total Schedules</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4"><div className="text-2xl font-bold text-primary">{stats.active}</div><p className="text-sm text-muted-foreground">Active</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4"><div className="text-2xl font-bold text-accent-foreground">{stats.sent}</div><p className="text-sm text-muted-foreground">Sent At Least Once</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4"><div className="text-2xl font-bold text-muted-foreground">{stats.disabled}</div><p className="text-sm text-muted-foreground">Disabled</p></CardContent></Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Scheduled Reports ({schedules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : schedules.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No report schedules configured. Click "Add Report Schedule" to create one.</p>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-3">
                <div className="flex items-start gap-4 flex-1">
                  <AppSwitch checked={schedule.isEnabled} onCheckedChange={(checked) => handleToggleEnabled(schedule, checked)} aria-label={`${schedule.reportName} enabled`} />
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{schedule.reportName}</p>
                      <Badge variant={schedule.isEnabled ? "default" : "secondary"} className="text-xs">{schedule.frequency}</Badge>
                      <Badge variant="outline" className="text-xs">{getPlantName(schedule.plantId)}</Badge>
                    </div>
                    {schedule.description && <p className="text-sm text-muted-foreground">{schedule.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {(schedule.reportSections || []).map((section) => (
                        <Badge key={section} variant="outline" className="text-xs">{getSectionLabel(section)}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Send: {schedule.sendTime?.slice(0, 5) || "08:00"}</span>
                      <span>Recipients: {(schedule.recipients || []).length}</span>
                      {schedule.lastSentAt && (
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-primary" />Last sent: {formatDistanceToNow(new Date(schedule.lastSentAt), { addSuffix: true })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" title="View Details" onClick={() => { setSelectedSchedule(schedule); setIsViewOpen(true); }}><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Send History" onClick={() => handleHistory(schedule)}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Send Now" disabled={submitting} onClick={() => handleSendNow(schedule.id)}><Send className="h-4 w-4 text-primary" /></Button>
                  <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEdit(schedule)}><CalendarClock className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(schedule.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Report Schedule" : "Add Report Schedule"}</DialogTitle>
            <DialogDescription>Configure what data is included, recipients, and frequency</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report Name *</Label>
                <Input value={formData.reportName} onChange={(event) => setFormData({ ...formData, reportName: event.target.value })} placeholder="Daily Work Order Summary" />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={formData.frequency} onValueChange={(value) => setFormData({ ...formData, frequency: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((frequency) => <SelectItem key={frequency.value} value={frequency.value}>{frequency.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {canSelectPlant ? (
              <div className="space-y-2">
                <Label>Plant *</Label>
                <Select value={formData.plantId} onValueChange={(value) => setFormData({ ...formData, plantId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select plant" /></SelectTrigger>
                  <SelectContent>
                    {plantsOptions.map((plant) => (
                      <SelectItem key={plant.value} value={plant.value}>{plant.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Plant</Label>
                <Input value={getPlantName(defaultPlantId)} disabled />
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} placeholder="Brief description of this report" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Send Time</Label>
                <Input type="time" value={formData.sendTime} onChange={(event) => setFormData({ ...formData, sendTime: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Recipients (comma-separated emails)</Label>
                <Input value={formData.recipients} onChange={(event) => setFormData({ ...formData, recipients: event.target.value })} placeholder="user@example.com, admin@example.com" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Report Data Sections</Label>
              <p className="text-xs text-muted-foreground">Select which data sections to include in this report</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {REPORT_SECTIONS.map((section) => (
                  <div key={section.value} className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-accent/50" onClick={() => toggleSection(section.value)}>
                    <Checkbox checked={formData.reportSections.includes(section.value)} onCheckedChange={() => toggleSection(section.value)} />
                    <span className="text-sm">{section.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Include Options</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={formData.includeCharts} onCheckedChange={(value) => setFormData({ ...formData, includeCharts: !!value })} />
                  <span className="text-sm">Charts & Graphs</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={formData.includeTables} onCheckedChange={(value) => setFormData({ ...formData, includeTables: !!value })} />
                  <span className="text-sm">Summary Tables</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={formData.includeDetailedLogs} onCheckedChange={(value) => setFormData({ ...formData, includeDetailedLogs: !!value })} />
                  <span className="text-sm">Detailed Logs</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSchedule?.reportName}</DialogTitle>
            <DialogDescription>Report schedule details and data sections</DialogDescription>
          </DialogHeader>
          {selectedSchedule && (
            <div className="space-y-4">
              {selectedSchedule.description && <p className="text-sm text-muted-foreground">{selectedSchedule.description}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium text-muted-foreground">Frequency:</span> <span>{selectedSchedule.frequency}</span></div>
                <div><span className="font-medium text-muted-foreground">Send Time:</span> <span>{selectedSchedule.sendTime?.slice(0, 5)}</span></div>
                <div><span className="font-medium text-muted-foreground">Status:</span> <Badge variant={selectedSchedule.isEnabled ? "default" : "secondary"}>{selectedSchedule.isEnabled ? "Active" : "Disabled"}</Badge></div>
                <div><span className="font-medium text-muted-foreground">Plant:</span> <span>{getPlantName(selectedSchedule.plantId)}</span></div>
                <div><span className="font-medium text-muted-foreground">Charts:</span> <span>{selectedSchedule.includeCharts ? "Yes" : "No"}</span></div>
                <div><span className="font-medium text-muted-foreground">Tables:</span> <span>{selectedSchedule.includeTables ? "Yes" : "No"}</span></div>
                <div><span className="font-medium text-muted-foreground">Detailed Logs:</span> <span>{selectedSchedule.includeDetailedLogs ? "Yes" : "No"}</span></div>
              </div>

              <div>
                <p className="font-medium text-sm mb-2">Data Sections Included:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedSchedule.reportSections || []).map((section) => (
                    <Badge key={section} variant="outline">{getSectionLabel(section)}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-medium text-sm mb-2">Recipients:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedSchedule.recipients || []).map((recipient) => (
                    <Badge key={recipient} variant="secondary" className="text-xs">{recipient}</Badge>
                  ))}
                </div>
              </div>

              {selectedSchedule.lastSentAt && (
                <div className="rounded-md bg-accent/30 p-3 text-sm">
                  <span className="font-medium">Last Sent:</span> {format(new Date(selectedSchedule.lastSentAt), "PPpp")}
                  <span className="text-muted-foreground ml-2">({formatDistanceToNow(new Date(selectedSchedule.lastSentAt), { addSuffix: true })})</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send History: {selectedSchedule?.reportName}</DialogTitle>
            <DialogDescription>Recent email send logs</DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No send history yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{format(new Date(log.sentAt || log.sent_at), "PPpp")}</span>
                    <Badge variant={log.status === "SUCCESS" ? "default" : log.status === "PARTIAL" ? "secondary" : "destructive"} className="text-xs">
                      {log.status === "SUCCESS" ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {log.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Recipients: {(log.recipients || []).join(", ")} - Records: {log.recordsIncluded ?? log.records_included ?? 0}
                  </div>
                  {log.errorMessage && <p className="text-xs text-destructive">{log.errorMessage}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
