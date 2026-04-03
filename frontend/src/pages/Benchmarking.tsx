import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compareBenchmarking, listBenchmarkingAssetTypes, type BenchmarkPlantStat } from "@/api/benchmarking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const METRICS = [
  { value: "efficiencyValue", label: "Efficiency Value" },
  { value: "energyPerRuntime", label: "Energy/Runtime" },
  { value: "energyKwh", label: "Energy kWh" },
  { value: "runtimeHours", label: "Runtime Hours" },
  { value: "productionOutput", label: "Production Output" },
] as const;

export default function Benchmarking() {
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [assetType, setAssetType] = useState<string>("");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("efficiencyValue");
  const [window, setWindow] = useState<"7d" | "30d" | "90d" | "custom">("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [plants, setPlants] = useState<BenchmarkPlantStat[]>([]);

  const bestPlant = useMemo(() => [...plants].sort((a, b) => b.avg - a.avg)[0], [plants]);
  const worstPlant = useMemo(() => [...plants].sort((a, b) => a.avg - b.avg)[0], [plants]);
  const overallAvg = useMemo(() => (plants.length ? plants.reduce((sum, row) => sum + row.avg, 0) / plants.length : 0), [plants]);
  const totalPoints = useMemo(() => plants.reduce((sum, row) => sum + row.count, 0), [plants]);

  const fetchAssetTypes = async () => {
    try {
      const response = await listBenchmarkingAssetTypes();
      const rows = response.data || [];
      setAssetTypes(rows);
      if (!assetType && rows.length > 0) {
        setAssetType(rows[0]);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load asset types");
    }
  };

  const fetchCompare = async () => {
    if (!assetType) return;
    if (window === "custom" && (!from || !to)) {
      toast.error("Select from/to dates for custom window");
      return;
    }

    setLoading(true);
    try {
      const response = await compareBenchmarking({
        assetType,
        metric,
        window,
        from: window === "custom" ? new Date(from).toISOString() : undefined,
        to: window === "custom" ? new Date(to).toISOString() : undefined,
      });
      setPlants(response.data.plants || []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load benchmark data");
      setPlants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetTypes();
  }, []);

  useEffect(() => {
    if (assetType) {
      fetchCompare();
    }
  }, [assetType, metric, window]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Cross-Plant Benchmarking</h1>
      </motion.div>
        <p className="text-sm text-muted-foreground">Compare same asset types across plants for benchmarking.</p>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-2">
            <Label>Asset Type</Label>
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger><SelectValue placeholder="Select asset type" /></SelectTrigger>
              <SelectContent>
                {assetTypes.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(value: any) => setMetric(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METRICS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Window</Label>
            <Select value={window} onValueChange={(value: any) => setWindow(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={fetchCompare} disabled={loading || !assetType}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </div>

          {window === "custom" && (
            <>
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Best Plant</div><div className="text-lg font-semibold">{bestPlant?.plantName || "-"}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Worst Plant</div><div className="text-lg font-semibold">{worstPlant?.plantName || "-"}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Average</div><div className="text-lg font-semibold">{overallAvg.toFixed(2)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Data Points</div><div className="text-lg font-semibold">{totalPoints}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Plant Comparison</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={plants}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="plantName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plant-wise Statistics</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Plant</th>
                <th className="py-2">Avg</th>
                <th className="py-2">Min</th>
                <th className="py-2">Max</th>
                <th className="py-2">Count</th>
                <th className="py-2">Last</th>
              </tr>
            </thead>
            <tbody>
              {plants.map((row) => (
                <tr key={row.plantId} className="border-b last:border-0 align-top">
                  <td className="py-2">
                    <div className="font-medium">{row.plantName}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.assets.slice(0, 3).map((asset) => (
                        <Badge key={asset.assetId} variant="secondary">{asset.assetCode}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-2">{row.avg.toFixed(2)}</td>
                  <td className="py-2">{row.min.toFixed(2)}</td>
                  <td className="py-2">{row.max.toFixed(2)}</td>
                  <td className="py-2">{row.count}</td>
                  <td className="py-2">{row.lastValue !== null ? row.lastValue.toFixed(2) : "-"}</td>
                </tr>
              ))}
              {!loading && plants.length === 0 && (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={6}>No data found for selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
