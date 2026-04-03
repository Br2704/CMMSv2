import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getAssetAnomalies, getPlantPerformanceInsights, type AssetAnomalyInsight, type PlantPerformanceInsight } from "@/api/insights";
import { listHighRiskAssets } from "@/api/predictive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/shared/FormField";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const [assetType, setAssetType] = useState("BOILER");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [plants, setPlants] = useState<PlantPerformanceInsight[]>([]);
  const [anomalies, setAnomalies] = useState<AssetAnomalyInsight[]>([]);
  const [highRisk, setHighRisk] = useState<Array<Record<string, unknown>>>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        assetType: assetType || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      };
      const [performanceRes, anomaliesRes, highRiskRes] = await Promise.all([
        getPlantPerformanceInsights(params),
        getAssetAnomalies(params),
        listHighRiskAssets({ limit: 10, ...params }),
      ]);
      setPlants(performanceRes.data.plants || []);
      setAnomalies(anomaliesRes.data.anomalies || []);
      setHighRisk(highRiskRes.data || []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to fetch insights");
      setPlants([]);
      setAnomalies([]);
      setHighRisk([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const avgScore = useMemo(() => (plants.length ? plants.reduce((sum, row) => sum + row.rankingScore, 0) / plants.length : 0), [plants]);
  const topPlant = plants[0];

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">AI Insights & Recommendations</h1>
        <p className="text-sm text-muted-foreground">Cross-plant ranking, anomaly detection, and predictive maintenance recommendations.</p>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <InputField label="Asset Type" value={assetType} onChange={setAssetType} />
          <InputField label="From" type="date" value={from} onChange={setFrom} />
          <InputField label="To" type="date" value={to} onChange={setTo} />
          <div className="flex items-end">
            <Button className="w-full" onClick={fetchData} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Top Performing Plant</div>
            <div className="text-lg font-semibold">{topPlant?.plantName || "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Average Ranking Score</div>
            <div className="text-lg font-semibold">{avgScore.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Detected Anomalies</div>
            <div className="text-lg font-semibold">{anomalies.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plant Performance Ranking</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
              Loading ranking...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Rank</th>
                  <th className="py-2">Plant</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Percentile</th>
                  <th className="py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {plants.map((row) => (
                  <tr key={row.plantId} className="border-b last:border-0">
                    <td className="py-2">{row.rank}</td>
                    <td className="py-2">{row.plantName}</td>
                    <td className="py-2">{row.rankingScore.toFixed(2)}</td>
                    <td className="py-2">{row.percentile.toFixed(2)}%</td>
                    <td className="py-2 max-w-[450px]">{row.recommendation}</td>
                  </tr>
                ))}
                {plants.length === 0 && (
                  <tr>
                    <td className="py-8 text-center text-muted-foreground" colSpan={5}>
                      No ranking data available.
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
          <CardTitle>Anomalies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {anomalies.map((row, idx) => (
            <div key={`${row.plantId}-${idx}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{row.plantName}</div>
                <Badge variant="secondary">{row.assetType}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{row.recommendation}</div>
            </div>
          ))}
          {anomalies.length === 0 && <div className="text-sm text-muted-foreground">No anomalies detected for current filters.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 High-Risk Machines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Machine</th>
                <th className="py-2">Plant</th>
                <th className="py-2">Risk</th>
                <th className="py-2">Failure Probability</th>
                <th className="py-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.map((row) => (
                <tr key={String(row.assetId)} className="border-b last:border-0">
                  <td className="py-2">{String(row.code)} - {String(row.name)}</td>
                  <td className="py-2">{String(row.plantId)}</td>
                  <td className="py-2">{String(row.riskLevel)}</td>
                  <td className="py-2">{Number(row.failureProbability || 0).toFixed(4)}</td>
                  <td className="py-2 max-w-[450px]">{String(row.recommendation || "-")}</td>
                </tr>
              ))}
              {highRisk.length === 0 && (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={5}>
                    No high-risk assets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

