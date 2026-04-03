import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { getReconciliationDiagnostics } from "@/api/diagnostics";
import { recomputeReliability } from "@/api/reliability";
import { getSystemErrors, getSystemHealth, getSystemPerformance, type SystemErrors, type SystemHealth, type SystemPerformance } from "@/api/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SystemDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [performance, setPerformance] = useState<SystemPerformance | null>(null);
  const [errors, setErrors] = useState<SystemErrors | null>(null);
  const [reconciliation, setReconciliation] = useState<Array<Record<string, unknown>>>([]);

  const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Request failed");

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, performanceRes, errorsRes, reconciliationRes] = await Promise.all([
        getSystemHealth(),
        getSystemPerformance(),
        getSystemErrors(),
        getReconciliationDiagnostics(),
      ]);
      setHealth(healthRes.data);
      setPerformance(performanceRes.data);
      setErrors(errorsRes.data);
      setReconciliation(reconciliationRes.data.flags || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Failed to load diagnostics");
      setHealth(null);
      setPerformance(null);
      setErrors(null);
      setReconciliation([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRecompute = async () => {
    setRecomputeLoading(true);
    try {
      await recomputeReliability({ window: "30d" });
      toast.success("Reliability recompute triggered");
      await fetchDiagnostics();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Failed to recompute reliability");
    } finally {
      setRecomputeLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">System Diagnostics</h1>
          <p className="text-sm text-muted-foreground">Health, performance, error monitoring, hierarchy consistency, and reconciliation controls.</p>
        </div>
        <Button className="gap-2" onClick={handleRecompute} disabled={recomputeLoading}>
          {recomputeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Recompute Reliability
        </Button>
      </motion.div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
          Loading diagnostics...
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">System Status</div><div className="text-xl font-semibold">{health?.status || "-"}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">DB Latency</div><div className="text-xl font-semibold">{health?.dbLatencyMs ?? 0} ms</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Hierarchy Issues</div><div className="text-xl font-semibold">{health?.hierarchyConsistencyIssues ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Uptime</div><div className="text-sm font-medium">{health ? `${Math.floor(health.uptimeSeconds / 3600)} h` : "-"}</div></CardContent></Card>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Requests / 24h</div><div className="text-xl font-semibold">{performance?.requestCountLast24Hours ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">API Failures / 24h</div><div className="text-xl font-semibold">{performance?.apiFailuresLast24Hours ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Active Sessions</div><div className="text-xl font-semibold">{performance?.activeUsers ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Security Events / 24h</div><div className="text-xl font-semibold">{performance?.recentSecurityEvents ?? 0}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Recent API Errors</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(errors?.apiErrors || []).slice(0, 10).map((row, index) => (
                <div key={String(row.id || index)} className="rounded-md border border-border/60 p-3 text-sm">
                  <p className="font-medium">{String(row.action || row.module || "API Error")}</p>
                  <p className="text-xs text-muted-foreground">Status: {String(row.statusCode || row.status_code || "-")} | {String(row.createdAt || row.created_at || "-")}</p>
                </div>
              ))}
              {(errors?.apiErrors || []).length === 0 ? <p className="text-sm text-muted-foreground">No recent API errors.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Security Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(errors?.securityAlerts || []).slice(0, 10).map((row, index) => (
                <div key={String(row.id || index)} className="rounded-md border border-border/60 p-3 text-sm">
                  <p className="font-medium">{String(row.eventType || row.type || "Security Alert")}</p>
                  <p className="text-xs text-muted-foreground">Severity: {String(row.severity || "-")} | {String(row.detectedAt || row.detected_at || "-")}</p>
                </div>
              ))}
              {(errors?.securityAlerts || []).length === 0 ? <p className="text-sm text-muted-foreground">No high-severity security alerts.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Reconciliation Flags</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Asset</th>
                    <th className="py-2">Day</th>
                    <th className="py-2">Runtime</th>
                    <th className="py-2">Energy</th>
                    <th className="py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map((row, index) => (
                    <tr key={`${row.assetId}-${index}`} className="border-b last:border-0">
                      <td className="py-2">{String(row.assetId)}</td>
                      <td className="py-2">{String(row.day)}</td>
                      <td className="py-2">{String(row.runtimeHours)}</td>
                      <td className="py-2">{String(row.energyKwh)}</td>
                      <td className="py-2">{Array.isArray(row.issues) ? row.issues.join(", ") : String(row.issues || "-")}</td>
                    </tr>
                  ))}
                  {reconciliation.length === 0 ? <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>No reconciliation flags detected.</td></tr> : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
