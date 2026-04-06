import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Wrench, History, CalendarDays, CheckSquare, Shield, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAssetOverview } from "@/api/assets";
import { resolveQrMachineCode } from "@/api/qr";
import { cacheGet, cachePut } from "@/mobile/indexedDb";

type TimelineItem = {
  type: string;
  title: string;
  timestamp: string;
};

export default function MachineQuickCard() {
  const { machineId } = useParams<{ machineId: string }>();
  const navigate = useNavigate();

  const isUuidLike = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const { data, isLoading } = useQuery({
    queryKey: ["machine_quick_card", machineId],
    enabled: Boolean(machineId),
    staleTime: 30_000,
    queryFn: async () => {
      const machineKey = machineId?.trim();
      if (!machineKey) throw new Error("Missing machine identifier");

      let resolvedMachineId = machineKey;
      if (!isUuidLike(machineKey)) {
        const resolved = await resolveQrMachineCode(machineKey);
        resolvedMachineId = resolved.data.asset?.id || "";
      }
      if (!resolvedMachineId) {
        throw new Error("Machine not found");
      }

      const cacheKeys = [`machine_overview_${machineKey}`, `machine_overview_${resolvedMachineId}`];

      try {
        const response = await getAssetOverview(resolvedMachineId);
        await Promise.all(cacheKeys.map((key) => cachePut(key, response.data)));
        return response.data;
      } catch (error) {
        for (const cacheKey of cacheKeys) {
          const cached = await cacheGet<any>(cacheKey);
          if (cached?.value) {
            return cached.value;
          }
        }
        throw error;
      }
    },
  });

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return [];

    const breakdowns = (data.workOrders || []).map((wo: any) => ({
      type: "Breakdown",
      title: `${wo.woNumber} - ${wo.status}`,
      timestamp: wo.createdAt,
    }));

    const pm = (data.pmSchedules || []).map((task: any) => ({
      type: "PM",
      title: task.template?.name || "Preventive task",
      timestamp: task.nextDue || task.updatedAt,
    }));

    const calibration = (data.calibrationTasks || []).map((task: any) => ({
      type: "Calibration",
      title: task.template?.name || "Calibration task",
      timestamp: task.dueDate || task.updatedAt,
    }));

    const amc = (data.amcServiceReports || []).map((report: any) => ({
      type: "AMC",
      title: report.serviceType || "AMC visit",
      timestamp: report.serviceDate || report.updatedAt,
    }));

    return [...breakdowns, ...pm, ...calibration, ...amc]
      .filter((item) => Boolean(item.timestamp))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [data]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading machine card...</div>;
  }

  if (!data) {
    return <div className="p-4 text-sm text-destructive">Unable to load machine card</div>;
  }

  const openWorkOrders = (data.workOrders || []).filter((wo: any) => wo.status !== "CLOSED");

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">{data.asset.name}</CardTitle>
          <p className="text-xs text-muted-foreground">Machine Code: {data.asset.code}</p>
          <p className="text-[11px] text-muted-foreground/80">Machine ID: {data.asset.id}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.asset.machineImageUrl ? (
            <div className="overflow-hidden rounded-xl border">
              <img src={data.asset.machineImageUrl} alt={`${data.asset.name} machine`} className="h-40 w-full object-cover" loading="lazy" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Plant</p><p className="font-medium">{data.hierarchy?.plant?.plantName || "-"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Department</p><p className="font-medium">{data.hierarchy?.department?.name || "-"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Module</p><p className="font-medium">{data.hierarchy?.module?.name || "-"}</p></div>
            <div className="rounded-lg border p-2"><p className="text-muted-foreground">Status</p><StatusBadge variant={data.asset.status === "ACTIVE" ? "active" : "warning"}>{data.asset.status}</StatusBadge></div>
          </div>

          <div className="rounded-lg border p-2 text-xs sm:text-sm">
            <p className="text-muted-foreground">Machine Location</p>
            <p className="font-medium">{data.asset.location || "-"}</p>
          </div>

          <div className="rounded-lg border p-2 text-xs sm:text-sm">
            <p className="text-muted-foreground">Last Maintenance</p>
            <p className="font-medium">{data.workOrders?.[0]?.updatedAt ? format(new Date(data.workOrders[0].updatedAt), "dd MMM yyyy") : "-"}</p>
          </div>

          <div className="rounded-lg border p-2 text-xs sm:text-sm">
            <p className="text-muted-foreground">Next PM</p>
            <p className="font-medium">{data.pmSchedules?.[0]?.nextDue ? format(new Date(data.pmSchedules[0].nextDue), "dd MMM yyyy") : "-"}</p>
          </div>

          <div className="rounded-lg border p-2 text-xs sm:text-sm">
            <p className="text-muted-foreground">Open Work Orders</p>
            <p className="font-medium">{openWorkOrders.length}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className="h-12 justify-start gap-2" onClick={() => navigate(`/work-orders?assetId=${data.asset.id}&mode=create-breakdown`)}>
              <Wrench className="h-4 w-4" />
              Raise Work Order
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-2" onClick={() => navigate(`/work-orders?assetId=${data.asset.id}`)}>
              <History className="h-4 w-4" />
              View Maintenance History
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-2" onClick={() => navigate("/preventive-maintenance") }>
              <CalendarDays className="h-4 w-4" />
              View PM Schedule
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-2" onClick={() => navigate("/calibration") }>
              <CheckSquare className="h-4 w-4" />
              View Calibration
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-2" onClick={() => navigate("/amc") }>
              <Building2 className="h-4 w-4" />
              View AMC Vendor
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-2" onClick={() => navigate(`/work-orders?assetId=${data.asset.id}&mode=technician-start`)}>
              <Shield className="h-4 w-4" />
              Start Maintenance
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm sm:text-base">Machine Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No activity found</p> : null}
            {timeline.map((item, index) => (
              <div key={`${item.type}-${index}`} className="rounded-lg border p-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <StatusBadge variant="default">{item.type}</StatusBadge>
                </div>
                <p className="text-muted-foreground">{format(new Date(item.timestamp), "dd MMM yyyy HH:mm")}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
