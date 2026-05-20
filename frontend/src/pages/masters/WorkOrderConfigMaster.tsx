import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Edit, Link2, Plus, Search, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { listDepartments, type Department } from "@/api/departments";
import { listMaintenanceTeams, type MaintenanceTeam } from "@/api/maintenanceTeams";
import { listPlants, type Plant } from "@/api/plants";
import { createWorkOrderMaster, deleteWorkOrderMaster, listWorkOrderMasters, type WorkOrderMaster, type WorkOrderMasterOptionType, updateWorkOrderMaster } from "@/api/workOrderMasters";
import { createWorkOrderTeamMapping, deleteWorkOrderTeamMapping, listWorkOrderTeamMappings, type WorkOrderTeamMapping, updateWorkOrderTeamMapping } from "@/api/workOrderTeamMappings";
import { humanizeWorkOrderCode, normalizeWorkOrderCode } from "@/config/work-order-masters";
import { broadcastWorkOrderSync } from "@/lib/work-order-sync";
import { isAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";

type ConfigTab = "categories" | "types" | "failure-codes" | "routing";

interface OptionFormState {
  optionType: WorkOrderMasterOptionType;
  code: string;
  label: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

interface MappingFormState {
  plantId: string;
  departmentId: string;
  category: string;
  teamId: string;
}

const optionTabMap: Record<Exclude<ConfigTab, "routing">, WorkOrderMasterOptionType> = {
  categories: "CATEGORY",
  types: "WO_TYPE",
  "failure-codes": "FAILURE_CODE",
};

const optionTabTitle: Record<Exclude<ConfigTab, "routing">, string> = {
  categories: "Work Order Categories",
  types: "Work Order Types",
  "failure-codes": "Failure Codes",
};

const emptyOptionForm = (optionType: WorkOrderMasterOptionType): OptionFormState => ({
  optionType,
  code: "",
  label: "",
  description: "",
  sortOrder: "0",
  isActive: true,
});

const emptyMappingForm = (plantId = ""): MappingFormState => ({ plantId, departmentId: "", category: "", teamId: "" });

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

export default function WorkOrderConfigMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<MaintenanceTeam[]>([]);
  const [masters, setMasters] = useState<WorkOrderMaster[]>([]);
  const [mappings, setMappings] = useState<WorkOrderTeamMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [activeTab, setActiveTab] = useState<ConfigTab>("categories");
  const [selectedOption, setSelectedOption] = useState<WorkOrderMaster | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<WorkOrderTeamMapping | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormState>(emptyOptionForm("CATEGORY"));
  const [mappingForm, setMappingForm] = useState<MappingFormState>(emptyMappingForm(defaultPlantId));
  const [isOptionFormOpen, setIsOptionFormOpen] = useState(false);
  const [isMappingFormOpen, setIsMappingFormOpen] = useState(false);
  const [isOptionDeleteOpen, setIsOptionDeleteOpen] = useState(false);
  const [isMappingDeleteOpen, setIsMappingDeleteOpen] = useState(false);
  const [isEditingOption, setIsEditingOption] = useState(false);
  const [isEditingMapping, setIsEditingMapping] = useState(false);

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;

  useEffect(() => {
    if (!canSelectPlant) return;
    void listPlants({ page: 1, limit: 500, includeInactive: true })
      .then((response) => setPlants(response.data || []))
      .catch((error: unknown) => toast.error(getErrorMessage(error, "Failed to load plants")));
  }, [canSelectPlant]);

  useEffect(() => {
    if (canSelectPlant && !resolvedPlantId) {
      setDepartments([]);
      setTeams([]);
      setMasters([]);
      setMappings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all([
      listDepartments({ page: 1, limit: 500, plantId: resolvedPlantId || "", includeInactive: true }),
      listMaintenanceTeams({ page: 1, limit: 500, plantId: resolvedPlantId || "", includeInactive: true }),
      listWorkOrderMasters({ page: 1, limit: 500, plantId: resolvedPlantId || "", includeInactive: true }),
      listWorkOrderTeamMappings({ page: 1, limit: 500, plantId: resolvedPlantId || "" }),
    ])
      .then(([departmentsResponse, teamsResponse, mastersResponse, mappingsResponse]) => {
        setDepartments(departmentsResponse.data || []);
        setTeams(teamsResponse.data || []);
        setMasters(mastersResponse.data || []);
        setMappings(mappingsResponse.data || []);
      })
      .catch((error: unknown) => toast.error(getErrorMessage(error, "Failed to load work order config")))
      .finally(() => setLoading(false));
  }, [canSelectPlant, resolvedPlantId]);

  const plantOptions = useMemo(() => plants.filter((item) => item.isActive ?? true).map((item) => ({ value: item.id, label: `${item.plantCode} - ${item.plantName}` })), [plants]);
  const departmentOptions = useMemo(() => departments.filter((item) => item.isActive ?? true).sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` })), [departments]);
  const teamOptions = useMemo(() => teams.filter((item) => item.isActive).sort((a, b) => a.teamName.localeCompare(b.teamName)).map((item) => ({ value: item.id, label: `${item.teamName} · ${item.discipline}` })), [teams]);
  const teamNameById = useMemo(() => Object.fromEntries(teams.map((item) => [item.id, item.teamName])) as Record<string, string>, [teams]);
  const departmentNameById = useMemo(() => Object.fromEntries(departments.map((item) => [item.id, `${item.code} - ${item.name}`])) as Record<string, string>, [departments]);
  const labelByCode = useMemo(() => {
    const map = {} as Record<string, string>;
    masters.forEach((item) => {
      map[item.code] = item.label;
    });
    return map;
  }, [masters]);
  const activeCategoryOptions = useMemo(() => {
    return masters.filter((item) => item.optionType === "CATEGORY" && item.isActive).map((item) => ({ value: item.code, label: item.label }));
  }, [masters]);
  const optionRows = useMemo(() => {
    if (activeTab === "routing") return [];
    const optionType = optionTabMap[activeTab];
    return masters.filter((item) => item.optionType === optionType).filter((item) => !searchQuery.trim() || [item.label, item.code, item.description || ""].join(" ").toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }, [activeTab, masters, searchQuery]);
  const mappingRows = useMemo(() => mappings.filter((item) => !searchQuery.trim() || [departmentNameById[item.departmentId || ""] || "", teamNameById[item.teamId] || "", labelByCode[item.category] || item.category].join(" ").toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => (departmentNameById[a.departmentId || ""] || "").localeCompare(departmentNameById[b.departmentId || ""] || "") || (labelByCode[a.category] || a.category).localeCompare(labelByCode[b.category] || b.category)), [departmentNameById, labelByCode, mappings, searchQuery, teamNameById]);

  const reloadPlantData = async (plantId: string) => {
    const [departmentsResponse, teamsResponse, mastersResponse, mappingsResponse] = await Promise.all([
      listDepartments({ page: 1, limit: 500, plantId, includeInactive: true }),
      listMaintenanceTeams({ page: 1, limit: 500, plantId, includeInactive: true }),
      listWorkOrderMasters({ page: 1, limit: 500, plantId, includeInactive: true }),
      listWorkOrderTeamMappings({ page: 1, limit: 500, plantId }),
    ]);
    setDepartments(departmentsResponse.data || []);
    setTeams(teamsResponse.data || []);
    setMasters(mastersResponse.data || []);
    setMappings(mappingsResponse.data || []);
  };

  const openAddOption = () => {
    if (activeTab === "routing") return;
    setIsEditingOption(false);
    setSelectedOption(null);
    setOptionForm(emptyOptionForm(optionTabMap[activeTab]));
    setIsOptionFormOpen(true);
  };
  const openEditOption = (item: WorkOrderMaster) => {
    setIsEditingOption(true);
    setSelectedOption(item);
    setOptionForm({ optionType: item.optionType, code: item.code, label: item.label, description: item.description || "", sortOrder: String(item.sortOrder), isActive: item.isActive });
    setIsOptionFormOpen(true);
  };
  const openAddMapping = () => {
    setIsEditingMapping(false);
    setSelectedMapping(null);
    setMappingForm(emptyMappingForm(resolvedPlantId || ""));
    setIsMappingFormOpen(true);
  };
  const openEditMapping = (item: WorkOrderTeamMapping) => {
    setIsEditingMapping(true);
    setSelectedMapping(item);
    setMappingForm({ plantId: item.plantId || resolvedPlantId || "", departmentId: item.departmentId || "", category: item.category, teamId: item.teamId });
    setIsMappingFormOpen(true);
  };
  const saveOption = async () => {
    const plantId = canSelectPlant ? selectedPlantId : defaultPlantId;
    if (!plantId || !optionForm.label.trim()) {
      toast.error("Plant and label are required");
      return;
    }
    setSaving(true);
    try {
      const payload = { plantId, optionType: optionForm.optionType, code: normalizeWorkOrderCode(optionForm.code || optionForm.label), label: optionForm.label.trim(), description: optionForm.description.trim() || null, sortOrder: Number.parseInt(optionForm.sortOrder, 10) || 0, isActive: optionForm.isActive };
      if (isEditingOption && selectedOption) await updateWorkOrderMaster(selectedOption.id, payload);
      else await createWorkOrderMaster(payload);
      await reloadPlantData(plantId);
      broadcastWorkOrderSync();
      setIsOptionFormOpen(false);
      toast.success(isEditingOption ? "Work order option updated" : "Work order option created");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save work order option"));
    } finally {
      setSaving(false);
    }
  };
  const saveMapping = async () => {
    const plantId = canSelectPlant ? mappingForm.plantId : defaultPlantId;
    if (!plantId || !mappingForm.departmentId || !mappingForm.category || !mappingForm.teamId) {
      toast.error("Plant, department, category, and team are required");
      return;
    }
    setSaving(true);
    try {
      const payload = { plantId, departmentId: mappingForm.departmentId, category: mappingForm.category, teamId: mappingForm.teamId };
      if (isEditingMapping && selectedMapping) await updateWorkOrderTeamMapping(selectedMapping.id, payload);
      else await createWorkOrderTeamMapping(payload);
      await reloadPlantData(plantId);
      broadcastWorkOrderSync();
      setIsMappingFormOpen(false);
      toast.success(isEditingMapping ? "Routing rule updated" : "Routing rule created");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save routing rule"));
    } finally {
      setSaving(false);
    }
  };
  const deleteOption = async () => {
    if (!selectedOption) return;
    setSaving(true);
    try {
      await deleteWorkOrderMaster(selectedOption.id);
      setMasters((current) => current.filter((item) => item.id !== selectedOption.id));
      broadcastWorkOrderSync();
      setIsOptionDeleteOpen(false);
      toast.success("Work order option deleted");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete work order option"));
    } finally {
      setSaving(false);
    }
  };
  const deleteMapping = async () => {
    if (!selectedMapping) return;
    setSaving(true);
    try {
      await deleteWorkOrderTeamMapping(selectedMapping.id);
      setMappings((current) => current.filter((item) => item.id !== selectedMapping.id));
      broadcastWorkOrderSync();
      setIsMappingDeleteOpen(false);
      toast.success("Routing rule deleted");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete routing rule"));
    } finally {
      setSaving(false);
    }
  };

  const optionColumns = [{ key: "label", header: "Label", render: (item: WorkOrderMaster) => <span className="font-semibold text-primary">{item.label}</span> }, { key: "code", header: "Code", render: (item: WorkOrderMaster) => item.code, hideOnMobile: true }, { key: "sortOrder", header: "Order", render: (item: WorkOrderMaster) => item.sortOrder, hideOnMobile: true }, { key: "status", header: "Status", render: (item: WorkOrderMaster) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> }, { key: "actions", header: "Actions", className: "text-right", render: (item: WorkOrderMaster) => <div className="flex justify-end gap-1">{canManage ? <Button variant="ghost" size="icon" onClick={() => openEditOption(item)}><Edit className="h-4 w-4" /></Button> : null}{canManage ? <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedOption(item); setIsOptionDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button> : null}</div> }];
  const mappingColumns = [{ key: "department", header: "Department", render: (item: WorkOrderTeamMapping) => departmentNameById[item.departmentId || ""] || "Unassigned" }, { key: "category", header: "Category", render: (item: WorkOrderTeamMapping) => <span className="font-semibold text-primary">{labelByCode[item.category] || humanizeWorkOrderCode(item.category)}</span> }, { key: "team", header: "Assigned Team", render: (item: WorkOrderTeamMapping) => teamNameById[item.teamId] || "-", hideOnMobile: true }, { key: "actions", header: "Actions", className: "text-right", render: (item: WorkOrderTeamMapping) => <div className="flex justify-end gap-1">{canManage ? <Button variant="ghost" size="icon" onClick={() => openEditMapping(item)}><Edit className="h-4 w-4" /></Button> : null}{canManage ? <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedMapping(item); setIsMappingDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button> : null}</div> }];
  const renderOptionTab = (tab: Exclude<ConfigTab, "routing">, Icon: typeof Tags, emptyTitle: string, emptyDescription: string) => <DataTableShell title={<span className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{optionTabTitle[tab]} ({optionRows.length})</span>} toolbar={<Toolbar right={<div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search ${optionTabTitle[tab].toLowerCase()}...`} className="h-10 pl-9" /></div>} />}>{loading ? <TableSkeleton /> : !resolvedPlantId && canSelectPlant ? <EmptyState title="Select a plant" description={`Choose a plant first to manage ${optionTabTitle[tab].toLowerCase()}.`} /> : optionRows.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} actionLabel={canManage ? `Add ${optionTabTitle[tab].slice(0, -1)}` : undefined} onAction={canManage ? openAddOption : undefined} /> : <ResponsiveTable data={optionRows} columns={optionColumns} keyExtractor={(item: WorkOrderMaster) => item.id} mobileCard={(item: WorkOrderMaster) => <MobileCard onEdit={canManage ? () => openEditOption(item) : undefined} onDelete={canManage ? () => { setSelectedOption(item); setIsOptionDeleteOpen(true); } : undefined}><MobileCardHeader title={item.label} subtitle={item.code} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} /><MobileCardRow label="Order" value={String(item.sortOrder)} /></MobileCard>} />}</DataTableShell>;

  return (
    <PageShell>
      <BackButton />
      <PageHeader title="Work Order Config" subtitle="Manage work order categories, types, failure codes, and department-wise team routing." actions={canManage ? <Button className="w-full gap-2 sm:w-auto" onClick={activeTab === "routing" ? openAddMapping : openAddOption}><Plus className="h-4 w-4" />{activeTab === "routing" ? "Add Routing Rule" : `Add ${activeTab === "categories" ? "Category" : activeTab === "types" ? "Type" : "Failure Code"}`}</Button> : undefined} />
      <Card className="shadow-card"><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between">{canSelectPlant ? <div className="w-full sm:max-w-sm"><SelectField label="Plant" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" /></div> : <div><p className="text-sm font-medium">Plant</p><p className="text-sm text-muted-foreground">{user?.plantCode || "Plant"} - {user?.plantName || "Assigned Plant"}</p></div>}<div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">These settings drive work order raise, close, and routing flows.</div></CardContent></Card>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ConfigTab)} className="space-y-4"><TabsList className="flex w-full flex-nowrap overflow-x-auto gap-2 bg-transparent p-0 sm:grid sm:grid-cols-4 sm:overflow-visible"><TabsTrigger value="categories">Categories</TabsTrigger><TabsTrigger value="types">WO Types</TabsTrigger><TabsTrigger value="failure-codes">Failure Codes</TabsTrigger><TabsTrigger value="routing">Dept Team Routing</TabsTrigger></TabsList><TabsContent value="categories" className="mt-0">{renderOptionTab("categories", Tags, "No categories found", "Add work order categories for this plant.")}</TabsContent><TabsContent value="types" className="mt-0">{renderOptionTab("types", ClipboardList, "No work order types found", "Add work order types for this plant.")}</TabsContent><TabsContent value="failure-codes" className="mt-0">{renderOptionTab("failure-codes", AlertTriangle, "No failure codes found", "Add failure codes for this plant.")}</TabsContent><TabsContent value="routing" className="mt-0"><DataTableShell title={<span className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />Department Team Routing ({mappingRows.length})</span>} toolbar={<Toolbar right={<div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search routing..." className="h-10 pl-9" /></div>} />}>{loading ? <TableSkeleton /> : !resolvedPlantId && canSelectPlant ? <EmptyState title="Select a plant" description="Choose a plant first to manage routing rules." /> : mappingRows.length === 0 ? <EmptyState title="No routing rules found" description="Map each department category to a maintenance team." actionLabel={canManage ? "Add Routing Rule" : undefined} onAction={canManage ? openAddMapping : undefined} /> : <ResponsiveTable data={mappingRows} columns={mappingColumns} keyExtractor={(item: WorkOrderTeamMapping) => item.id} mobileCard={(item: WorkOrderTeamMapping) => <MobileCard onEdit={canManage ? () => openEditMapping(item) : undefined} onDelete={canManage ? () => { setSelectedMapping(item); setIsMappingDeleteOpen(true); } : undefined}><MobileCardHeader title={labelByCode[item.category] || humanizeWorkOrderCode(item.category)} subtitle={departmentNameById[item.departmentId || ""] || "Unassigned"} /><MobileCardRow label="Assigned Team" value={teamNameById[item.teamId] || "-"} /></MobileCard>} />}</DataTableShell></TabsContent></Tabs>
      <FormDialog open={isOptionFormOpen} onOpenChange={setIsOptionFormOpen} title={isEditingOption ? "Edit Work Order Option" : "Add Work Order Option"} description="These values appear in work order forms and filters." onSubmit={saveOption} submitLabel={isEditingOption ? "Update Option" : "Create Option"} isLoading={saving}><FormGrid><InputField label="Option Type" value={humanizeWorkOrderCode(optionForm.optionType)} onChange={() => {}} disabled /><InputField label="Label" value={optionForm.label} onChange={(value) => setOptionForm((current) => ({ ...current, label: value }))} placeholder="Mechanical" required /><InputField label="Code" value={optionForm.code} onChange={(value) => setOptionForm((current) => ({ ...current, code: normalizeWorkOrderCode(value) }))} placeholder="MECHANICAL" hint="Leave blank to auto-create from the label." /><InputField label="Display Order" type="number" value={optionForm.sortOrder} onChange={(value) => setOptionForm((current) => ({ ...current, sortOrder: value }))} placeholder="10" /></FormGrid><TextareaField label="Description" value={optionForm.description} onChange={(value) => setOptionForm((current) => ({ ...current, description: value }))} placeholder="Optional note for admins" rows={3} /><SwitchField label="Active Option" checked={optionForm.isActive} onChange={(checked) => setOptionForm((current) => ({ ...current, isActive: checked }))} description="Inactive options do not appear in new work order forms." /></FormDialog>
      <FormDialog open={isMappingFormOpen} onOpenChange={setIsMappingFormOpen} title={isEditingMapping ? "Edit Team Routing Rule" : "Add Team Routing Rule"} description="Route each department-wise work order category to the right maintenance team." onSubmit={saveMapping} submitLabel={isEditingMapping ? "Update Routing Rule" : "Create Routing Rule"} isLoading={saving}><FormGrid>{canSelectPlant ? <SelectField label="Plant" value={mappingForm.plantId} onChange={(value) => { setSelectedPlantId(value); setMappingForm((current) => ({ ...current, plantId: value, departmentId: "", teamId: "" })); }} options={plantOptions} placeholder="Select plant" required /> : null}<SelectField label="Department" value={mappingForm.departmentId} onChange={(value) => setMappingForm((current) => ({ ...current, departmentId: value }))} options={departmentOptions} placeholder="Select department" required /><SelectField label="Work Order Category" value={mappingForm.category} onChange={(value) => setMappingForm((current) => ({ ...current, category: value }))} options={activeCategoryOptions} placeholder="Select category" required disabled={activeCategoryOptions.length === 0} /><SelectField label="Assigned Team" value={mappingForm.teamId} onChange={(value) => setMappingForm((current) => ({ ...current, teamId: value }))} options={teamOptions} placeholder="Select team" required disabled={teamOptions.length === 0} /></FormGrid></FormDialog>
      <DeleteConfirmDialog open={isOptionDeleteOpen} onOpenChange={setIsOptionDeleteOpen} title="Delete Work Order Option" itemName={selectedOption?.label} onConfirm={deleteOption} isLoading={saving} />
      <DeleteConfirmDialog open={isMappingDeleteOpen} onOpenChange={setIsMappingDeleteOpen} title="Delete Routing Rule" itemName={selectedMapping ? labelByCode[selectedMapping.category] || humanizeWorkOrderCode(selectedMapping.category) : undefined} onConfirm={deleteMapping} isLoading={saving} />
    </PageShell>
  );
}
