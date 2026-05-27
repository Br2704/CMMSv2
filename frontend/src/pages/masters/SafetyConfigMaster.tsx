import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppSwitch } from "@/components/ui/app-switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Plus, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { toast } from "sonner";
import { createSafetyMetric, listSafetyMetrics, updateSafetyMetric, type SafetyMetric } from "@/api/safety";
import { useAuthStore } from "@/store/auth.store";
import { isSuperAdmin } from "@/lib/permission-engine";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { getErrorMessage } from "@/lib/utils";

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
  const canSelectPlant = isSuperAdmin(user?.roles ?? []);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();

  const [metrics, setMetrics] = useState<SafetyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MetricForm>({ ...emptyForm, plantId: defaultPlantId });

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listSafetyMetrics({
        page: 1,
        limit: 100,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setMetrics(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load safety metrics"));
    } finally {
      setLoading(false);
    }
  }, [canSelectPlant, defaultPlantId]);

  useEffect(() => {
    fetchPlants();
    fetchMetrics();
  }, [fetchMetrics]);

  const activeCount = useMemo(() => metrics.filter((m) => m.isActive).length, [metrics]);

  const toggleMetric = async (metric: SafetyMetric) => {
    try {
      await updateSafetyMetric(metric.id, { isActive: !metric.isActive });
      setMetrics((prev) => prev.map((m) => (m.id === metric.id ? { ...m, isActive: !m.isActive } : m)));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update metric"));
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
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to add metric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="Safety Configuration"
        subtitle="Configure safety metrics and workflows"
        actions={
          <Button variant="outline" className="gap-2" onClick={fetchMetrics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DataTableShell title={`Safety Metrics (${activeCount}/${metrics.length} active)`}>
          {loading ? (
            <TableSkeleton rows={5} />
          ) : metrics.length === 0 ? (
            <EmptyState
              title="No safety metrics"
              description="Add your first safety metric using the form."
              icon={AlertTriangle}
            />
          ) : (
            <div className="space-y-3">
              {metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{metric.metricName}</p>
                    <p className="text-sm text-muted-foreground">
                      Category: {metric.category} | Target: {metric.targetValue || "-"}
                    </p>
                  </div>
                  <AppSwitch
                    checked={!!metric.isActive}
                    onCheckedChange={() => toggleMetric(metric)}
                    aria-label={`${metric.metricName} active`}
                  />
                </div>
              ))}
            </div>
          )}
        </DataTableShell>

        <DataTableShell title="Add New Metric">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Metric Name *</Label>
              <Input
                value={form.metricName}
                onChange={(e) => setForm({ ...form, metricName: e.target.value })}
                placeholder="Recordable Incident Rate"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="General"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="count"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label>Aggregation Method</Label>
              <Select value={form.aggregationMethod} onValueChange={(v) => setForm({ ...form, aggregationMethod: v })}>
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
                <Select value={form.plantId} onValueChange={(v) => setForm({ ...form, plantId: v })}>
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
                <Input value={plantsOptions.find((p) => p.value === defaultPlantId)?.label || "-"} disabled />
              </div>
            )}
            <Button variant="outline" className="w-full gap-2" onClick={addMetric} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Safety Metric
            </Button>
          </div>
        </DataTableShell>
      </div>
    </PageShell>
  );
}
