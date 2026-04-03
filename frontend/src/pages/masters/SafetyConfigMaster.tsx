import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppSwitch } from "@/components/ui/app-switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Save, Plus, Loader2 } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { toast } from "sonner";
import { createSafetyMetric, listSafetyMetrics, updateSafetyMetric } from "@/api/safety";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { useMastersOptions } from "@/hooks/useMastersOptions";

interface MetricForm {
  metricName: string;
  category: string;
  unit: string;
  targetValue: string;
  aggregationMethod: string;
  plantId: string;
}

const emptyForm: MetricForm = {
  metricName: "",
  category: "General",
  unit: "",
  targetValue: "",
  aggregationMethod: "SUM",
  plantId: "",
};

export default function SafetyConfigMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();

  const [metrics, setMetrics] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MetricForm>({ ...emptyForm, plantId: defaultPlantId });
  const [autoAssign, setAutoAssign] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await listSafetyMetrics({
        page: 1,
        limit: 100,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setMetrics(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load safety metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
    fetchMetrics();
  }, [defaultPlantId, canSelectPlant]);

  const activeCount = useMemo(() => metrics.filter((metric) => metric.isActive).length, [metrics]);

  const toggleMetric = async (metric: Record<string, any>) => {
    try {
      await updateSafetyMetric(metric.id, { isActive: !metric.isActive });
      await fetchMetrics();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update metric");
    }
  };

  const addMetric = async () => {
    if (!form.metricName.trim()) {
      toast.error("Metric name is required");
      return;
    }
    const resolvedPlantId = canSelectPlant ? form.plantId || null : defaultPlantId || null;
    if (!resolvedPlantId) {
      toast.error("Plant is required");
      return;
    }
    setSaving(true);
    try {
      await createSafetyMetric({
        metricName: form.metricName.trim(),
        category: form.category.trim() || "General",
        unit: form.unit.trim() || null,
        targetValue: form.targetValue.trim() || null,
        aggregationMethod: form.aggregationMethod,
        plantId: resolvedPlantId,
        isActive: true,
      });
      toast.success("Metric added");
      setForm({ ...emptyForm, plantId: canSelectPlant ? "" : defaultPlantId });
      await fetchMetrics();
    } catch (error: any) {
      toast.error(error?.message || "Failed to add metric");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackButton />

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Safety Configuration</h1>
          <p className="text-muted-foreground">Configure safety metrics and workflows from backend data</p>
        </div>
        <Button className="gap-2 gradient-primary text-primary-foreground shadow-glow" onClick={fetchMetrics}>
          <Save className="h-4 w-4" />
          Refresh
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Safety Metrics ({activeCount}/{metrics.length} active)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : metrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No safety metrics found.</p>
            ) : (
              metrics.map((metric) => (
                <div key={metric.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{metric.metricName}</p>
                    <p className="text-sm text-muted-foreground">Category: {metric.category} | Target: {metric.targetValue || "-"}</p>
                  </div>
                  <AppSwitch checked={!!metric.isActive} onCheckedChange={() => toggleMetric(metric)} aria-label={`${metric.metricName} active`} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Safety Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Metric Name *</Label>
              <Input value={form.metricName} onChange={(event) => setForm({ ...form, metricName: event.target.value })} placeholder="Recordable Incident Rate" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="General" />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="count" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} placeholder="10" />
            </div>
            <div className="space-y-2">
              <Label>Aggregation Method</Label>
              <Select value={form.aggregationMethod} onValueChange={(value) => setForm({ ...form, aggregationMethod: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUM">SUM</SelectItem>
                  <SelectItem value="AVG">AVG</SelectItem>
                  <SelectItem value="MAX">MAX</SelectItem>
                  <SelectItem value="MIN">MIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canSelectPlant ? (
              <div className="space-y-2">
                <Label>Plant *</Label>
                <Select value={form.plantId} onValueChange={(value) => setForm({ ...form, plantId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select plant" /></SelectTrigger>
                  <SelectContent>
                    {plantsOptions.map((plant) => <SelectItem key={plant.value} value={plant.value}>{plant.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Plant</Label>
                <Input value={plantsOptions.find((plant) => plant.value === defaultPlantId)?.label || "-"} disabled />
              </div>
            )}

            <AppSwitch
              checked={autoAssign}
              onCheckedChange={setAutoAssign}
              label="Auto-assign Investigators"
              description="UI preference stored for this session."
            />

            <Button variant="outline" className="w-full gap-2" onClick={addMetric} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Safety Metric
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
