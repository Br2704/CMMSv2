import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Wrench, History, CalendarDays, Building2, Loader2, ArrowRight, Gauge, Activity, ShieldCheck, Zap, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAssetOverview } from "@/api/assets";
import { resolveQrMachineCode } from "@/api/qr";
import { cacheGet, cachePut } from "@/mobile/indexedDb";

type TimelineItem = {
  type: string;
  title: string;
  timestamp: string;
};

function formatMinutes(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}m`;
}

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
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Synchronizing Digital Twin...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="h-14 w-14 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-sm">
          <Wrench className="h-7 w-7" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node Synchronization Failed</p>
      </div>
    );
  }

  const openWorkOrders = (data.workOrders || []).filter((wo: any) => wo.status !== "CLOSED");
  const reliability = data.analytics.reliability;

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 selection:bg-primary/10">
      {/* Dynamic Header */}
      <div className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-white/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/60">Industrial Node</p>
            <h1 className="text-lg font-black text-slate-900 tracking-tight truncate max-w-[200px]">{data.asset.name}</h1>
          </div>
          <StatusBadge variant={data.asset.status === "ACTIVE" ? "active" : "warning"} className="h-8 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest border-none shadow-sm">
            {data.asset.status}
          </StatusBadge>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
        {/* Machine Core Snapshot */}
        <Card className="overflow-hidden border-none shadow-industrial bg-white rounded-[2.5rem]">
          {data.asset.machineImageUrl ? (
            <div className="relative h-64 w-full overflow-hidden">
              <img src={data.asset.machineImageUrl} alt={data.asset.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-60" />
            </div>
          ) : (
            <div className="h-40 bg-slate-50 flex items-center justify-center border-b border-slate-100">
              <Building2 className="h-12 w-12 text-slate-200" />
            </div>
          )}
          
          <CardContent className="p-8">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="rounded-[2rem] bg-[#f1f5f9] p-5 shadow-inner border border-white">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <Timer className="h-3 w-3" /> MTTR
                </p>
                <p className="text-lg font-black text-slate-900">{formatMinutes(reliability?.mttrMinutes)}</p>
              </div>
              <div className="rounded-[2rem] bg-rose-50/50 p-5 shadow-inner border border-white">
                <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-2 flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Incidents
                </p>
                <p className="text-lg font-black text-rose-600">{openWorkOrders.length}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center"><Zap className="h-4 w-4 text-slate-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node Identifier</span>
                </div>
                <span className="text-sm font-black text-slate-900">{data.asset.code}</span>
              </div>
              
              <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center"><Building2 className="h-4 w-4 text-slate-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</span>
                </div>
                <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{data.hierarchy?.department?.name || "-"}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center"><ShieldCheck className="h-4 w-4 text-slate-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reliability Index</span>
                </div>
                <StatusBadge variant={data.asset.criticality === "HIGH" ? "critical" : "active"} className="h-6 rounded-lg px-2 text-[8px] border-none">
                  {data.asset.criticality || "STABLE"}
                </StatusBadge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Center */}
        <div className="grid gap-4">
          <Button 
            className="h-20 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-sm font-black uppercase tracking-widest shadow-industrial-lg flex items-center justify-between px-8 transition-transform active:scale-[0.98]"
            onClick={() => navigate(`/work-orders?assetId=${data.asset.id}&mode=create-breakdown`)}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="text-left">
                <span className="block">Raise Incident</span>
                <span className="text-[9px] opacity-60 font-medium normal-case tracking-normal">Breakdown or Maintenance</span>
              </div>
            </div>
            <ArrowRight className="h-5 w-5" />
          </Button>

          <div className="grid grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-32 flex-col gap-3 rounded-[1.5rem] border-none bg-white shadow-industrial hover:shadow-lg transition-all"
              onClick={() => navigate(`/work-orders?assetId=${data.asset.id}`)}
            >
              <div className="h-12 w-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600">
                <History className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">History Log</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-32 flex-col gap-3 rounded-[1.5rem] border-none bg-white shadow-industrial hover:shadow-lg transition-all"
              onClick={() => navigate("/preventive-maintenance")}
            >
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CalendarDays className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">PM Cycles</span>
            </Button>
          </div>
        </div>

        {/* Dynamic Activity Feed */}
        <div className="space-y-6 pt-4">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Activity Timeline</h3>
              <div className="h-1 w-16 bg-slate-200 rounded-full" />
           </div>
           
           <div className="space-y-4">
              {timeline.length === 0 ? (
                <div className="text-center py-12 rounded-[2.5rem] border-2 border-dashed border-slate-100 bg-white/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Operational Log Empty</p>
                </div>
              ) : (
                timeline.map((item, index) => (
                  <div key={`${item.type}-${index}`} className="group relative pl-8">
                    {index < timeline.length - 1 && (
                      <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200" />
                    )}
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-white bg-primary shadow-sm" />
                    
                    <div className="rounded-[1.5rem] bg-white p-5 shadow-sm border border-slate-50 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">{item.type}</span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {format(new Date(item.timestamp), "dd MMM, HH:mm")}
                        </span>
                      </div>
                      <p className="text-xs font-black text-slate-900 leading-tight">{item.title}</p>
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
