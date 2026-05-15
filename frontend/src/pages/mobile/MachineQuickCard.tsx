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
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Digital Twin...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
          <Wrench className="h-6 w-6" />
        </div>
        <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Unable to load machine card</p>
      </div>
    );
  }

  const openWorkOrders = (data.workOrders || []).filter((wo: any) => wo.status !== "CLOSED");

  return (
    <div className="min-h-screen bg-slate-50 pb-20 selection:bg-primary/10">
      {/* Header Sticky Background */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Operational Node</p>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-[200px]">{data.asset.name}</h1>
          </div>
          <StatusBadge variant={data.asset.status === "ACTIVE" ? "active" : "warning"} className="h-7 px-3 text-[10px] font-black uppercase tracking-widest">
            {data.asset.status}
          </StatusBadge>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-6">
        {/* Machine Image & Critical Info */}
        <Card className="overflow-hidden border-none shadow-industrial bg-white rounded-[2rem]">
          {data.asset.machineImageUrl ? (
            <div className="relative h-56 w-full overflow-hidden">
              <img src={data.asset.machineImageUrl} alt={data.asset.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          ) : (
            <div className="h-32 bg-slate-100 flex items-center justify-center">
              <Building2 className="h-10 w-10 text-slate-300" />
            </div>
          )}
          
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">MTTR</p>
                <p className="text-sm font-bold text-slate-900">12.5 min</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Open WOs</p>
                <p className="text-sm font-bold text-rose-600">{openWorkOrders.length}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node Code</span>
                <span className="text-xs font-bold text-slate-700">{data.asset.code}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Location</span>
                <span className="text-xs font-bold text-slate-700">{data.asset.location || "Main Shop Floor"}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</span>
                <span className="text-xs font-bold text-slate-700 truncate ml-4">{data.hierarchy?.department?.name || "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Primary Actions Grid */}
        <div className="grid grid-cols-1 gap-3">
          <Button 
            className="h-16 rounded-[1.25rem] bg-primary hover:bg-primary/90 text-sm font-black uppercase tracking-widest shadow-glow flex items-center justify-between px-6"
            onClick={() => navigate(`/work-orders?assetId=${data.asset.id}&mode=create-breakdown`)}
          >
            <div className="flex items-center gap-3">
              <Wrench className="h-5 w-5" />
              <span>Raise Work Order</span>
            </div>
            <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
               <ArrowRight className="h-3 w-3" />
            </div>
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              className="h-28 flex-col gap-2 rounded-[1.25rem] border-slate-200 bg-white shadow-sm"
              onClick={() => navigate(`/work-orders?assetId=${data.asset.id}`)}
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                <History className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">History</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-28 flex-col gap-2 rounded-[1.25rem] border-slate-200 bg-white shadow-sm"
              onClick={() => navigate("/preventive-maintenance")}
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">PM Schedule</span>
            </Button>
          </div>
        </div>

        {/* Timeline Visualization */}
        <div className="space-y-4">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Activity Timeline</h3>
              <div className="h-1 w-12 bg-slate-200 rounded-full" />
           </div>
           
           <div className="space-y-3">
              {timeline.length === 0 ? (
                <div className="text-center py-8 rounded-[2rem] border border-dashed border-slate-200">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stable Operations Log</p>
                </div>
              ) : (
                timeline.map((item, index) => (
                  <div key={`${item.type}-${index}`} className="group relative pl-6 pb-2">
                    {/* Visual Line */}
                    {index < timeline.length - 1 && (
                      <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-100" />
                    )}
                    <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary shadow-sm" />
                    
                    <div className="rounded-2xl border border-slate-50 bg-white p-4 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary">{item.type}</span>
                        <span className="text-[8px] font-medium text-slate-400">
                          {format(new Date(item.timestamp), "dd MMM HH:mm")}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 leading-tight">{item.title}</p>
                    </div>
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
