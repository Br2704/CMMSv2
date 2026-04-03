import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ClipboardList, Clock3, Factory, Loader2, Send } from "lucide-react";
import { createDataLoggingEntry, listAssignedDataLoggingTemplates, listMyDataLoggingEntries, type DataLoggingField, type DataLoggingTemplate } from "@/api/datalogging";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/store/auth.store";

type FormValues = Record<string, string>;

function normalizeFrequencyLabel(value: string) {
  if (value === "SHIFT") return "Shift";
  if (value === "HOURLY") return "Hourly";
  if (value === "DAILY") return "Daily";
  if (value === "WEEKLY") return "Weekly";
  return value;
}

function scopeLabel(template: DataLoggingTemplate) {
  return [template.departmentName, template.moduleName, template.machineName].filter(Boolean).join(" / ");
}

function fieldRangeHint(field: DataLoggingField) {
  if (field.minValue && field.maxValue) {
    return `${field.minValue} to ${field.maxValue}`;
  }
  if (field.minValue) {
    return `Min ${field.minValue}`;
  }
  if (field.maxValue) {
    return `Max ${field.maxValue}`;
  }
  return null;
}

export default function Logs() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [activeTemplate, setActiveTemplate] = useState<DataLoggingTemplate | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [values, setValues] = useState<FormValues>({});

  const templatesQuery = useQuery({
    queryKey: ["operational-log-templates", user?.plantId ?? null],
    queryFn: async () => {
      const response = await listAssignedDataLoggingTemplates({ assignedOnly: true, plantId: user?.plantId ?? undefined });
      return response.data;
    },
    enabled: !!user,
  });

  const entriesQuery = useQuery({
    queryKey: ["my-operational-log-entries", user?.plantId ?? null],
    queryFn: async () => {
      const response = await listMyDataLoggingEntries({ page: 1, limit: 10, plantId: user?.plantId ?? undefined });
      return response.data ?? [];
    },
    enabled: !!user,
  });

  const shifts = templatesQuery.data?.shifts ?? [];
  const templates = useMemo(
    () => (templatesQuery.data?.templates ?? []).sort((a, b) => a.templateName.localeCompare(b.templateName)),
    [templatesQuery.data],
  );
  const groupedFields = useMemo(() => {
    if (!activeTemplate) return [];
    const sections = new Map<string, DataLoggingField[]>();
    for (const field of [...activeTemplate.fields].sort((a, b) => a.displayOrder - b.displayOrder)) {
      const key = field.sectionName || "General";
      const current = sections.get(key) ?? [];
      current.push(field);
      sections.set(key, current);
    }
    return Array.from(sections.entries());
  }, [activeTemplate]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!activeTemplate) {
        throw new Error("Select a template");
      }
      if (activeTemplate.frequency === "SHIFT" && !selectedShiftId) {
        throw new Error("Select a shift");
      }

      for (const field of activeTemplate.fields) {
        const value = values[field.id] ?? "";
        if (field.isRequired && value.trim() === "") {
          throw new Error(`${field.fieldLabel} is required`);
        }
        if (field.fieldType === "NUMBER" && value.trim() !== "") {
          const numeric = Number(value);
          if (Number.isNaN(numeric)) {
            throw new Error(`${field.fieldLabel} must be a number`);
          }
          if (field.minValue !== null && numeric < Number(field.minValue)) {
            throw new Error(`${field.fieldLabel} cannot be below ${field.minValue}`);
          }
          if (field.maxValue !== null && numeric > Number(field.maxValue)) {
            throw new Error(`${field.fieldLabel} cannot exceed ${field.maxValue}`);
          }
        }
      }

      return createDataLoggingEntry({
        templateId: activeTemplate.id,
        shiftId: activeTemplate.frequency === "SHIFT" ? selectedShiftId : null,
        plantId: activeTemplate.plantId,
        remarks: remarks.trim() || null,
        status: "SUBMITTED",
        values: activeTemplate.fields.map((field) => ({
          fieldId: field.id,
          value: values[field.id] ?? null,
        })),
      });
    },
    onSuccess: () => {
      toast.success("Operational log submitted");
      setActiveTemplate(null);
      setSelectedShiftId("");
      setRemarks("");
      setValues({});
      void queryClient.invalidateQueries({ queryKey: ["my-operational-log-entries"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to submit log";
      toast.error(message);
    },
  });

  const openTemplate = (template: DataLoggingTemplate) => {
    setActiveTemplate(template);
    setSelectedShiftId("");
    setRemarks("");
    setValues({});
  };

  const renderFieldInput = (field: DataLoggingField) => {
    const value = values[field.id] ?? "";
    if (field.fieldType === "TEXTAREA") {
      return <Textarea value={value} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} rows={3} />;
    }
    if (field.fieldType === "DROPDOWN") {
      return (
        <Select value={value} onValueChange={(nextValue) => setValues((current) => ({ ...current, [field.id]: nextValue }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.fieldType === "CHECKBOX") {
      return (
        <Select value={value || "false"} onValueChange={(nextValue) => setValues((current) => ({ ...current, [field.id]: nextValue }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    const inputType =
      field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : field.fieldType === "TIME" ? "time" : "text";
    return (
      <Input
        type={inputType}
        value={value}
        onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
      />
    );
  };

  if (templatesQuery.isLoading) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Operational Logs" subtitle="Only the log templates assigned to your account appear here." />

      {templates.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium">No log templates assigned to your account.</p>
              <p className="text-sm text-muted-foreground">Contact your administrator to receive operational log assignments.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className="shadow-card transition-colors hover:border-primary/40">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{template.templateName}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{template.description || "Structured operational log template"}</p>
                    </div>
                    <StatusBadge variant="info" showDot={false}>
                      {normalizeFrequencyLabel(template.frequency)}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{template.fields.length} fields</Badge>
                    {template.machineName ? <Badge variant="secondary">{template.machineName}</Badge> : null}
                  </div>
                  {scopeLabel(template) ? (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Factory className="mt-0.5 h-4 w-4" />
                      <span>{scopeLabel(template)}</span>
                    </div>
                  ) : null}
                  <Button className="w-full" onClick={() => openTemplate(template)}>
                    Open Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4 text-primary" />
                Recent Entries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {entriesQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (entriesQuery.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No operational logs submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {(entriesQuery.data ?? []).map((entry) => (
                    <div key={entry.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{entry.templateName}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.createdAt), "dd MMM yyyy, HH:mm")}
                            {entry.shiftName ? ` • ${entry.shiftName}` : ""}
                          </p>
                        </div>
                        <StatusBadge variant="active">{entry.status}</StatusBadge>
                      </div>
                      {entry.values.length > 0 ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {entry.values.slice(0, 4).map((value) => (
                            <div key={value.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                              <span className="text-muted-foreground">{value.fieldLabel}</span>
                              <div className="font-medium">
                                {value.value || "-"}
                                {value.unit ? ` ${value.unit}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!activeTemplate} onOpenChange={(open) => (!open ? setActiveTemplate(null) : null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeTemplate?.templateName}</DialogTitle>
          </DialogHeader>

          {activeTemplate ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{normalizeFrequencyLabel(activeTemplate.frequency)}</Badge>
                {activeTemplate.departmentName ? <Badge variant="secondary">{activeTemplate.departmentName}</Badge> : null}
                {activeTemplate.moduleName ? <Badge variant="secondary">{activeTemplate.moduleName}</Badge> : null}
                {activeTemplate.machineName ? <Badge variant="secondary">{activeTemplate.machineName}</Badge> : null}
              </div>

              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Entry time: {format(new Date(), "dd MMM yyyy, HH:mm")}
              </div>

              {activeTemplate.frequency === "SHIFT" ? (
                <div className="space-y-2">
                  <Label>Shift</Label>
                  <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.map((shift) => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.shiftName} ({shift.startTime} - {shift.endTime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {groupedFields.map(([sectionName, fields]) => (
                <div key={sectionName} className="space-y-4">
                  <div>
                    <h3 className="font-medium">{sectionName}</h3>
                    <div className="mt-1 h-px bg-border" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label>
                          {field.fieldLabel}
                          {field.unit ? ` (${field.unit})` : ""}
                          {field.isRequired ? <span className="ml-1 text-destructive">*</span> : null}
                        </Label>
                        {renderFieldInput(field)}
                        {fieldRangeHint(field) ? <p className="text-xs text-muted-foreground">{fieldRangeHint(field)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <Label>Operator Remarks</Label>
                <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
