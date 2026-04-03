import { useEffect, useMemo, useState } from "react";
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
  createPMAssetLink,
  createPMTemplate,
  deletePMAssetLink,
  deletePMTemplate,
  listPMAssetLinks,
  listPMTemplates,
  updatePMAssetLink,
  updatePMTemplate,
  type PMAssetLink,
  type PMAssetLinkPayload,
  type PMTemplate,
  type PMTemplatePayload,
} from "@/api/pm";
import { listAssets, type Asset } from "@/api/assets";
import { listDepartments, type Department } from "@/api/departments";
import { listMaintenanceTeams, type MaintenanceTeam } from "@/api/maintenanceTeams";
import { listPlants, type Plant } from "@/api/plants";
import { listUsers, type UserProfile } from "@/api/users";
import { isAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { CalendarClock, Edit, Link2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TemplateFormState = {
  plantId: string;
  templateName: string;
  maintenanceType: "PM" | "PD";
  discipline: string;
  frequencyType: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  frequencyValue: string;
  estimatedDuration: string;
  checklistTasks: string;
  isActive: boolean;
};

type LinkFormState = {
  templateId: string;
  plantId: string;
  departmentId: string;
  assetId: string;
  startDate: string;
  assignedTeamId: string;
  responsibleUserId: string;
  isActive: boolean;
};

const emptyTemplateForm = (plantId: string): TemplateFormState => ({
  plantId,
  templateName: "",
  maintenanceType: "PM",
  discipline: "",
  frequencyType: "MONTH",
  frequencyValue: "1",
  estimatedDuration: "60",
  checklistTasks: "",
  isActive: true,
});

const todayIsoDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const emptyLinkForm = (plantId: string): LinkFormState => ({
  templateId: "",
  plantId,
  departmentId: "",
  assetId: "",
  startDate: todayIsoDateTime(),
  assignedTeamId: "",
  responsibleUserId: "",
  isActive: true,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function linesToArray(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatFrequency(type: string, value: number) {
  return `Every ${value} ${type.toLowerCase()}${value > 1 ? "s" : ""}`;
}

export default function PMConfigMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<MaintenanceTeam[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [templates, setTemplates] = useState<PMTemplate[]>([]);
  const [links, setLinks] = useState<PMAssetLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedTemplate, setSelectedTemplate] = useState<PMTemplate | null>(null);
  const [selectedLink, setSelectedLink] = useState<PMAssetLink | null>(null);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [isLinkFormOpen, setIsLinkFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"template" | "link">("template");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(emptyTemplateForm(defaultPlantId));
  const [linkForm, setLinkForm] = useState<LinkFormState>(emptyLinkForm(defaultPlantId));

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

  useEffect(() => {
    if (canSelectPlant && !resolvedPlantId) {
      setTemplates([]);
      setLinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const [templatesRes, linksRes, departmentsRes, assetsRes, teamsRes, usersRes] = await Promise.all([
          listPMTemplates({ page: 1, limit: 300, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
          listPMAssetLinks({ page: 1, limit: 500, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
          listDepartments({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: false }),
          listAssets({ page: 1, limit: 1000, plantId: resolvedPlantId || undefined, includeInactive: false }),
          listMaintenanceTeams({ page: 1, limit: 200, plantId: resolvedPlantId || undefined, includeInactive: true }),
          listUsers({ page: 1, limit: 500, plantId: resolvedPlantId || undefined }),
        ]);
        setTemplates(templatesRes.data || []);
        setLinks(linksRes.data || []);
        setDepartments(departmentsRes.data || []);
        setAssets(assetsRes.data || []);
        setTeams(teamsRes.data || []);
        setUsers((usersRes.data || []).filter((item) => item.isActive));
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load PM master data"));
      } finally {
        setLoading(false);
      }
    })();
  }, [canSelectPlant, resolvedPlantId, searchQuery]);

  const plantOptions = useMemo(
    () => plants.filter((plant) => plant.isActive ?? true).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
    [plants],
  );
  const templateOptions = useMemo(
    () => templates.filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.templateName })),
    [templates],
  );
  const teamOptions = useMemo(
    () => teams.filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.teamName })),
    [teams],
  );
  const userOptions = useMemo(
    () => users.map((item) => ({ value: item.userId, label: `${item.fullName} (${item.userCode})` })),
    [users],
  );

  const departmentsForPlant = useMemo(
    () => departments.filter((item) => item.plantId === linkForm.plantId),
    [departments, linkForm.plantId],
  );
  const assetsForScope = useMemo(
    () =>
      assets.filter((asset) => {
        if (linkForm.plantId && asset.plantId !== linkForm.plantId) return false;
        if (linkForm.departmentId && asset.departmentId !== linkForm.departmentId) return false;
        return true;
      }),
    [assets, linkForm.departmentId, linkForm.plantId],
  );

  const estimatedNextDue = useMemo(() => {
    const template = templates.find((item) => item.id === linkForm.templateId);
    if (!template || !linkForm.startDate) return "";
    const start = new Date(linkForm.startDate);
    if (Number.isNaN(start.getTime())) return "";
    const next = new Date(start);
    switch (template.frequencyType) {
      case "DAY":
        next.setDate(next.getDate() + template.frequencyValue);
        break;
      case "WEEK":
        next.setDate(next.getDate() + template.frequencyValue * 7);
        break;
      case "MONTH":
        next.setMonth(next.getMonth() + template.frequencyValue);
        break;
      case "QUARTER":
        next.setMonth(next.getMonth() + template.frequencyValue * 3);
        break;
      case "YEAR":
        next.setFullYear(next.getFullYear() + template.frequencyValue);
        break;
    }
    return next.toLocaleString();
  }, [linkForm.startDate, linkForm.templateId, templates]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [templatesRes, linksRes] = await Promise.all([
        listPMTemplates({ page: 1, limit: 300, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
        listPMAssetLinks({ page: 1, limit: 500, plantId: resolvedPlantId || undefined, includeInactive: true, search: searchQuery || undefined }),
      ]);
      setTemplates(templatesRes.data || []);
      setLinks(linksRes.data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to refresh PM master"));
    } finally {
      setLoading(false);
    }
  };

  const openCreateTemplate = () => {
    setIsEditingTemplate(false);
    setSelectedTemplate(null);
    setTemplateForm(emptyTemplateForm(resolvedPlantId || ""));
    setIsTemplateFormOpen(true);
  };

  const openEditTemplate = (template: PMTemplate) => {
    setIsEditingTemplate(true);
    setSelectedTemplate(template);
    setTemplateForm({
      plantId: template.plantId || resolvedPlantId || "",
      templateName: template.templateName,
      maintenanceType: template.maintenanceType,
      discipline: template.discipline || "",
      frequencyType: template.frequencyType,
      frequencyValue: String(template.frequencyValue),
      estimatedDuration: String(template.estimatedDuration),
      checklistTasks: template.checklistTasks.join("\n"),
      isActive: template.isActive,
    });
    setIsTemplateFormOpen(true);
  };

  const openCreateLink = () => {
    setIsEditingLink(false);
    setSelectedLink(null);
    setLinkForm(emptyLinkForm(resolvedPlantId || ""));
    setIsLinkFormOpen(true);
  };

  const openEditLink = (link: PMAssetLink) => {
    setIsEditingLink(true);
    setSelectedLink(link);
    setLinkForm({
      templateId: link.templateId,
      plantId: link.plantId || resolvedPlantId || "",
      departmentId: link.departmentId || "",
      assetId: link.assetId,
      startDate: new Date(link.startDate).toISOString().slice(0, 16),
      assignedTeamId: link.assignedTeamId || "",
      responsibleUserId: link.responsibleUserId || "",
      isActive: link.isActive,
    });
    setIsLinkFormOpen(true);
  };

  const handleTemplateSubmit = async () => {
    const plantId = canSelectPlant ? templateForm.plantId : defaultPlantId;
    if (!plantId || !templateForm.templateName.trim()) {
      toast.error("Plant and template name are required");
      return;
    }
    setSaving(true);
    const payload: PMTemplatePayload = {
      plantId,
      templateName: templateForm.templateName.trim(),
      maintenanceType: templateForm.maintenanceType,
      discipline: templateForm.discipline.trim() || null,
      frequencyType: templateForm.frequencyType,
      frequencyValue: Number(templateForm.frequencyValue),
      estimatedDuration: Number(templateForm.estimatedDuration),
      checklistTasks: linesToArray(templateForm.checklistTasks),
      isActive: templateForm.isActive,
    };
    try {
      if (isEditingTemplate && selectedTemplate) {
        await updatePMTemplate(selectedTemplate.id, payload);
        toast.success("PM template updated");
      } else {
        await createPMTemplate(payload);
        toast.success("PM template created");
      }
      setIsTemplateFormOpen(false);
      await refreshData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save PM template"));
    } finally {
      setSaving(false);
    }
  };

  const handleLinkSubmit = async () => {
    const plantId = canSelectPlant ? linkForm.plantId : defaultPlantId;
    if (!plantId || !linkForm.templateId || !linkForm.assetId || !linkForm.startDate) {
      toast.error("Template, plant, machine, and start date are required");
      return;
    }
    setSaving(true);
    const payload: PMAssetLinkPayload = {
      templateId: linkForm.templateId,
      plantId,
      departmentId: linkForm.departmentId || null,
      assetId: linkForm.assetId,
      startDate: new Date(linkForm.startDate).toISOString(),
      assignedTeamId: linkForm.assignedTeamId || null,
      responsibleUserId: linkForm.responsibleUserId || null,
      isActive: linkForm.isActive,
    };
    try {
      if (isEditingLink && selectedLink) {
        await updatePMAssetLink(selectedLink.id, payload);
        toast.success("Linked asset updated");
      } else {
        await createPMAssetLink(payload);
        toast.success("Template linked to asset");
      }
      setIsLinkFormOpen(false);
      await refreshData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save linked asset"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const targetId = deleteMode === "template" ? selectedTemplate?.id : selectedLink?.id;
    if (!targetId) return;
    setSaving(true);
    try {
      if (deleteMode === "template") {
        await deletePMTemplate(targetId);
        toast.success("PM template removed");
      } else {
        await deletePMAssetLink(targetId);
        toast.success("Linked asset removed");
      }
      setIsDeleteOpen(false);
      await refreshData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete record"));
    } finally {
      setSaving(false);
    }
  };

  const templateColumns = [
    { key: "templateName", header: "Template", render: (item: PMTemplate) => <div><p className="font-medium">{item.templateName}</p><p className="text-xs text-muted-foreground">{item.discipline || "General discipline"}</p></div> },
    { key: "maintenanceType", header: "Type", render: (item: PMTemplate) => <StatusBadge variant={item.maintenanceType === "PD" ? "info" : "primary"}>{item.maintenanceType}</StatusBadge> },
    { key: "frequency", header: "Frequency", render: (item: PMTemplate) => formatFrequency(item.frequencyType, item.frequencyValue) },
    { key: "duration", header: "Duration", render: (item: PMTemplate) => `${item.estimatedDuration} min`, hideOnMobile: true },
    { key: "tasks", header: "Checklist", render: (item: PMTemplate) => `${item.checklistTasks.length} task(s)`, hideOnMobile: true },
    {
      key: "actions",
      header: "Actions",
      render: (item: PMTemplate) => canManage ? (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => openEditTemplate(item)}><Edit className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => { setSelectedTemplate(item); setDeleteMode("template"); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ) : null,
    },
  ];

  const linkColumns = [
    { key: "asset", header: "Linked Asset", render: (item: PMAssetLink) => <div><p className="font-medium">{item.asset?.code || "-"}</p><p className="text-xs text-muted-foreground">{item.asset?.name || "Machine not found"}</p></div> },
    { key: "template", header: "Template", render: (item: PMAssetLink) => <div><p>{item.template?.templateName || "-"}</p><p className="text-xs text-muted-foreground">{item.template?.maintenanceType || "-"}</p></div> },
    { key: "nextDue", header: "Next Due", render: (item: PMAssetLink) => new Date(item.nextDueDate).toLocaleString() },
    { key: "team", header: "Assigned Team", render: (item: PMAssetLink) => item.assignedTeam?.teamName || "-", hideOnMobile: true },
    { key: "user", header: "Responsible User", render: (item: PMAssetLink) => item.responsibleUser?.fullName || "-", hideOnMobile: true },
    {
      key: "actions",
      header: "Actions",
      render: (item: PMAssetLink) => canManage ? (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => openEditLink(item)}><Edit className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => { setSelectedLink(item); setDeleteMode("link"); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ) : null,
    },
  ];

  return (
    <PageShell className="space-y-6">
      <BackButton />
      <PageHeader
        title="PM / PD Master"
        subtitle="Build reusable maintenance templates and link them to machine assets with automated due scheduling."
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openCreateLink}><Link2 className="mr-2 h-4 w-4" />Link Asset</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={openCreateTemplate}><Plus className="mr-2 h-4 w-4" />Create Template</Button>
          </div>
        ) : null}
      />

      <Card className="shadow-card">
        <CardContent className="pt-5">
          <Toolbar
            left={<div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9" placeholder="Search template, asset, team..." /></div>}
            right={canSelectPlant ? <SelectField label="" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" /> : null}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Maintenance Templates</p>
                <p className="text-sm text-muted-foreground">Template name, maintenance type, frequency, and checklist library.</p>
              </div>
              <div className="rounded-full border px-3 py-1 text-xs font-medium">{templates.length} templates</div>
            </div>
            {loading ? <TableSkeleton rows={5} /> : templates.length === 0 ? (
              <EmptyState title="No templates yet" description="Create the first PM/PD template to start linking assets." icon={ShieldCheck} />
            ) : (
              <DataTableShell>
                <ResponsiveTable
                  data={templates}
                  columns={templateColumns}
                  keyExtractor={(item) => item.id}
                  emptyMessage="No templates found"
                  mobileCard={(item) => (
                    <MobileCard onEdit={canManage ? () => openEditTemplate(item) : undefined} onDelete={canManage ? () => { setSelectedTemplate(item); setDeleteMode("template"); setIsDeleteOpen(true); } : undefined}>
                      <MobileCardHeader title={item.templateName} subtitle={formatFrequency(item.frequencyType, item.frequencyValue)} badge={<StatusBadge variant={item.maintenanceType === "PD" ? "info" : "primary"}>{item.maintenanceType}</StatusBadge>} />
                      <MobileCardRow label="Discipline" value={item.discipline || "-"} />
                      <MobileCardRow label="Duration" value={`${item.estimatedDuration} min`} />
                      <MobileCardRow label="Checklist" value={`${item.checklistTasks.length} task(s)`} />
                    </MobileCard>
                  )}
                />
              </DataTableShell>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Linked Assets</p>
                <p className="text-sm text-muted-foreground">Assign templates to machines, teams, and responsible users with automatic next due dates.</p>
              </div>
              <div className="rounded-full border px-3 py-1 text-xs font-medium">{links.length} links</div>
            </div>
            {loading ? <TableSkeleton rows={5} /> : links.length === 0 ? (
              <EmptyState title="No linked assets" description="Link a PM/PD template to a machine to start generating tasks." icon={CalendarClock} />
            ) : (
              <DataTableShell>
                <ResponsiveTable
                  data={links}
                  columns={linkColumns}
                  keyExtractor={(item) => item.id}
                  emptyMessage="No linked assets found"
                  mobileCard={(item) => (
                    <MobileCard onEdit={canManage ? () => openEditLink(item) : undefined} onDelete={canManage ? () => { setSelectedLink(item); setDeleteMode("link"); setIsDeleteOpen(true); } : undefined}>
                      <MobileCardHeader title={item.asset?.code || "Machine"} subtitle={item.template?.templateName || "-"} badge={<StatusBadge variant="warning">Due {new Date(item.nextDueDate).toLocaleDateString()}</StatusBadge>} />
                      <MobileCardRow label="Machine" value={item.asset?.name || "-"} />
                      <MobileCardRow label="Assigned Team" value={item.assignedTeam?.teamName || "-"} />
                      <MobileCardRow label="Responsible User" value={item.responsibleUser?.fullName || "-"} />
                    </MobileCard>
                  )}
                />
              </DataTableShell>
            )}
          </CardContent>
        </Card>
      </div>

      <FormDialog
        open={isTemplateFormOpen}
        onOpenChange={setIsTemplateFormOpen}
        title={isEditingTemplate ? "Edit PM Template" : "Create PM Template"}
        description="Define the reusable maintenance template that will drive generated PM/PD tasks."
        onSubmit={handleTemplateSubmit}
        submitLabel={saving ? "Saving..." : isEditingTemplate ? "Update Template" : "Create Template"}
        size="xl"
      >
        <FormGrid>
          {canSelectPlant ? <SelectField label="Plant" value={templateForm.plantId} onChange={(value) => setTemplateForm((current) => ({ ...current, plantId: value }))} options={plantOptions} placeholder="Select plant" required /> : null}
          <InputField label="Template Name" value={templateForm.templateName} onChange={(value) => setTemplateForm((current) => ({ ...current, templateName: value }))} placeholder="Boiler Monthly Inspection" required />
          <SelectField label="Maintenance Type" value={templateForm.maintenanceType} onChange={(value) => setTemplateForm((current) => ({ ...current, maintenanceType: value as TemplateFormState["maintenanceType"] }))} options={[{ value: "PM", label: "PM" }, { value: "PD", label: "PD" }]} required />
          <InputField label="Discipline" value={templateForm.discipline} onChange={(value) => setTemplateForm((current) => ({ ...current, discipline: value }))} placeholder="Mechanical / Electrical / Utilities" />
          <SelectField label="Frequency Type" value={templateForm.frequencyType} onChange={(value) => setTemplateForm((current) => ({ ...current, frequencyType: value as TemplateFormState["frequencyType"] }))} options={[{ value: "DAY", label: "Day" }, { value: "WEEK", label: "Week" }, { value: "MONTH", label: "Month" }, { value: "QUARTER", label: "Quarter" }, { value: "YEAR", label: "Year" }]} required />
          <InputField label="Frequency Value" value={templateForm.frequencyValue} onChange={(value) => setTemplateForm((current) => ({ ...current, frequencyValue: value }))} type="number" required />
          <InputField label="Estimated Duration (Minutes)" value={templateForm.estimatedDuration} onChange={(value) => setTemplateForm((current) => ({ ...current, estimatedDuration: value }))} type="number" required />
          <div className="flex items-end"><SwitchField label="Active Template" checked={templateForm.isActive} onChange={(checked) => setTemplateForm((current) => ({ ...current, isActive: checked }))} /></div>
        </FormGrid>
        <TextareaField label="Checklist Tasks" value={templateForm.checklistTasks} onChange={(value) => setTemplateForm((current) => ({ ...current, checklistTasks: value }))} placeholder={"Inspect compressor vibration\nCheck oil level\nClean filter and tighten terminals"} required />
      </FormDialog>

      <FormDialog
        open={isLinkFormOpen}
        onOpenChange={setIsLinkFormOpen}
        title={isEditingLink ? "Edit Linked Asset" : "Link Template To Asset"}
        description="Attach a PM/PD template to a machine and assign ownership for generated tasks."
        onSubmit={handleLinkSubmit}
        submitLabel={saving ? "Saving..." : isEditingLink ? "Update Link" : "Create Link"}
        size="xl"
      >
        <FormGrid>
          {canSelectPlant ? <SelectField label="Plant" value={linkForm.plantId} onChange={(value) => setLinkForm((current) => ({ ...current, plantId: value, departmentId: "", assetId: "", assignedTeamId: "", responsibleUserId: "" }))} options={plantOptions} placeholder="Select plant" required /> : null}
          <SelectField label="Template" value={linkForm.templateId} onChange={(value) => setLinkForm((current) => ({ ...current, templateId: value }))} options={templateOptions} placeholder="Select template" required />
          <SelectField label="Department" value={linkForm.departmentId} onChange={(value) => setLinkForm((current) => ({ ...current, departmentId: value, assetId: "" }))} options={departmentsForPlant.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} placeholder="Select department" required />
          <SelectField label="Machine" value={linkForm.assetId} onChange={(value) => setLinkForm((current) => ({ ...current, assetId: value }))} options={assetsForScope.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} placeholder="Select machine" required />
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-sm font-medium">
              Start Date
              <span className="text-destructive">*</span>
            </Label>
            <Input type="datetime-local" value={linkForm.startDate} onChange={(event) => setLinkForm((current) => ({ ...current, startDate: event.target.value }))} />
          </div>
          <InputField label="Next Due Date" value={estimatedNextDue} onChange={() => {}} disabled placeholder="Auto calculated from template frequency" />
          <SelectField label="Assigned Team" value={linkForm.assignedTeamId} onChange={(value) => setLinkForm((current) => ({ ...current, assignedTeamId: value }))} options={teamOptions} placeholder="Select team" />
          <SelectField label="Responsible User" value={linkForm.responsibleUserId} onChange={(value) => setLinkForm((current) => ({ ...current, responsibleUserId: value }))} options={userOptions} placeholder="Select responsible user" />
          <div className="flex items-end"><SwitchField label="Active Link" checked={linkForm.isActive} onChange={(checked) => setLinkForm((current) => ({ ...current, isActive: checked }))} /></div>
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Linked Asset Context</p>
            <p className="mt-1">The backend will calculate `next_due_date` automatically using the selected template frequency and start date.</p>
          </div>
        </FormGrid>
      </FormDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={handleDelete}
        title={deleteMode === "template" ? "Delete PM Template" : "Delete Linked Asset"}
        description={deleteMode === "template" ? `Delete "${selectedTemplate?.templateName || "this template"}"?` : `Remove "${selectedLink?.asset?.code || "this link"}" from PM scheduling?`}
        isLoading={saving}
      />
    </PageShell>
  );
}
