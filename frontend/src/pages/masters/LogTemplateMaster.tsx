import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Search, Edit, Trash2, Eye, Loader2, ClipboardList, ArrowUp, ArrowDown, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  createLogTemplate,
  createLogTemplateAssignment,
  createLogTemplateField,
  deleteLogTemplate,
  deleteLogTemplateAssignment,
  deleteLogTemplateField,
  listLogTemplateAssignments,
  listLogTemplateFields,
  listLogTemplates,
  updateLogTemplate,
} from "@/api/logs";
import { listUsers } from "@/api/users";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/auth.store";
import { useMastersOptions } from "@/hooks/useMastersOptions";

const categoryOptions = [
  { value: "UTILITY", label: "Utility" },
  { value: "MECHANICAL", label: "Mechanical" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "PRODUCTION", label: "Production" },
  { value: "QUALITY", label: "Quality" },
  { value: "SAFETY", label: "Safety" },
];

const frequencyOptions = [
  { value: "SHIFT", label: "Shift" },
  { value: "HOURLY", label: "Hourly" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

const fieldTypeOptions = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "DATE", label: "Date" },
  { value: "TIME", label: "Time" },
  { value: "TEXTAREA", label: "Text Area" },
];

interface TemplateRow {
  id: string;
  templateName: string;
  category: string;
  description: string | null;
  frequency: string;
  reminderMinutesBefore: number;
  overdueAlertMinutes: number;
  notifyAtShiftStart: boolean;
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  machineId: string | null;
  isActive: boolean;
  fieldCount: number;
  assignedCount: number;
}

interface FieldRow {
  id?: string;
  sectionName: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  minValue: number | null;
  maxValue: number | null;
  unit: string;
  displayOrder: number;
}

interface UserOption {
  userId: string;
  fullName: string;
  userCode: string;
}

const emptyForm = {
  templateName: "",
  category: "UTILITY",
  description: "",
  frequency: "PER_SHIFT",
  reminderMinutesBefore: "15",
  overdueAlertMinutes: "30",
  notifyAtShiftStart: true,
  plantId: "",
  departmentId: "",
  moduleId: "",
  machineId: "",
};

const emptyField: FieldRow = {
  sectionName: "General",
  fieldName: "",
  fieldLabel: "",
  fieldType: "TEXT",
  options: null,
  isRequired: false,
  minValue: null,
  maxValue: null,
  unit: "",
  displayOrder: 0,
};

export default function LogTemplateMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const {
    plantsOptions,
    departmentsOptions,
    modulesOptions,
    assetsOptions,
    fetchPlants,
    fetchDepartments,
    fetchModules,
    fetchAssets,
    invalidateOptions,
  } = useMastersOptions();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm, plantId: defaultPlantId });
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [assignedRows, setAssignedRows] = useState<Array<{ id: string; userId: string }>>([]);
  const [viewFields, setViewFields] = useState<FieldRow[]>([]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const templateResponse = await listLogTemplates({
        page: 1,
        limit: 100,
        search: searchQuery || undefined,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });

      const templateRows = await Promise.all(
        templateResponse.data.map(async (template: any) => {
          const [fieldResponse, assignmentResponse] = await Promise.all([
            listLogTemplateFields(template.id),
            listLogTemplateAssignments(template.id),
          ]);
          return {
            id: template.id,
            templateName: template.templateName,
            category: template.category,
            description: template.description,
            frequency: template.frequency,
            reminderMinutesBefore: template.reminderMinutesBefore,
            overdueAlertMinutes: template.overdueAlertMinutes,
            notifyAtShiftStart: template.notifyAtShiftStart,
            plantId: template.plantId,
            departmentId: template.departmentId ?? null,
            moduleId: template.moduleId ?? null,
            machineId: template.machineId ?? null,
            isActive: template.isActive,
            fieldCount: fieldResponse.data.length,
            assignedCount: assignmentResponse.data.length,
          } as TemplateRow;
        }),
      );

      setTemplates(templateRows);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (plantId?: string) => {
    try {
      const response = await listUsers({
        page: 1,
        limit: 100,
        plantId: plantId || (canSelectPlant ? undefined : defaultPlantId || undefined),
      });
      setAllUsers(
        response.data
          .filter((item) => item.isActive)
          .map((item) => ({
            userId: item.userId,
            fullName: item.fullName,
            userCode: item.userCode,
          })),
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to load users");
    }
  };

  useEffect(() => {
    void fetchPlants();
    void fetchUsers(defaultPlantId || undefined);
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [searchQuery, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    const plantId = canSelectPlant ? formData.plantId || undefined : defaultPlantId || undefined;
    if (!plantId) return;
    void fetchDepartments(plantId);
    void fetchModules(plantId, formData.departmentId || undefined);
    void fetchAssets(plantId, formData.departmentId || undefined, formData.moduleId || undefined);
  }, [canSelectPlant, defaultPlantId, formData.plantId, formData.departmentId, formData.moduleId]);

  const filtered = useMemo(
    () => templates.filter((template) => (catFilter === "all" ? true : template.category === catFilter)),
    [templates, catFilter],
  );

  const getPlantName = (plantId: string | null) => plantsOptions.find((option) => option.value === plantId)?.label || "-";
  const getDepartmentName = (departmentId: string | null) => departmentsOptions.find((option) => option.value === departmentId)?.label || "-";
  const getModuleName = (moduleId: string | null) => modulesOptions.find((option) => option.value === moduleId)?.label || "-";
  const getMachineName = (machineId: string | null) => assetsOptions.find((option) => option.value === machineId)?.label || "-";

  const handleSubmitTemplate = async () => {
    if (!formData.templateName.trim()) {
      toast.error("Template name is required");
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
        templateName: formData.templateName.trim(),
        category: formData.category,
        description: formData.description.trim() || null,
        frequency: formData.frequency,
        reminderMinutesBefore: parseInt(formData.reminderMinutesBefore, 10) || 0,
        overdueAlertMinutes: parseInt(formData.overdueAlertMinutes, 10) || 30,
        notifyAtShiftStart: formData.notifyAtShiftStart,
        plantId: resolvedPlantId,
        departmentId: formData.departmentId || null,
        moduleId: formData.moduleId || null,
        machineId: formData.machineId || null,
        isActive: true,
      };
      if (selected) {
        await updateLogTemplate(selected.id, payload);
        toast.success("Template updated");
      } else {
        await createLogTemplate(payload);
        toast.success("Template created");
      }
      setIsFormOpen(false);
      invalidateOptions("plants");
      await fetchTemplates();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save template");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await deleteLogTemplate(selected.id);
      toast.success("Template deactivated");
      setIsDeleteOpen(false);
      await fetchTemplates();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete template");
    } finally {
      setSubmitting(false);
    }
  };

  const openFieldBuilder = async (template: TemplateRow) => {
    setSelected(template);
    try {
      const response = await listLogTemplateFields(template.id);
      setFields(
        response.data.map((field: any, index: number) => ({
          id: field.id,
          sectionName: field.sectionName,
          fieldName: field.fieldName,
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          options: field.options || null,
          isRequired: field.isRequired,
          minValue: field.minValue === null ? null : Number(field.minValue),
          maxValue: field.maxValue === null ? null : Number(field.maxValue),
          unit: field.unit || "",
          displayOrder: field.displayOrder ?? index,
        })),
      );
      setIsFieldsOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load fields");
    }
  };

  const addField = () => setFields((prev) => [...prev, { ...emptyField, displayOrder: prev.length }]);

  const updateField = (index: number, updates: Partial<FieldRow>) => {
    setFields((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, displayOrder: itemIndex })));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next.map((item, itemIndex) => ({ ...item, displayOrder: itemIndex })));
  };

  const saveFields = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const existing = await listLogTemplateFields(selected.id);
      for (const row of existing.data as any[]) {
        await deleteLogTemplateField(row.id);
      }

      for (const field of fields) {
        await createLogTemplateField(selected.id, {
          sectionName: field.sectionName || "General",
          fieldName: field.fieldName || field.fieldLabel.toLowerCase().replace(/\s+/g, "_"),
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          options: field.options && field.options.length > 0 ? field.options : null,
          isRequired: field.isRequired,
          minValue: field.minValue,
          maxValue: field.maxValue,
          unit: field.unit || null,
          displayOrder: field.displayOrder,
        });
      }
      toast.success("Fields saved");
      setIsFieldsOpen(false);
      await fetchTemplates();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save fields");
    } finally {
      setSubmitting(false);
    }
  };

  const openAssign = async (template: TemplateRow) => {
    setSelected(template);
    try {
      await fetchUsers(template.plantId || undefined);
      const response = await listLogTemplateAssignments(template.id);
      setAssignedRows(response.data.map((row: any) => ({ id: row.id, userId: row.userId })));
      setIsAssignOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load assignments");
    }
  };

  const toggleUser = (userId: string) => {
    setAssignedRows((prev) =>
      prev.some((item) => item.userId === userId)
        ? prev.filter((item) => item.userId !== userId)
        : [...prev, { id: "", userId }],
    );
  };

  const saveAssignments = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const existing = await listLogTemplateAssignments(selected.id);
      for (const row of existing.data as any[]) {
        await deleteLogTemplateAssignment(row.id);
      }

      for (const row of assignedRows) {
        await createLogTemplateAssignment({ templateId: selected.id, userId: row.userId });
      }
      toast.success("Assignments saved");
      setIsAssignOpen(false);
      await fetchTemplates();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save assignments");
    } finally {
      setSubmitting(false);
    }
  };

  const openView = async (template: TemplateRow) => {
    setSelected(template);
    try {
      const response = await listLogTemplateFields(template.id);
      setViewFields(
        response.data.map((field: any, index: number) => ({
          id: field.id,
          sectionName: field.sectionName,
          fieldName: field.fieldName,
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          options: field.options || null,
          isRequired: field.isRequired,
          minValue: field.minValue === null ? null : Number(field.minValue),
          maxValue: field.maxValue === null ? null : Number(field.maxValue),
          unit: field.unit || "",
          displayOrder: field.displayOrder ?? index,
        })),
      );
      setIsViewOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load template details");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Template",
      render: (template: TemplateRow) => (
        <div>
          <span className="font-medium block">{template.templateName}</span>
          <span className="text-xs text-muted-foreground">{template.description || "-"}</span>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (template: TemplateRow) => <StatusBadge variant="info" showDot={false}>{template.category}</StatusBadge> },
    { key: "frequency", header: "Frequency", render: (template: TemplateRow) => template.frequency === "PER_SHIFT" ? "Shift" : template.frequency.replace(/_/g, " "), hideOnMobile: true },
    { key: "plant", header: "Plant", render: (template: TemplateRow) => getPlantName(template.plantId), hideOnMobile: true },
    {
      key: "scope",
      header: "Scope",
      render: (template: TemplateRow) => [getDepartmentName(template.departmentId), getModuleName(template.moduleId), getMachineName(template.machineId)].filter((value) => value !== "-").join(" / ") || "Plant",
      hideOnMobile: true,
    },
    { key: "fields", header: "Fields", render: (template: TemplateRow) => <Badge variant="secondary">{template.fieldCount} fields</Badge>, hideOnMobile: true },
    { key: "assigned", header: "Assigned", render: (template: TemplateRow) => <Badge variant="outline">{template.assignedCount} users</Badge>, hideOnMobile: true },
    { key: "status", header: "Status", render: (template: TemplateRow) => <StatusBadge variant={template.isActive ? "active" : "inactive"}>{template.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (template: TemplateRow) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openView(template)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="icon" onClick={() => openFieldBuilder(template)} title="Configure Fields">
                <ClipboardList className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openAssign(template)} title="Assign Users">
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setFormData({
                    templateName: template.templateName,
                    category: template.category,
                    description: template.description || "",
                    frequency: template.frequency === "PER_SHIFT" ? "SHIFT" : template.frequency,
                    reminderMinutesBefore: String(template.reminderMinutesBefore),
                    overdueAlertMinutes: String(template.overdueAlertMinutes),
                    notifyAtShiftStart: template.notifyAtShiftStart,
                    plantId: template.plantId || (canSelectPlant ? "" : defaultPlantId),
                    departmentId: template.departmentId || "",
                    moduleId: template.moduleId || "",
                    machineId: template.machineId || "",
                  });
                  setSelected(template);
                  setIsFormOpen(true);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelected(template); setIsDeleteOpen(true); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Log Template Management</h1>
          <p className="text-sm text-muted-foreground">Configure data logging templates, fields, and user assignments</p>
        </div>
        {canManage && (
          <Button onClick={() => { setFormData({ ...emptyForm, plantId: canSelectPlant ? "" : defaultPlantId }); setSelected(null); setIsFormOpen(true); }} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Template
          </Button>
        )}
      </motion.div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Templates ({filtered.length})
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
              </div>
              <SelectField label="" value={catFilter} onChange={setCatFilter} options={[{ value: "all", label: "All Categories" }, ...categoryOptions]} className="min-w-[150px]" />
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
            <div className="text-center py-12 text-muted-foreground">No log templates found.</div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(template) => template.id}
              mobileCard={(template) => (
                <MobileCard
                  onView={() => openView(template)}
                  onEdit={canManage ? () => {
                    setFormData({
                      templateName: template.templateName,
                      category: template.category,
                      description: template.description || "",
                      frequency: template.frequency === "PER_SHIFT" ? "SHIFT" : template.frequency,
                      reminderMinutesBefore: String(template.reminderMinutesBefore),
                      overdueAlertMinutes: String(template.overdueAlertMinutes),
                      notifyAtShiftStart: template.notifyAtShiftStart,
                      plantId: template.plantId || (canSelectPlant ? "" : defaultPlantId),
                      departmentId: template.departmentId || "",
                      moduleId: template.moduleId || "",
                      machineId: template.machineId || "",
                    });
                    setSelected(template);
                    setIsFormOpen(true);
                  } : undefined}
                  onDelete={canManage ? () => { setSelected(template); setIsDeleteOpen(true); } : undefined}
                >
                  <MobileCardHeader title={template.templateName} subtitle={template.description || undefined} badge={<StatusBadge variant="info" showDot={false}>{template.category}</StatusBadge>} />
                  <MobileCardRow label="Frequency" value={template.frequency.replace(/_/g, " ")} />
                  <MobileCardRow label="Fields" value={`${template.fieldCount} fields`} />
                  <MobileCardRow label="Assigned" value={`${template.assignedCount} users`} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={selected ? "Edit Template" : "Add Template"} description="Configure log template settings" onSubmit={handleSubmitTemplate} submitLabel={submitting ? "Saving..." : selected ? "Update" : "Create"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Template Name" value={formData.templateName} onChange={(value) => setFormData({ ...formData, templateName: value })} placeholder="Boiler Daily Log" required />
          <SelectField label="Category" value={formData.category} onChange={(value) => setFormData({ ...formData, category: value })} options={categoryOptions} required />
          <InputField label="Description" value={formData.description} onChange={(value) => setFormData({ ...formData, description: value })} placeholder="Daily boiler parameters log" />
          <SelectField label="Frequency" value={formData.frequency} onChange={(value) => setFormData({ ...formData, frequency: value })} options={frequencyOptions} required />
          <InputField label="Reminder Before (min)" value={formData.reminderMinutesBefore} onChange={(value) => setFormData({ ...formData, reminderMinutesBefore: value })} type="number" />
          <InputField label="Overdue Alert After (min)" value={formData.overdueAlertMinutes} onChange={(value) => setFormData({ ...formData, overdueAlertMinutes: value })} type="number" />
          {canSelectPlant ? (
            <SelectField
              label="Plant"
              value={formData.plantId}
              onChange={(value) => setFormData({ ...formData, plantId: value, departmentId: "", moduleId: "", machineId: "" })}
              options={plantsOptions}
              placeholder="Select plant"
            />
          ) : (
            <InputField label="Plant" value={getPlantName(defaultPlantId)} onChange={() => {}} disabled />
          )}
          <SelectField
            label="Department"
            value={formData.departmentId}
            onChange={(value) => setFormData({ ...formData, departmentId: value, moduleId: "", machineId: "" })}
            options={departmentsOptions}
            placeholder="Select department"
            disabled={!(canSelectPlant ? formData.plantId : defaultPlantId)}
          />
          <SelectField
            label="Module"
            value={formData.moduleId}
            onChange={(value) => setFormData({ ...formData, moduleId: value, machineId: "" })}
            options={modulesOptions}
            placeholder="Select module"
            disabled={!(canSelectPlant ? formData.plantId : defaultPlantId)}
          />
          <SelectField
            label="Machine (Optional)"
            value={formData.machineId}
            onChange={(value) => setFormData({ ...formData, machineId: value })}
            options={assetsOptions}
            placeholder="Select machine"
            disabled={!(canSelectPlant ? formData.plantId : defaultPlantId)}
          />
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="notifyShift" checked={formData.notifyAtShiftStart} onCheckedChange={(value) => setFormData({ ...formData, notifyAtShiftStart: !!value })} />
            <Label htmlFor="notifyShift">Notify at shift start</Label>
          </div>
        </div>
      </FormDialog>

      <Dialog open={isFieldsOpen} onOpenChange={setIsFieldsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Fields - {selected?.templateName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveField(index, -1)} disabled={index === 0}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InputField label="Field Label" value={field.fieldLabel} onChange={(value) => updateField(index, { fieldLabel: value, fieldName: value.toLowerCase().replace(/\s+/g, "_") })} placeholder="Temperature" required />
                    <SelectField label="Type" value={field.fieldType} onChange={(value) => updateField(index, { fieldType: value })} options={fieldTypeOptions} />
                    <InputField label="Section" value={field.sectionName} onChange={(value) => updateField(index, { sectionName: value })} placeholder="General" />
                    <InputField label="Unit" value={field.unit} onChange={(value) => updateField(index, { unit: value })} placeholder="C, PSI, kW" />
                    {field.fieldType === "NUMBER" && (
                      <>
                        <InputField label="Min" value={field.minValue?.toString() || ""} onChange={(value) => updateField(index, { minValue: value ? Number(value) : null })} type="number" />
                        <InputField label="Max" value={field.maxValue?.toString() || ""} onChange={(value) => updateField(index, { maxValue: value ? Number(value) : null })} type="number" />
                      </>
                    )}
                    {field.fieldType === "DROPDOWN" && (
                      <div className="sm:col-span-3">
                        <InputField label="Options (comma-separated)" value={(field.options || []).join(", ")} onChange={(value) => updateField(index, { options: value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Normal, High, Low" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox checked={field.isRequired} onCheckedChange={(value) => updateField(index, { isRequired: !!value })} />
                      <Label className="text-sm">Required</Label>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => removeField(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" onClick={addField} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add Field
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFieldsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFields} disabled={submitting}>
              {submitting ? "Saving..." : "Save Fields"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Users - {selected?.templateName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {allUsers.map((item) => (
              <div key={item.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                <Checkbox checked={assignedRows.some((row) => row.userId === item.userId)} onCheckedChange={() => toggleUser(item.userId)} />
                <div>
                  <p className="text-sm font-medium">{item.fullName}</p>
                  <p className="text-xs text-muted-foreground">{item.userCode}</p>
                </div>
              </div>
            ))}
            {allUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No users found</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAssignments} disabled={submitting}>
              {submitting ? "Saving..." : `Save (${assignedRows.length} users)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selected?.templateName || ""} subtitle={selected?.category}>
        {selected && (
          <div className="space-y-6">
            <DetailSection title="Template Info">
              <DetailRow label="Name" value={selected.templateName} />
              <DetailRow label="Category" value={selected.category} />
              <DetailRow label="Frequency" value={selected.frequency === "PER_SHIFT" ? "Shift" : selected.frequency.replace(/_/g, " ")} />
              <DetailRow label="Plant" value={getPlantName(selected.plantId)} />
              <DetailRow label="Department" value={getDepartmentName(selected.departmentId)} />
              <DetailRow label="Module" value={getModuleName(selected.moduleId)} />
              <DetailRow label="Machine" value={getMachineName(selected.machineId)} />
              <DetailRow label="Description" value={selected.description || "-"} />
              <DetailRow label="Reminder" value={`${selected.reminderMinutesBefore} min before`} />
              <DetailRow label="Overdue Alert" value={`After ${selected.overdueAlertMinutes} min`} />
              <DetailRow label="Notify Shift Start" value={selected.notifyAtShiftStart ? "Yes" : "No"} />
            </DetailSection>
            {viewFields.length > 0 && (
              <DetailSection title={`Fields (${viewFields.length})`}>
                {viewFields.map((field, index) => (
                  <DetailRow key={index} label={field.fieldLabel} value={`${field.fieldType}${field.unit ? ` (${field.unit})` : ""}${field.isRequired ? " - Required" : ""}`} />
                ))}
              </DetailSection>
            )}
          </div>
        )}
      </ViewDialog>

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} onConfirm={confirmDelete} title="Delete Template" description={`Are you sure you want to delete "${selected?.templateName}"?`} isLoading={submitting} />
    </div>
  );
}
