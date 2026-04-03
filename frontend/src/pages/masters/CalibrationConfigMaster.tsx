import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, SwitchField, TextareaField } from "@/components/shared/FormField";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import BackButton from "@/components/masters/BackButton";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createCalibrationSchedule,
  createCalibrationTemplate,
  deleteCalibrationSchedule,
  deleteCalibrationTemplate,
  listCalibrationSchedules,
  listCalibrationTemplates,
  listMachineInstruments,
  updateCalibrationSchedule,
  updateCalibrationTemplate,
  type CalibrationSchedule,
  type CalibrationSchedulePayload,
  type CalibrationTemplate,
  type CalibrationTemplatePayload,
  type MachineInstrument,
} from "@/api/calibration";
import { listAssets, type Asset } from "@/api/assets";
import { listDepartments, type Department } from "@/api/departments";
import { listModules, type MachineModule } from "@/api/modules";
import { listMaintenanceTeams, type MaintenanceTeam } from "@/api/maintenanceTeams";
import { listPlants, type Plant } from "@/api/plants";
import { isAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { CalendarClock, Edit, Gauge, Link2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TemplateFormState = {
  plantId: string;
  templateName: string;
  instrumentType: string;
  calibrationMethod: string;
  tolerance: string;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: string;
  estimatedDuration: string;
  responsibleTeamId: string;
  checklistTasks: string;
  isActive: boolean;
};

type ScheduleFormState = {
  plantId: string;
  departmentId: string;
  moduleId: string;
  assetId: string;
  instrumentId: string;
  templateId: string;
  startDate: string;
  assignedTeamId: string;
  calibrationType: string;
  isActive: boolean;
};

const emptyTemplateForm = (plantId: string): TemplateFormState => ({
  plantId,
  templateName: "",
  instrumentType: "",
  calibrationMethod: "",
  tolerance: "",
  frequencyType: "MONTH",
  frequencyValue: "1",
  estimatedDuration: "60",
  responsibleTeamId: "",
  checklistTasks: "",
  isActive: true,
});

const toLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const emptyScheduleForm = (plantId: string): ScheduleFormState => ({
  plantId,
  departmentId: "",
  moduleId: "",
  assetId: "",
  instrumentId: "",
  templateId: "",
  startDate: toLocalDateTime(),
  assignedTeamId: "",
  calibrationType: "INTERNAL",
  isActive: true,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function linesToArray(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function formatFrequency(type: string, value: number) {
  return `Every ${value} ${type.toLowerCase()}${value > 1 ? "s" : ""}`;
}

export default function CalibrationConfigMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<MachineModule[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<MaintenanceTeam[]>([]);
  const [instruments, setInstruments] = useState<MachineInstrument[]>([]);
  const [templates, setTemplates] = useState<CalibrationTemplate[]>([]);
  const [schedules, setSchedules] = useState<CalibrationSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedTemplate, setSelectedTemplate] = useState<CalibrationTemplate | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<CalibrationSchedule | null>(null);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"template" | "schedule">("template");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(emptyTemplateForm(defaultPlantId));
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(emptyScheduleForm(defaultPlantId));

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;

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

  const loadData = useCallback(async () => {
    if (canSelectPlant && !resolvedPlantId) {
      setTemplates([]);
      setSchedules([]);
      setDepartments([]);
      setModules([]);
      setAssets([]);
      setTeams([]);
      setInstruments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [templateRes, scheduleRes, departmentRes, moduleRes, assetRes, teamRes, instrumentRes] = await Promise.all([
        listCalibrationTemplates({ page: 1, limit: 300, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
        listCalibrationSchedules({ page: 1, limit: 500, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
        listDepartments({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: false }),
        listModules({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: false }),
        listAssets({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: false }),
        listMaintenanceTeams({ page: 1, limit: 200, plantId: resolvedPlantId || undefined, includeInactive: true }),
        listMachineInstruments({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: true }),
      ]);
      setTemplates(templateRes.data || []);
      setSchedules(scheduleRes.data || []);
      setDepartments(departmentRes.data || []);
      setModules(moduleRes.data || []);
      setAssets(assetRes.data || []);
      setTeams(teamRes.data || []);
      setInstruments(instrumentRes.data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load calibration master data"));
    } finally {
      setLoading(false);
    }
  }, [canSelectPlant, resolvedPlantId, searchQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const plantOptions = useMemo(
    () => plants.filter((plant) => plant.isActive ?? true).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
    [plants],
  );
  const teamOptions = useMemo(
    () => teams.filter((team) => team.isActive).map((team) => ({ value: team.id, label: team.teamName })),
    [teams],
  );
  const templateOptions = useMemo(
    () => templates.filter((template) => template.isActive).map((template) => ({ value: template.id, label: template.templateName })),
    [templates],
  );
  const departmentsForForm = useMemo(
    () => departments.filter((department) => !scheduleForm.plantId || department.plantId === scheduleForm.plantId),
    [departments, scheduleForm.plantId],
  );
  const modulesForForm = useMemo(
    () =>
      modules.filter((item) => {
        if (scheduleForm.plantId && item.plantId !== scheduleForm.plantId) return false;
        if (scheduleForm.departmentId && item.departmentId !== scheduleForm.departmentId) return false;
        return true;
      }),
    [modules, scheduleForm.departmentId, scheduleForm.plantId],
  );
  const assetsForForm = useMemo(
    () =>
      assets.filter((item) => {
        if (scheduleForm.plantId && item.plantId !== scheduleForm.plantId) return false;
        if (scheduleForm.departmentId && item.departmentId !== scheduleForm.departmentId) return false;
        if (scheduleForm.moduleId && item.moduleId !== scheduleForm.moduleId) return false;
        return true;
      }),
    [assets, scheduleForm.departmentId, scheduleForm.moduleId, scheduleForm.plantId],
  );
  const instrumentsForForm = useMemo(
    () => instruments.filter((item) => !scheduleForm.assetId || item.assetId === scheduleForm.assetId),
    [instruments, scheduleForm.assetId],
  );

  const estimatedNextDue = useMemo(() => {
    const template = templates.find((item) => item.id === scheduleForm.templateId);
    if (!template || !scheduleForm.startDate) return "";
    const next = new Date(scheduleForm.startDate);
    switch (template.frequencyType) {
      case "DAY": next.setDate(next.getDate() + template.frequencyValue); break;
      case "WEEK": next.setDate(next.getDate() + template.frequencyValue * 7); break;
      case "MONTH": next.setMonth(next.getMonth() + template.frequencyValue); break;
      case "QUARTER": next.setMonth(next.getMonth() + template.frequencyValue * 3); break;
      case "YEAR": next.setFullYear(next.getFullYear() + template.frequencyValue); break;
    }
    return next.toLocaleString();
  }, [scheduleForm.startDate, scheduleForm.templateId, templates]);

  const openCreateTemplate = () => {
    setIsEditingTemplate(false);
    setSelectedTemplate(null);
    setTemplateForm(emptyTemplateForm(resolvedPlantId || ""));
    setIsTemplateFormOpen(true);
  };

  const openEditTemplate = (template: CalibrationTemplate) => {
    setIsEditingTemplate(true);
    setSelectedTemplate(template);
    setTemplateForm({
      plantId: template.plantId || resolvedPlantId || "",
      templateName: template.templateName,
      instrumentType: template.instrumentType,
      calibrationMethod: template.calibrationMethod,
      tolerance: template.tolerance || "",
      frequencyType: template.frequencyType,
      frequencyValue: String(template.frequencyValue),
      estimatedDuration: String(template.estimatedDuration),
      responsibleTeamId: template.responsibleTeamId || "",
      checklistTasks: template.checklistTasks.join("\n"),
      isActive: template.isActive,
    });
    setIsTemplateFormOpen(true);
  };

  const openCreateSchedule = () => {
    setIsEditingSchedule(false);
    setSelectedSchedule(null);
    setScheduleForm(emptyScheduleForm(resolvedPlantId || ""));
    setIsScheduleFormOpen(true);
  };

  const openEditSchedule = (schedule: CalibrationSchedule) => {
    const asset = schedule.instrument?.asset;
    setIsEditingSchedule(true);
    setSelectedSchedule(schedule);
    setScheduleForm({
      plantId: schedule.plantId || asset?.plantId || resolvedPlantId || "",
      departmentId: asset?.departmentId || "",
      moduleId: asset?.moduleId || "",
      assetId: asset?.id || "",
      instrumentId: schedule.instrumentId,
      templateId: schedule.templateId,
      startDate: new Date(schedule.startDate).toISOString().slice(0, 16),
      assignedTeamId: schedule.assignedTeamId || "",
      calibrationType: schedule.calibrationType,
      isActive: schedule.isActive,
    });
    setIsScheduleFormOpen(true);
  };

  const handleTemplateSubmit = async () => {
    const plantId = canSelectPlant ? templateForm.plantId : defaultPlantId;
    if (!plantId || !templateForm.templateName.trim() || !templateForm.instrumentType.trim() || !templateForm.calibrationMethod.trim()) {
      toast.error("Plant, template name, instrument type, and calibration method are required");
      return;
    }

    setSaving(true);
    try {
      const payload: CalibrationTemplatePayload = {
        plantId,
        templateName: templateForm.templateName.trim(),
        instrumentType: templateForm.instrumentType.trim(),
        calibrationMethod: templateForm.calibrationMethod.trim(),
        tolerance: templateForm.tolerance.trim() || null,
        frequencyType: templateForm.frequencyType,
        frequencyValue: Number(templateForm.frequencyValue),
        estimatedDuration: Number(templateForm.estimatedDuration),
        responsibleTeamId: templateForm.responsibleTeamId || null,
        checklistTasks: linesToArray(templateForm.checklistTasks),
        isActive: templateForm.isActive,
      };
      if (isEditingTemplate && selectedTemplate) {
        await updateCalibrationTemplate(selectedTemplate.id, payload);
        toast.success("Calibration template updated");
      } else {
        await createCalibrationTemplate(payload);
        toast.success("Calibration template created");
      }
      setIsTemplateFormOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save calibration template"));
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleSubmit = async () => {
    const plantId = canSelectPlant ? scheduleForm.plantId : defaultPlantId;
    if (!plantId || !scheduleForm.assetId || !scheduleForm.instrumentId || !scheduleForm.templateId || !scheduleForm.startDate) {
      toast.error("Plant, machine, instrument, template, and start date are required");
      return;
    }

    setSaving(true);
    try {
      const payload: CalibrationSchedulePayload = {
        plantId,
        instrumentId: scheduleForm.instrumentId,
        templateId: scheduleForm.templateId,
        startDate: new Date(scheduleForm.startDate).toISOString(),
        assignedTeamId: scheduleForm.assignedTeamId || null,
        calibrationType: scheduleForm.calibrationType,
        isActive: scheduleForm.isActive,
      };
      if (isEditingSchedule && selectedSchedule) {
        await updateCalibrationSchedule(selectedSchedule.id, payload);
        toast.success("Calibration schedule updated");
      } else {
        await createCalibrationSchedule(payload);
        toast.success("Calibration schedule created");
      }
      setIsScheduleFormOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save calibration schedule"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const targetId = deleteMode === "template" ? selectedTemplate?.id : selectedSchedule?.id;
    if (!targetId) return;
    setSaving(true);
    try {
      if (deleteMode === "template") {
        await deleteCalibrationTemplate(targetId);
        toast.success("Calibration template removed");
      } else {
        await deleteCalibrationSchedule(targetId);
        toast.success("Calibration schedule removed");
      }
      setIsDeleteOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete record"));
    } finally {
      setSaving(false);
    }
  };

  const templateColumns = [
    { key: "template", header: "Template", render: (item: CalibrationTemplate) => <div><p className="font-medium">{item.templateName}</p><p className="text-xs text-muted-foreground">{item.instrumentType}</p></div> },
    { key: "method", header: "Method", render: (item: CalibrationTemplate) => item.calibrationMethod },
    { key: "frequency", header: "Frequency", render: (item: CalibrationTemplate) => formatFrequency(item.frequencyType, item.frequencyValue) },
    { key: "team", header: "Team", render: (item: CalibrationTemplate) => item.responsibleTeam?.teamName || "-", hideOnMobile: true },
    { key: "tasks", header: "Checklist", render: (item: CalibrationTemplate) => `${item.checklistTasks.length} task(s)`, hideOnMobile: true },
    { key: "actions", header: "Actions", render: (item: CalibrationTemplate) => canManage ? <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => openEditTemplate(item)}><Edit className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => { setSelectedTemplate(item); setDeleteMode("template"); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ];

  const scheduleColumns = [
    { key: "instrument", header: "Instrument", render: (item: CalibrationSchedule) => <div><p className="font-medium">{item.instrument?.instrumentName || "-"}</p><p className="text-xs text-muted-foreground">{item.instrument?.serialNumber || item.instrument?.instrumentType || "-"}</p></div> },
    { key: "machine", header: "Machine", render: (item: CalibrationSchedule) => <div><p>{item.instrument?.asset?.code || "-"}</p><p className="text-xs text-muted-foreground">{item.instrument?.asset?.name || "-"}</p></div> },
    { key: "template", header: "Template", render: (item: CalibrationSchedule) => item.template?.templateName || "-" },
    { key: "nextDue", header: "Next Due", render: (item: CalibrationSchedule) => new Date(item.nextDueDate).toLocaleString() },
    { key: "type", header: "Type", render: (item: CalibrationSchedule) => <StatusBadge variant="info">{item.calibrationType}</StatusBadge>, hideOnMobile: true },
    { key: "actions", header: "Actions", render: (item: CalibrationSchedule) => canManage ? <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => openEditSchedule(item)}><Edit className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => { setSelectedSchedule(item); setDeleteMode("schedule"); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ];

  return (
    <PageShell className="space-y-6">
      <BackButton />
      <PageHeader
        title="Calibration Master"
        subtitle="Create calibration templates, link them to machine instruments, and keep next due dates automated."
        actions={canManage ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openCreateSchedule}><Link2 className="mr-2 h-4 w-4" />Link Instrument</Button><Button onClick={openCreateTemplate}><Plus className="mr-2 h-4 w-4" />Create Template</Button></div> : null}
      />

      <Card className="shadow-card">
        <CardContent className="pt-5">
          <Toolbar
            left={<div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9" placeholder="Search template, instrument, machine..." /></div>}
            right={canSelectPlant ? <SelectField label="" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" /> : null}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-sm font-semibold">Calibration Templates</p><p className="text-sm text-muted-foreground">Method, tolerance, team, frequency, and checklist library.</p></div>
              <div className="rounded-full border px-3 py-1 text-xs font-medium">{templates.length} templates</div>
            </div>
            {loading ? <TableSkeleton rows={5} /> : templates.length === 0 ? <EmptyState title="No templates yet" description="Create the first calibration template to standardize instrument execution." icon={Gauge} /> : (
              <DataTableShell>
                <ResponsiveTable data={templates} columns={templateColumns} keyExtractor={(item) => item.id} mobileCard={(item) => (
                  <MobileCard onEdit={canManage ? () => openEditTemplate(item) : undefined} onDelete={canManage ? () => { setSelectedTemplate(item); setDeleteMode("template"); setIsDeleteOpen(true); } : undefined}>
                    <MobileCardHeader title={item.templateName} subtitle={item.calibrationMethod} badge={<StatusBadge variant="primary">{item.instrumentType}</StatusBadge>} />
                    <MobileCardRow label="Frequency" value={formatFrequency(item.frequencyType, item.frequencyValue)} />
                    <MobileCardRow label="Tolerance" value={item.tolerance || "-"} />
                    <MobileCardRow label="Checklist" value={`${item.checklistTasks.length} task(s)`} />
                  </MobileCard>
                )} />
              </DataTableShell>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-sm font-semibold">Linked Instruments</p><p className="text-sm text-muted-foreground">Attach templates to instruments under machines and auto-calculate next due.</p></div>
              <div className="rounded-full border px-3 py-1 text-xs font-medium">{schedules.length} links</div>
            </div>
            {loading ? <TableSkeleton rows={5} /> : schedules.length === 0 ? <EmptyState title="No linked instruments" description="Link a calibration template to a machine instrument to start task generation." icon={CalendarClock} /> : (
              <DataTableShell>
                <ResponsiveTable data={schedules} columns={scheduleColumns} keyExtractor={(item) => item.id} mobileCard={(item) => (
                  <MobileCard onEdit={canManage ? () => openEditSchedule(item) : undefined} onDelete={canManage ? () => { setSelectedSchedule(item); setDeleteMode("schedule"); setIsDeleteOpen(true); } : undefined}>
                    <MobileCardHeader title={item.instrument?.instrumentName || "Instrument"} subtitle={item.instrument?.asset?.code || "-"} badge={<StatusBadge variant="warning">Due {new Date(item.nextDueDate).toLocaleDateString()}</StatusBadge>} />
                    <MobileCardRow label="Machine" value={item.instrument?.asset?.name || "-"} />
                    <MobileCardRow label="Template" value={item.template?.templateName || "-"} />
                    <MobileCardRow label="Team" value={item.assignedTeam?.teamName || "-"} />
                  </MobileCard>
                )} />
              </DataTableShell>
            )}
          </CardContent>
        </Card>
      </div>

      <FormDialog open={isTemplateFormOpen} onOpenChange={setIsTemplateFormOpen} title={isEditingTemplate ? "Edit Calibration Template" : "Create Calibration Template"} description="Build the reusable checklist and frequency model for a calibration method." onSubmit={handleTemplateSubmit} submitLabel={saving ? "Saving..." : isEditingTemplate ? "Update Template" : "Create Template"} size="xl">
        <FormGrid>
          {canSelectPlant ? <SelectField label="Plant" value={templateForm.plantId} onChange={(value) => setTemplateForm((current) => ({ ...current, plantId: value }))} options={plantOptions} placeholder="Select plant" required /> : null}
          <InputField label="Template Name" value={templateForm.templateName} onChange={(value) => setTemplateForm((current) => ({ ...current, templateName: value }))} placeholder="Quarterly Pressure Gauge Calibration" required />
          <InputField label="Instrument Type" value={templateForm.instrumentType} onChange={(value) => setTemplateForm((current) => ({ ...current, instrumentType: value }))} placeholder="Pressure Gauge / Temp Sensor" required />
          <InputField label="Calibration Method" value={templateForm.calibrationMethod} onChange={(value) => setTemplateForm((current) => ({ ...current, calibrationMethod: value }))} placeholder="Master gauge comparison" required />
          <InputField label="Tolerance" value={templateForm.tolerance} onChange={(value) => setTemplateForm((current) => ({ ...current, tolerance: value }))} placeholder="+/- 1%" />
          <SelectField label="Frequency Type" value={templateForm.frequencyType} onChange={(value) => setTemplateForm((current) => ({ ...current, frequencyType: value as TemplateFormState["frequencyType"] }))} options={[{ value: "DAY", label: "Day" }, { value: "WEEK", label: "Week" }, { value: "MONTH", label: "Month" }, { value: "QUARTER", label: "Quarter" }, { value: "YEAR", label: "Year" }]} required />
          <InputField label="Frequency Value" value={templateForm.frequencyValue} onChange={(value) => setTemplateForm((current) => ({ ...current, frequencyValue: value }))} type="number" required />
          <InputField label="Estimated Duration (Minutes)" value={templateForm.estimatedDuration} onChange={(value) => setTemplateForm((current) => ({ ...current, estimatedDuration: value }))} type="number" required />
          <SelectField label="Responsible Team" value={templateForm.responsibleTeamId} onChange={(value) => setTemplateForm((current) => ({ ...current, responsibleTeamId: value }))} options={teamOptions} placeholder="Select team" />
          <div className="flex items-end"><SwitchField label="Active Template" checked={templateForm.isActive} onChange={(checked) => setTemplateForm((current) => ({ ...current, isActive: checked }))} /></div>
        </FormGrid>
        <TextareaField label="Checklist Tasks" value={templateForm.checklistTasks} onChange={(value) => setTemplateForm((current) => ({ ...current, checklistTasks: value }))} placeholder={"Verify reference instrument zero\nCheck span at minimum point\nCheck span at maximum point\nSeal and tag the instrument"} required />
      </FormDialog>

      <FormDialog open={isScheduleFormOpen} onOpenChange={setIsScheduleFormOpen} title={isEditingSchedule ? "Edit Linked Instrument" : "Link Instrument To Template"} description="Tie a machine instrument to a calibration template and execution team." onSubmit={handleScheduleSubmit} submitLabel={saving ? "Saving..." : isEditingSchedule ? "Update Link" : "Create Link"} size="xl">
        <FormGrid>
          {canSelectPlant ? <SelectField label="Plant" value={scheduleForm.plantId} onChange={(value) => setScheduleForm((current) => ({ ...current, plantId: value, departmentId: "", moduleId: "", assetId: "", instrumentId: "" }))} options={plantOptions} placeholder="Select plant" required /> : null}
          <SelectField label="Department" value={scheduleForm.departmentId} onChange={(value) => setScheduleForm((current) => ({ ...current, departmentId: value, moduleId: "", assetId: "", instrumentId: "" }))} options={departmentsForForm.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} placeholder="Select department" />
          <SelectField label="Module" value={scheduleForm.moduleId} onChange={(value) => setScheduleForm((current) => ({ ...current, moduleId: value, assetId: "", instrumentId: "" }))} options={modulesForForm.map((item) => ({ value: item.id, label: item.code ? `${item.code} - ${item.name}` : item.name }))} placeholder="Select module" />
          <SelectField label="Machine" value={scheduleForm.assetId} onChange={(value) => setScheduleForm((current) => ({ ...current, assetId: value, instrumentId: "" }))} options={assetsForForm.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} placeholder="Select machine" required />
          <SelectField label="Instrument" value={scheduleForm.instrumentId} onChange={(value) => setScheduleForm((current) => ({ ...current, instrumentId: value }))} options={instrumentsForForm.map((item) => ({ value: item.id, label: `${item.instrumentName}${item.serialNumber ? ` (${item.serialNumber})` : ""}` }))} placeholder="Select instrument" required />
          <SelectField label="Template" value={scheduleForm.templateId} onChange={(value) => setScheduleForm((current) => ({ ...current, templateId: value }))} options={templateOptions} placeholder="Select template" required />
          <div className="space-y-2"><Label className="text-sm font-medium">Start Date</Label><Input type="datetime-local" value={scheduleForm.startDate} onChange={(event) => setScheduleForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
          <InputField label="Next Due Date" value={estimatedNextDue} onChange={() => {}} disabled placeholder="Auto calculated from selected frequency" />
          <SelectField label="Assigned Team" value={scheduleForm.assignedTeamId} onChange={(value) => setScheduleForm((current) => ({ ...current, assignedTeamId: value }))} options={teamOptions} placeholder="Select team" />
          <SelectField label="Calibration Type" value={scheduleForm.calibrationType} onChange={(value) => setScheduleForm((current) => ({ ...current, calibrationType: value }))} options={[{ value: "INTERNAL", label: "Internal" }, { value: "EXTERNAL", label: "External" }, { value: "THIRD_PARTY", label: "Third Party" }]} required />
          <div className="flex items-end"><SwitchField label="Active Link" checked={scheduleForm.isActive} onChange={(checked) => setScheduleForm((current) => ({ ...current, isActive: checked }))} /></div>
        </FormGrid>
      </FormDialog>

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} onConfirm={handleDelete} title={deleteMode === "template" ? "Delete Calibration Template" : "Delete Linked Instrument"} description={deleteMode === "template" ? `Delete "${selectedTemplate?.templateName || "this template"}"?` : `Remove "${selectedSchedule?.instrument?.instrumentName || "this schedule"}" from calibration planning?`} isLoading={saving} />
    </PageShell>
  );
}
