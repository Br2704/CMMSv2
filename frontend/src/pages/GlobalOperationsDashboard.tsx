import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getGlobalOperationsOverview, getGlobalOperationsDrilldown, type ExecutiveOverview } from "@/api/executive";
import { listPlants } from "@/api/plants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputField, SelectField } from "@/components/shared/FormField";

export default function GlobalOperationsDashboard() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [drilldown, setDrilldown] = useState<Record<string, unknown> | null>(null);
  const [plants, setPlants] = useState<Array<{ value: string; label: string }>>([]);
  const [assetType, setAssetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [drillPlantId, setDrillPlantId] = useState("");

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const response = await getGlobalOperationsOverview({
        assetType: assetType || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      });
      setOverview(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load global operations");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlants = async () => {
    try {
      const response = await listPlants({ page: 1, limit: 200 });
      setPlants((response.data || []).map((item) => ({ value: item.id, label: `${item.plantCode} - ${item.plantName}` })));
    } catch {
      setPlants([]);
    }
  };

  const fetchDrilldown = async () => {
    if (!drillPlantId) return;
    try {
      const response = await getGlobalOperationsDrilldown({
        plantId: drillPlantId,
        assetType: assetType || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      });
      setDrilldown(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load drilldown");
      setDrilldown(null);
    }
  };

  useEffect(() => {
    fetchPlants();
    fetchOverview();
  }, []);

  const ranking = useMemo(() => overview?.plantRanking || [], [overview]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Global Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground">Executive command center for multi-plant operations, reliability, energy and emissions insights.</p>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Global Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <InputField label="Asset Type" value={assetType} onChange={setAssetType} />
          <InputField label="From" type="date" value={from} onChange={setFrom} />
          <InputField label="To" type="date" value={to} onChange={setTo} />
          <div className="flex items-end">
            <Button className="w-full" onClick={fetchOverview} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
          Loading command center data...
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total Plants</div><div className="text-xl font-semibold">{overview?.totalPlants ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total Assets</div><div className="text-xl font-semibold">{overview?.totalAssets ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total Downtime</div><div className="text-xl font-semibold">{overview?.totalDowntimeHours ?? 0} h</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Reliability Score</div><div className="text-xl font-semibold">{overview?.reliabilityScore ?? 0}</div></CardContent></Card>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Energy Intensity</div><div className="text-xl font-semibold">{overview?.energyIntensity ?? 0}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Top Plant</div><div className="text-xl font-semibold">{String((overview?.topPerformingPlant as any)?.plantName || "-")}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Worst Plant</div><div className="text-xl font-semibold">{String((overview?.worstPerformingPlant as any)?.plantName || "-")}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Plant Ranking</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Rank</th>
                    <th className="py-2">Plant</th>
                    <th className="py-2">Score</th>
                    <th className="py-2">Efficiency</th>
                    <th className="py-2">Downtime (min)</th>
                    <th className="py-2">Energy Intensity</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row: any, index: number) => (
                    <tr key={row.plantId} className="border-b last:border-0">
                      <td className="py-2">{index + 1}</td>
                      <td className="py-2">{row.plantName}</td>
                      <td className="py-2">{Number(row.score || 0).toFixed(2)}</td>
                      <td className="py-2">{Number(row.avgEfficiency || 0).toFixed(2)}</td>
                      <td className="py-2">{Number(row.downtimeMinutes || 0).toFixed(2)}</td>
                      <td className="py-2">{Number(row.energyIntensity || 0).toFixed(4)}</td>
                    </tr>
                  ))}
                  {ranking.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No ranking data.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GHG Emissions Trend</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Month</th>
                    <th className="py-2">Total CO2e</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.ghgEmissionsTrend || []).map((row) => (
                    <tr key={row.month} className="border-b last:border-0">
                      <td className="py-2">{row.month}</td>
                      <td className="py-2">{row.totalCo2e.toFixed(4)}</td>
                    </tr>
                  ))}
                  {(overview?.ghgEmissionsTrend || []).length === 0 && (
                    <tr><td colSpan={2} className="py-8 text-center text-muted-foreground">No GHG trend data in selected range.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plant Drilldown</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3">
              <SelectField label="Plant" value={drillPlantId} onChange={setDrillPlantId} options={plants} placeholder="Select plant" />
              <div className="flex items-end">
                <Button className="w-full" onClick={fetchDrilldown} disabled={!drillPlantId}>Load Drilldown</Button>
              </div>
              <div className="md:col-span-2 rounded-lg border p-3 text-sm">
                {drilldown ? (
                  <div className="space-y-1">
                    {Object.entries(drilldown).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-medium">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground">Select a plant and load drilldown.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

