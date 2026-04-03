import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, PlusCircle } from "lucide-react";
import {
  acknowledgeAlert,
  createAlertConfig,
  deleteAlertConfig,
  exportAlertsCsv,
  listAlertConfigs,
  listAlerts,
  resolveAlert,
  type AlertConfig,
  type AlertLog,
  type AlertSeverity,
  type AlertStatus,
} from "@/api/alerts";
import { listPlants } from "@/api/plants";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField, InputField } from "@/components/shared/FormField";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/shared/FormDialog";

const severityStyles: Record<AlertSeverity, string> = {
  LOW: "bg-slate-100 text-slate-900",
  MEDIUM: "bg-blue-100 text-blue-900",
  HIGH: "bg-amber-100 text-amber-900",
  CRITICAL: "bg-red-100 text-red-900",
};

const comparisonOptions = [">", "<", ">=", "<="].map((value) => ({ label: value, value }));
const severityOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => ({ label: value, value }));

type ConfigForm = {
  plantId: string;
  assetType: string;
  metricKey: string;
  comparisonType: ">" | "<" | ">=" | "<=";
  thresholdValue: string;
  severity: AlertSeverity;
  notifyRoles: string;
};

const initialForm: ConfigForm = {
  plantId: "",
  assetType: "",
  metricKey: "",
  comparisonType: ">",
  thresholdValue: "",
  severity: "MEDIUM",
  notifyRoles: "",
};

export default function AlertsCenter() {
  const { user, activePlantId } = useAuthStore();
  const userIsSuperAdmin = isSuperAdmin(user);
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [plants, setPlants] = useState<Array<{ value: string; label: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "ALL">("OPEN");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "ALL">("ALL");
  const [plantFilter, setPlantFilter] = useState<string>(userIsSuperAdmin ? "" : activePlantId || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [form, setForm] = useState<ConfigForm>(initialForm);

  const scopedPlantId = useMemo(() => (userIsSuperAdmin ? plantFilter || undefined : activePlantId || undefined), [userIsSuperAdmin, plantFilter, activePlantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configsRes, alertsRes] = await Promise.all([
        listAlertConfigs({ page: 1, limit: 200, plantId: scopedPlantId }),
        listAlerts({
          page: 1,
          limit: 200,
          plantId: scopedPlantId,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          severity: severityFilter === "ALL" ? undefined : severityFilter,
        }),
      ]);
      setConfigs(configsRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlants = async () => {
    if (!userIsSuperAdmin) return;
    try {
      const response = await listPlants({ page: 1, limit: 200 });
      setPlants((response.data || []).map((row) => ({ value: row.id, label: `${row.plantCode} - ${row.plantName}` })));
    } catch {
      setPlants([]);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  useEffect(() => {
    fetchData();
  }, [statusFilter, severityFilter, scopedPlantId]);

  const handleCreateConfig = async () => {
    if (!form.metricKey.trim() || !form.thresholdValue.trim()) {
      toast.error("Metric key and threshold are required");
      return;
    }
    setSaving(true);
    try {
      await createAlertConfig({
        plantId: userIsSuperAdmin ? form.plantId || null : activePlantId || null,
        assetType: form.assetType.trim() || null,
        metricKey: form.metricKey.trim(),
        thresholdValue: Number(form.thresholdValue),
        comparisonType: form.comparisonType,
        severity: form.severity,
        notifyRoles: form.notifyRoles
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        isActive: true,
      });
      toast.success("Alert rule created");
      setConfigOpen(false);
      setForm(initialForm);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create alert config");
    } finally {
      setSaving(false);
    }
  };

  const handleAcknowledge = async (row: AlertLog) => {
    setSaving(true);
    try {
      await acknowledgeAlert(row.id, row.version);
      toast.success("Alert acknowledged");
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to acknowledge alert");
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (row: AlertLog) => {
    setSaving(true);
    try {
      await resolveAlert(row.id, row.version);
      toast.success("Alert resolved");
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to resolve alert");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    setSaving(true);
    try {
      await deleteAlertConfig(id);
      toast.success("Alert configuration deleted");
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete alert config");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportAlertsCsv({
        plantId: scopedPlantId,
        severity: severityFilter === "ALL" ? undefined : severityFilter,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `alerts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Alert export downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to export alerts");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Alert Center</h1>
          <p className="text-sm text-muted-foreground">Threshold-driven smart alerts with acknowledgement and resolution workflow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />Export
          </Button>
          <Button className="gap-2" onClick={() => setConfigOpen(true)}>
            <PlusCircle className="h-4 w-4" />New Rule
          </Button>
        </div>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {userIsSuperAdmin && (
            <SelectField label="Plant" value={plantFilter} onChange={setPlantFilter} options={plants} placeholder="All plants" />
          )}
          <SelectField
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as AlertStatus | "ALL")}
            options={[
              { label: "ALL", value: "ALL" },
              { label: "OPEN", value: "OPEN" },
              { label: "ACKNOWLEDGED", value: "ACKNOWLEDGED" },
              { label: "RESOLVED", value: "RESOLVED" },
            ]}
          />
          <SelectField
            label="Severity"
            value={severityFilter}
            onChange={(value) => setSeverityFilter(value as AlertSeverity | "ALL")}
            options={[{ label: "ALL", value: "ALL" }, ...severityOptions]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Alerts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
              Loading alerts...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Triggered</th>
                  <th className="py-2">Metric</th>
                  <th className="py-2">Actual / Threshold</th>
                  <th className="py-2">Severity</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Message</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 align-top">
                    <td className="py-2">{new Date(row.triggeredAt).toLocaleString()}</td>
                    <td className="py-2">{row.metricKey}</td>
                    <td className="py-2">
                      {row.actualValue} {row.comparisonType} {row.thresholdValue}
                    </td>
                    <td className="py-2">
                      <Badge className={severityStyles[row.severity]}>{row.severity}</Badge>
                    </td>
                    <td className="py-2">{row.status}</td>
                    <td className="py-2 max-w-[320px]">{row.message || "-"}</td>
                    <td className="py-2 text-right space-x-1">
                      {row.status === "OPEN" && (
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => handleAcknowledge(row)}>
                          Acknowledge
                        </Button>
                      )}
                      {row.status !== "RESOLVED" && (
                        <Button size="sm" disabled={saving} onClick={() => handleResolve(row)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && alerts.length === 0 && (
                  <tr>
                    <td className="py-8 text-center text-muted-foreground" colSpan={7}>
                      No alerts for current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert Rules</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Plant</th>
                <th className="py-2">Asset Type</th>
                <th className="py-2">Metric</th>
                <th className="py-2">Rule</th>
                <th className="py-2">Severity</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2">{row.plantId || "GLOBAL"}</td>
                  <td className="py-2">{row.assetType || "ALL"}</td>
                  <td className="py-2">{row.metricKey}</td>
                  <td className="py-2">
                    {row.comparisonType} {row.thresholdValue}
                  </td>
                  <td className="py-2">{row.severity}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteConfig(row.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {configs.length === 0 && (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={6}>
                    No alert rules configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <FormDialog open={configOpen} onOpenChange={setConfigOpen} title="Create Alert Rule" onSubmit={handleCreateConfig} submitLabel="Create Rule" isLoading={saving}>
        {userIsSuperAdmin && <SelectField label="Plant (optional)" value={form.plantId} onChange={(value) => setForm((prev) => ({ ...prev, plantId: value }))} options={plants} />}
        <InputField label="Asset Type (optional)" value={form.assetType} onChange={(value) => setForm((prev) => ({ ...prev, assetType: value }))} />
        <InputField label="Metric Key" required value={form.metricKey} onChange={(value) => setForm((prev) => ({ ...prev, metricKey: value }))} hint="e.g. efficiencyValue, energyKwh, runtimeHours" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Comparison" value={form.comparisonType} onChange={(value) => setForm((prev) => ({ ...prev, comparisonType: value as ConfigForm["comparisonType"] }))} options={comparisonOptions} />
          <InputField label="Threshold" value={form.thresholdValue} onChange={(value) => setForm((prev) => ({ ...prev, thresholdValue: value }))} />
        </div>
        <SelectField label="Severity" value={form.severity} onChange={(value) => setForm((prev) => ({ ...prev, severity: value as AlertSeverity }))} options={severityOptions} />
        <InputField label="Notify Roles (comma separated)" value={form.notifyRoles} onChange={(value) => setForm((prev) => ({ ...prev, notifyRoles: value }))} hint="e.g. ADMIN,SUPERVISOR" />
      </FormDialog>
    </div>
  );
}
