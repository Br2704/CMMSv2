import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KPICard } from "@/components/dashboard/KPICard";
import { ShieldCheck, AlertTriangle, Calendar, Plus, Search, Eye, Loader2, Link2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dbClient } from "@/api/dbClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, isAdmin } from "@/store/auth.store";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormGrid } from "@/components/layout/FormGrid";
import { FilterToolbar } from "@/components/layout/FilterToolbar";

const INCIDENT_TYPES = [
  { value: "NEAR_MISS", label: "Near Miss" },
  { value: "FIRST_AID", label: "First Aid" },
  { value: "MEDICAL_TREATMENT", label: "Medical Treatment" },
  { value: "LOST_TIME", label: "Lost Time Injury" },
  { value: "PROPERTY_DAMAGE", label: "Property Damage" },
  { value: "ENVIRONMENTAL", label: "Environmental" },
  { value: "HAZARD_REPORT", label: "Hazard Report" },
  { value: "FIRE", label: "Fire" },
];

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Safety() {
  const { user, session } = useAuthStore();
  const userIsAdmin = isAdmin(user);
  const queryClient = useQueryClient();

  // Fetch incidents from DB
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["safety_incidents"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("safety_incidents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch safety metrics
  const { data: safetyMetrics = [] } = useQuery({
    queryKey: ["safety_metrics"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("safety_metrics")
        .select("*, log_templates(id, template_name), log_template_fields(id, field_label, unit)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch log data for metrics
  const { data: logData = [] } = useQuery({
    queryKey: ["safety_log_data", safetyMetrics.map((m: any) => m.id).join(",")],
    queryFn: async () => {
      const fieldIds = safetyMetrics.filter((m: any) => m.field_id).map((m: any) => m.field_id);
      if (fieldIds.length === 0) return [];
      const { data, error } = await dbClient.from("log_entry_values")
        .select("field_id, value, created_at").in("field_id", fieldIds);
      if (error) throw error;
      return data;
    },
    enabled: safetyMetrics.length > 0,
  });

  // Fetch templates for metric linking
  const { data: templates = [] } = useQuery({
    queryKey: ["log_templates_for_safety"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("log_templates").select("id, template_name").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const { data: templateFields = [] } = useQuery({
    queryKey: ["safety_template_fields", selectedTemplateId],
    queryFn: async () => {
      if (!selectedTemplateId) return [];
      const { data, error } = await dbClient.from("log_template_fields")
        .select("id, field_label, field_type, unit").eq("template_id", selectedTemplateId).in("field_type", ["NUMBER", "TEXT"]);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTemplateId,
  });

  // KPIs
  const kpis = useMemo(() => {
    const openIncidents = incidents.filter((i: any) => i.status === "OPEN" || i.status === "UNDER_INVESTIGATION").length;
    const closedIncidents = incidents.filter((i: any) => i.status === "CLOSED").length;
    const lastIncident = incidents.find((i: any) => i.status === "CLOSED" && i.incident_type !== "NEAR_MISS");
    const daysSince = lastIncident ? differenceInDays(new Date(), new Date(lastIncident.incident_date)) : incidents.length === 0 ? 0 : 999;
    const totalLostTime = incidents.reduce((s: number, i: any) => s + (i.lost_time_hours || 0), 0);
    return { openIncidents, closedIncidents, daysSince: daysSince > 900 ? "N/A" : String(daysSince), totalLostTime };
  }, [incidents]);

  // Chart data
  const typeChart = useMemo(() => {
    const types: Record<string, number> = {};
    incidents.forEach((i: any) => { types[i.incident_type] = (types[i.incident_type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [incidents]);

  const severityChart = useMemo(() => {
    const sevs: Record<string, number> = {};
    incidents.forEach((i: any) => { sevs[i.severity] = (sevs[i.severity] || 0) + 1; });
    return Object.entries(sevs).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMetricFormOpen, setIsMetricFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [formData, setFormData] = useState({
    incident_type: "", location: "", description: "", severity: "LOW",
    immediate_action: "", people_involved: "0",
  });
  const [metricForm, setMetricForm] = useState({
    metric_name: "", category: "General", unit: "", target_value: "",
    template_id: "", field_id: "", aggregation_method: "SUM",
  });

  const filteredIncidents = incidents.filter((i: any) =>
    i.incident_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.incident_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSeverityVariant = (s: string) => {
    switch (s) { case "CRITICAL": return "critical" as const; case "HIGH": return "warning" as const; case "MEDIUM": return "info" as const; default: return "default" as const; }
  };
  const getStatusVariant = (s: string) => {
    switch (s) { case "CLOSED": return "completed" as const; case "UNDER_INVESTIGATION": return "in_progress" as const; case "OPEN": return "scheduled" as const; default: return "default" as const; }
  };

  const handleAdd = () => {
    setFormData({ incident_type: "", location: "", description: "", severity: "LOW", immediate_action: "", people_involved: "0" });
    setIsFormOpen(true);
  };

  const handleView = (incident: any) => { setSelectedIncident(incident); setIsViewOpen(true); };

  const handleSubmit = async () => {
    if (!formData.incident_type || !formData.description) {
      toast.error("Please fill required fields"); return;
    }
    const { error } = await dbClient.from("safety_incidents").insert({
      incident_number: "",
      incident_type: formData.incident_type,
      severity: formData.severity,
      location: formData.location || null,
      description: formData.description,
      immediate_action: formData.immediate_action || null,
      people_involved: parseInt(formData.people_involved) || 0,
      reported_by: session?.user?.id!,
      plant_id: user?.plantId || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incident reported successfully");
    queryClient.invalidateQueries({ queryKey: ["safety_incidents"] });
    setIsFormOpen(false);
  };

  const handleAddMetric = () => {
    setMetricForm({ metric_name: "", category: "General", unit: "", target_value: "", template_id: "", field_id: "", aggregation_method: "SUM" });
    setSelectedTemplateId("");
    setIsMetricFormOpen(true);
  };

  const handleMetricSubmit = async () => {
    if (!metricForm.metric_name) { toast.error("Metric name is required"); return; }
    const { error } = await dbClient.from("safety_metrics").insert({
      metric_name: metricForm.metric_name,
      category: metricForm.category,
      unit: metricForm.unit || null,
      target_value: parseFloat(metricForm.target_value) || null,
      template_id: metricForm.template_id || null,
      field_id: metricForm.field_id || null,
      aggregation_method: metricForm.aggregation_method,
      plant_id: user?.plantId || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Safety metric created");
    queryClient.invalidateQueries({ queryKey: ["safety_metrics"] });
    setIsMetricFormOpen(false);
  };

  const updateIncidentStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "CLOSED") updates.closure_date = new Date().toISOString();
    const { error } = await dbClient.from("safety_incidents").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Incident ${status.toLowerCase().replace(/_/g, " ")}`);
    queryClient.invalidateQueries({ queryKey: ["safety_incidents"] });
  };

  const columns = [
    { key: "id", header: "ID", render: (i: any) => <span className="font-semibold text-primary">{i.incident_number}</span> },
    { key: "type", header: "Type", render: (i: any) => i.incident_type?.replace(/_/g, " ") },
    { key: "location", header: "Location", render: (i: any) => i.location || "—", hideOnMobile: true },
    { key: "severity", header: "Severity", render: (i: any) => <StatusBadge variant={getSeverityVariant(i.severity)}>{i.severity}</StatusBadge> },
    { key: "status", header: "Status", render: (i: any) => <StatusBadge variant={getStatusVariant(i.status)}>{i.status?.replace(/_/g, " ")}</StatusBadge> },
    { key: "date", header: "Date", render: (i: any) => format(new Date(i.incident_date), "dd MMM yyyy"), hideOnMobile: true },
    { key: "actions", header: "", className: "text-right", render: (i: any) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={() => handleView(i)}><Eye className="h-4 w-4" /></Button>
        {userIsAdmin && i.status === "OPEN" && <Button variant="outline" size="sm" onClick={() => updateIncidentStatus(i.id, "UNDER_INVESTIGATION")}>Investigate</Button>}
        {userIsAdmin && i.status === "UNDER_INVESTIGATION" && <Button variant="outline" size="sm" onClick={() => updateIncidentStatus(i.id, "CLOSED")}>Close</Button>}
      </div>
    )},
  ];

  return (
    <PageShell>
      <PageHeader
        title="Safety Management"
        subtitle="Track incidents, hazards, and safety compliance"
        actions={
          <>
            {userIsAdmin && (
              <Button variant="outline" onClick={handleAddMetric} className="gap-2">
                <Link2 className="h-4 w-4" />
                Add Metric
              </Button>
            )}
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4" />
              Report Incident
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Days Without Incident" value={kpis.daysSince} subtitle="Current streak" icon={ShieldCheck} variant="success" />
        <KPICard title="Open Incidents" value={String(kpis.openIncidents)} subtitle="Requires attention" icon={AlertTriangle} variant="warning" />
        <KPICard title="Closed Incidents" value={String(kpis.closedIncidents)} subtitle="Resolved" icon={ShieldCheck} variant="info" />
        <KPICard title="Lost Time Hours" value={String(kpis.totalLostTime)} subtitle="Total hours lost" icon={Calendar} variant="primary" />
      </div>

      <Tabs defaultValue="incidents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="metrics">Safety Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="incidents">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <FilterToolbar
                left={
                  <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />Safety Incidents ({filteredIncidents.length})
                  </CardTitle>
                }
                right={
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search incidents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 pl-9" />
                  </div>
                }
              />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : incidents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No incidents reported</p>
                  <p className="text-sm">Report safety incidents using the button above</p>
                </div>
              ) : (
                <ResponsiveTable data={filteredIncidents} columns={columns} keyExtractor={(i: any) => i.id}
                  mobileCard={(incident: any) => (
                    <MobileCard onView={() => handleView(incident)}>
                      <MobileCardHeader title={incident.incident_number} subtitle={incident.incident_type?.replace(/_/g, " ")} badge={<StatusBadge variant={getStatusVariant(incident.status)}>{incident.status?.replace(/_/g, " ")}</StatusBadge>} />
                      <MobileCardRow label="Location" value={incident.location || "—"} />
                      <MobileCardRow label="Severity" value={<StatusBadge variant={getSeverityVariant(incident.severity)}>{incident.severity}</StatusBadge>} />
                      <MobileCardRow label="Date" value={format(new Date(incident.incident_date), "dd MMM yyyy")} />
                    </MobileCard>
                  )}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Incidents by Type</CardTitle></CardHeader>
              <CardContent>
                {typeChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={typeChart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" name="Count" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No data</div>}
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Incidents by Severity</CardTitle></CardHeader>
              <CardContent>
                {severityChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={severityChart} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }: any) => `${name}: ${value}`}>
                        {severityChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No data</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />Safety Metrics (Linked to Data Logging)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {safetyMetrics.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Link2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No safety metrics configured</p>
                  <p className="text-sm">Admin can link data logging templates to track safety KPIs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {safetyMetrics.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border bg-card p-3 sm:p-4">
                      <div>
                        <p className="font-medium text-sm">{m.metric_name}</p>
                        <p className="text-xs text-muted-foreground">{m.category} • {m.log_templates?.template_name || "Manual"} • Agg: {m.aggregation_method}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{m.target_value ? `Target: ${m.target_value} ${m.unit || ""}` : "No target"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Report Incident Form */}
      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title="Report Safety Incident" description="Report a new safety incident or hazard" onSubmit={handleSubmit} submitLabel="Submit Report" size="xl">
        <div className="space-y-6">
          <FormGrid>
            <SelectField label="Incident Type *" value={formData.incident_type} onChange={(v) => setFormData({ ...formData, incident_type: v })} options={INCIDENT_TYPES} placeholder="Select type" required />
            <SelectField label="Severity *" value={formData.severity} onChange={(v) => setFormData({ ...formData, severity: v })} options={SEVERITY_OPTIONS} required />
            <InputField label="Location" value={formData.location} onChange={(v) => setFormData({ ...formData, location: v })} placeholder="e.g., Production Floor A" />
            <InputField label="People Involved" value={formData.people_involved} onChange={(v) => setFormData({ ...formData, people_involved: v })} type="number" placeholder="0" />
            <TextareaField label="Description *" value={formData.description} onChange={(v) => setFormData({ ...formData, description: v })} placeholder="Describe the incident in detail..." className="md:col-span-2" required />
            <TextareaField label="Immediate Action Taken" value={formData.immediate_action} onChange={(v) => setFormData({ ...formData, immediate_action: v })} placeholder="What immediate action was taken?" className="md:col-span-2" />
          </FormGrid>
        </div>
      </FormDialog>

      {/* Add Safety Metric Form */}
      <FormDialog open={isMetricFormOpen} onOpenChange={setIsMetricFormOpen} title="Add Safety Metric" description="Create a safety KPI and link to data logging" onSubmit={handleMetricSubmit} submitLabel="Create Metric" size="xl">
        <div className="space-y-6">
          <FormGrid>
            <InputField label="Metric Name *" value={metricForm.metric_name} onChange={(v) => setMetricForm({ ...metricForm, metric_name: v })} placeholder="e.g., PPE Compliance Rate" required />
            <SelectField label="Category" value={metricForm.category} onChange={(v) => setMetricForm({ ...metricForm, category: v })} options={[
              { value: "General", label: "General" }, { value: "PPE", label: "PPE" }, { value: "Fire_Safety", label: "Fire Safety" },
              { value: "Chemical", label: "Chemical" }, { value: "Ergonomic", label: "Ergonomic" }, { value: "Training", label: "Training" },
            ]} />
            <InputField label="Unit" value={metricForm.unit} onChange={(v) => setMetricForm({ ...metricForm, unit: v })} placeholder="e.g., %, count" />
            <InputField label="Target Value" value={metricForm.target_value} onChange={(v) => setMetricForm({ ...metricForm, target_value: v })} type="number" />
          </FormGrid>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><Link2 className="h-4 w-4" />Link to Data Logging</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label="Log Template" value={metricForm.template_id} onChange={(v) => {
                setMetricForm({ ...metricForm, template_id: v, field_id: "" });
                setSelectedTemplateId(v);
              }} options={templates.map((t: any) => ({ value: t.id, label: t.template_name }))} placeholder="Select template" />
              <SelectField label="Field" value={metricForm.field_id} onChange={(v) => setMetricForm({ ...metricForm, field_id: v })}
                options={templateFields.map((f: any) => ({ value: f.id, label: `${f.field_label}${f.unit ? ` (${f.unit})` : ""}` }))}
                placeholder={selectedTemplateId ? "Select field" : "Select template first"} />
              <SelectField label="Aggregation" value={metricForm.aggregation_method} onChange={(v) => setMetricForm({ ...metricForm, aggregation_method: v })}
                options={[{ value: "SUM", label: "Sum" }, { value: "AVG", label: "Average" }, { value: "MAX", label: "Max" }, { value: "MIN", label: "Min" }, { value: "COUNT", label: "Count" }, { value: "LATEST", label: "Latest" }]} />
            </div>
          </div>
        </div>
      </FormDialog>

      {/* View Incident Dialog */}
      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedIncident?.incident_number || ""} subtitle={selectedIncident?.incident_type?.replace(/_/g, " ")}>
        {selectedIncident && (
          <div className="space-y-6">
            <DetailSection title="Incident Details">
              <DetailRow label="ID" value={selectedIncident.incident_number} />
              <DetailRow label="Type" value={selectedIncident.incident_type?.replace(/_/g, " ")} />
              <DetailRow label="Location" value={selectedIncident.location || "—"} />
              <DetailRow label="Date" value={format(new Date(selectedIncident.incident_date), "dd MMM yyyy HH:mm")} />
              <DetailRow label="People Involved" value={String(selectedIncident.people_involved || 0)} />
            </DetailSection>
            <DetailSection title="Severity & Status">
              <DetailRow label="Severity" value={<StatusBadge variant={getSeverityVariant(selectedIncident.severity)}>{selectedIncident.severity}</StatusBadge>} />
              <DetailRow label="Status" value={<StatusBadge variant={getStatusVariant(selectedIncident.status)}>{selectedIncident.status?.replace(/_/g, " ")}</StatusBadge>} />
              <DetailRow label="Lost Time Hours" value={`${selectedIncident.lost_time_hours || 0} hrs`} />
            </DetailSection>
            <DetailSection title="Description & Actions">
              <DetailRow label="Description" value={selectedIncident.description} />
              {selectedIncident.immediate_action && <DetailRow label="Immediate Action" value={selectedIncident.immediate_action} />}
              {selectedIncident.root_cause && <DetailRow label="Root Cause" value={selectedIncident.root_cause} />}
              {selectedIncident.corrective_action && <DetailRow label="Corrective Action" value={selectedIncident.corrective_action} />}
            </DetailSection>
            {selectedIncident.closure_date && (
              <DetailSection title="Closure">
                <DetailRow label="Closed On" value={format(new Date(selectedIncident.closure_date), "dd MMM yyyy HH:mm")} />
              </DetailSection>
            )}
          </div>
        )}
      </ViewDialog>
    </PageShell>
  );
}
