import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Plus, Eye, Loader2, CheckCircle2, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { dbClient } from "@/api/dbClient";
import { useAuthStore, isAdmin } from "@/store/auth.store";
import { format } from "date-fns";

interface Template {
  id: string;
  templateName: string;
  category: string;
  description: string | null;
  frequency: string;
}

interface Field {
  id: string;
  sectionName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  minValue: number | null;
  maxValue: number | null;
  unit: string;
  displayOrder: number;
}

interface Shift {
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
}

interface LogEntry {
  id: string;
  templateId: string;
  templateName: string;
  shiftName: string;
  logDate: string;
  status: string;
  createdAt: string;
}

export default function DataLogging() {
  const { user } = useAuthStore();
  const userIsAdmin = isAdmin(user);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fill");

  // Fill log state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedShift, setSelectedShift] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // View state
  const [viewEntry, setViewEntry] = useState<LogEntry | null>(null);
  const [viewFields, setViewFields] = useState<{ label: string; value: string; unit: string }[]>([]);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch templates assigned to this user (or all for admins)
    let templateIds: string[] = [];
    if (!userIsAdmin) {
      const { data: assignments } = await dbClient
        .from("log_template_users")
        .select("template_id")
        .eq("user_id", user.authId);
      templateIds = (assignments || []).map(a => a.template_id);
    }

    let query = dbClient.from("log_templates").select("*").eq("is_active", true);
    if (!userIsAdmin && templateIds.length > 0) {
      query = query.in("id", templateIds);
    } else if (!userIsAdmin && templateIds.length === 0) {
      setTemplates([]);
      setLoading(false);
      // Still fetch entries
      await fetchEntries([]);
      return;
    }

    const { data: tmpl } = await query;
    const mapped = (tmpl || []).map(t => ({
      id: t.id, templateName: t.template_name, category: t.category,
      description: t.description, frequency: t.frequency,
    }));
    setTemplates(mapped);

    // Fetch shifts
    const { data: sh } = await dbClient.from("shifts").select("*").eq("is_active", true);
    setShifts((sh || []).map(s => ({ id: s.id, shiftName: s.shift_name, startTime: s.start_time, endTime: s.end_time })));

    await fetchEntries(mapped.map(t => t.id));
    setLoading(false);
  };

  const fetchEntries = async (tIds: string[]) => {
    let query = dbClient.from("log_entries").select("*, log_templates(template_name), shifts(shift_name)")
      .order("created_at", { ascending: false }).limit(50);

    if (!userIsAdmin) {
      query = query.eq("logged_by", user!.authId);
    }

    const { data } = await query;
    setEntries((data || []).map((e: any) => ({
      id: e.id, templateId: e.template_id,
      templateName: e.log_templates?.template_name || "—",
      shiftName: e.shifts?.shift_name || "—",
      logDate: e.log_date, status: e.status,
      createdAt: e.created_at,
    })));
  };

  const openLogForm = async (tmpl: Template) => {
    setSelectedTemplate(tmpl);
    setSelectedShift("");
    setRemarks("");
    setValues({});

    const { data } = await dbClient.from("log_template_fields").select("*").eq("template_id", tmpl.id).order("display_order");
    setFields((data || []).map(f => ({
      id: f.id, sectionName: f.section_name, fieldLabel: f.field_label,
      fieldType: f.field_type, options: f.options as string[] | null,
      isRequired: f.is_required, minValue: f.min_value, maxValue: f.max_value,
      unit: f.unit || "", displayOrder: f.display_order,
    })));
    setIsFormOpen(true);
  };

  const submitLog = async (status: "DRAFT" | "SUBMITTED") => {
    if (!selectedTemplate || !selectedShift) {
      toast.error("Please select a shift"); return;
    }

    // Validate required fields
    const missing = fields.filter(f => f.isRequired && !values[f.id]);
    if (missing.length > 0 && status === "SUBMITTED") {
      toast.error(`Please fill required fields: ${missing.map(f => f.fieldLabel).join(", ")}`);
      return;
    }

    // Validate number ranges
    for (const f of fields) {
      if (f.fieldType === "NUMBER" && values[f.id]) {
        const num = Number(values[f.id]);
        if (f.minValue !== null && num < f.minValue) {
          toast.error(`${f.fieldLabel} must be ≥ ${f.minValue}`); return;
        }
        if (f.maxValue !== null && num > f.maxValue) {
          toast.error(`${f.fieldLabel} must be ≤ ${f.maxValue}`); return;
        }
      }
    }

    setSubmitting(true);
    try {
      const { data: entry, error: entryErr } = await dbClient.from("log_entries").insert({
        template_id: selectedTemplate.id,
        shift_id: selectedShift,
        plant_id: user?.plantId || null,
        logged_by: user!.authId,
        status,
        submitted_at: status === "SUBMITTED" ? new Date().toISOString() : null,
        remarks: remarks || null,
      }).select().single();

      if (entryErr) throw entryErr;

      // Insert field values
      const valueRows = Object.entries(values)
        .filter(([_, v]) => v !== "")
        .map(([fieldId, val]) => ({
          entry_id: entry.id, field_id: fieldId, value: val,
        }));

      if (valueRows.length > 0) {
        const { error: valErr } = await dbClient.from("log_entry_values").insert(valueRows);
        if (valErr) throw valErr;
      }

      toast.success(status === "SUBMITTED" ? "Log submitted successfully" : "Draft saved");
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    setSubmitting(false);
  };

  const openViewEntry = async (entry: LogEntry) => {
    setViewEntry(entry);
    const { data: vals } = await dbClient.from("log_entry_values").select("*, log_template_fields(field_label, unit)").eq("entry_id", entry.id);
    setViewFields((vals || []).map((v: any) => ({
      label: v.log_template_fields?.field_label || "—",
      value: v.value || "—",
      unit: v.log_template_fields?.unit || "",
    })));
    setIsViewOpen(true);
  };

  const getStatusColor = (s: string) => {
    if (s === "SUBMITTED") return "active" as const;
    if (s === "APPROVED") return "primary" as const;
    if (s === "DRAFT") return "default" as const;
    return "inactive" as const;
  };

  // Group fields by section
  const sections = fields.reduce<Record<string, Field[]>>((acc, f) => {
    (acc[f.sectionName] = acc[f.sectionName] || []).push(f);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Data Logging</h1>
        <p className="text-sm text-muted-foreground">Shift-wise data entry for plant operations</p>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="fill" className="gap-2"><Plus className="h-4 w-4" />Fill Log</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><Clock className="h-4 w-4" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="fill" className="mt-4">
          {templates.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No log templates assigned to you yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Contact your administrator to get assigned.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl, idx) => (
                <motion.div key={tmpl.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}>
                  <Card className="shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer group" onClick={() => openLogForm(tmpl)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg p-2.5 bg-primary text-primary-foreground">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">{tmpl.templateName}</CardTitle>
                          <StatusBadge variant="info" showDot={false} className="mt-1">{tmpl.category}</StatusBadge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground">{tmpl.description || "Click to fill log"}</p>
                      <Badge variant="outline" className="mt-2">{tmpl.frequency.replace(/_/g, " ")}</Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold">Recent Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No log entries yet</p>
              ) : (
                <div className="space-y-3">
                  {entries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer" onClick={() => openViewEntry(entry)}>
                      <div>
                        <p className="font-medium text-sm">{entry.templateName}</p>
                        <p className="text-xs text-muted-foreground">{entry.shiftName} • {format(new Date(entry.logDate), "dd MMM yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge variant={getStatusColor(entry.status)}>{entry.status}</StatusBadge>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Entry Form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.templateName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Shift selector */}
            <div className="space-y-2">
              <Label>Shift *</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {shifts.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.shiftName} ({s.startTime} - {s.endTime})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic fields by section */}
            {Object.entries(sections).map(([section, sFields]) => (
              <div key={section} className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">{section}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sFields.map(field => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="text-sm">
                        {field.fieldLabel}
                        {field.unit && <span className="text-muted-foreground ml-1">({field.unit})</span>}
                        {field.isRequired && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field.fieldType === "TEXT" && (
                        <Input value={values[field.id] || ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })} />
                      )}
                      {field.fieldType === "NUMBER" && (
                        <Input type="number" value={values[field.id] || ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })}
                          min={field.minValue ?? undefined} max={field.maxValue ?? undefined} />
                      )}
                      {field.fieldType === "TEXTAREA" && (
                        <Textarea value={values[field.id] || ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })} rows={3} />
                      )}
                      {field.fieldType === "DATE" && (
                        <Input type="date" value={values[field.id] || ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })} />
                      )}
                      {field.fieldType === "TIME" && (
                        <Input type="time" value={values[field.id] || ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })} />
                      )}
                      {field.fieldType === "CHECKBOX" && (
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox checked={values[field.id] === "true"} onCheckedChange={v => setValues({ ...values, [field.id]: v ? "true" : "false" })} />
                          <span className="text-sm">{values[field.id] === "true" ? "Yes" : "No"}</span>
                        </div>
                      )}
                      {field.fieldType === "DROPDOWN" && field.options && (
                        <Select value={values[field.id] || ""} onValueChange={v => setValues({ ...values, [field.id]: v })}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {field.options.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {field.fieldType === "NUMBER" && (field.minValue !== null || field.maxValue !== null) && (
                        <p className="text-xs text-muted-foreground">
                          {field.minValue !== null && `Min: ${field.minValue}`}
                          {field.minValue !== null && field.maxValue !== null && " • "}
                          {field.maxValue !== null && `Max: ${field.maxValue}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any additional notes..." rows={2} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => submitLog("DRAFT")} disabled={submitting}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Save Draft
            </Button>
            <Button onClick={() => submitLog("SUBMITTED")} disabled={submitting}>
              <Send className="h-4 w-4 mr-2" />{submitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Entry Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewEntry?.templateName}</DialogTitle>
          </DialogHeader>
          {viewEntry && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{viewEntry.shiftName} • {format(new Date(viewEntry.logDate), "dd MMM yyyy")}</span>
                <StatusBadge variant={getStatusColor(viewEntry.status)}>{viewEntry.status}</StatusBadge>
              </div>
              <div className="space-y-2">
                {viewFields.map((f, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm text-muted-foreground">{f.label}</span>
                    <span className="text-sm font-medium">{f.value}{f.unit && ` ${f.unit}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
