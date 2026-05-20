import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleGauge,
  Clock,
  Factory,
  FileText,
  Loader2,
  Package,
  ShieldAlert,
  Timer,
  TrendingUp,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

import { KPICard } from "@/components/dashboard/KPICard";
import {
  MTBFTrendChart,
  MTTRTrendChart,
  WOByCategoryChart,
  WOByStatusChart,
  WOTrendChart,
} from "@/components/dashboard/Charts";
import { RecentWorkOrdersTable } from "@/components/dashboard/RecentWorkOrdersTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";

type PlantRow = {
  id: string;
  plant_code?: string | null;
  plant_name?: string | null;
};

export default function Dashboard() {
  const { user, activePlantId, setActivePlant } = useAuthStore();
  const organizationName = useBrandingStore((state) => state.organizationName);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(activePlantId || null);

  const { 
    isLoading, plants, kpis, charts, recentWOs, comparisonRows, 
    userIsSuperAdmin, userIsAdmin, userIsIncharge, userIsMaintenance,
    userIsProduction, userIsSafety, userIsHR
  } = useDashboardData(selectedPlantId);
  const { hasKpiVisible } = usePermissions();

  const selectedPlant = useMemo(
    () => plants.find((plant: PlantRow) => plant.id === selectedPlantId) || null,
    [plants, selectedPlantId],
  );

  useEffect(() => {
    if (!userIsSuperAdmin || !selectedPlantId) return;
    const currentPlant = plants.find((plant: PlantRow) => plant.id === selectedPlantId);
    if (currentPlant) return;
    setSelectedPlantId(null);
    setActivePlant(null, null, null);
  }, [plants, selectedPlantId, setActivePlant, userIsSuperAdmin]);

  useEffect(() => {
    if (!userIsSuperAdmin) return;
    if (!selectedPlantId) {
      setActivePlant(null, null, null);
      return;
    }
    const plant = plants.find((item: PlantRow) => item.id === selectedPlantId);
    if (!plant) return;
    setActivePlant(plant.id, plant.plant_code || null, plant.plant_name || null);
  }, [plants, selectedPlantId, setActivePlant, userIsSuperAdmin]);

  const showingOverview = userIsSuperAdmin && !selectedPlantId;

  const getRoleGreeting = () => {
    if (userIsSuperAdmin) return "System Overlord";
    if (userIsAdmin) return "Plant Administrator";
    if (userIsIncharge) return "Section In-charge";
    if (userIsMaintenance) return "Maintenance Commander";
    if (userIsProduction) return "Production Head";
    if (userIsSafety) return "Safety Warden";
    if (userIsHR) return "People Operations";
    return "Operations Officer";
  };

  const subtitle = userIsSuperAdmin
    ? showingOverview
      ? "Global operations overview for TamOptiX."
      : `Plant performance analytics for ${selectedPlant?.plant_code || selectedPlant?.plant_name || "Primary Unit"}.`
    : `Command Center • ${user?.fullName}`;

  // Role-specific card definitions
  const getRoleSpecificCards = () => {
    if (userIsHR) {
      return [
        { title: "Total Users", value: kpis.totalUsers || 0, subtitle: "Active in plant", icon: Users, variant: "primary" as const },
        { title: "Active Shifts", value: kpis.activeShifts || 0, subtitle: "Running now", icon: Timer, variant: "info" as const },
        { title: "Attendance", value: "94%", subtitle: "Today's presence", icon: CheckCircle2, variant: "success" as const },
        { title: "Notifications", value: 12, subtitle: "Pending alerts", icon: ShieldAlert, variant: "warning" as const },
      ];
    }
    
    if (userIsSafety) {
      return [
        { title: "Visitors Today", value: kpis.visitorsToday, subtitle: "Total entries", icon: Users, variant: "primary" as const },
        { title: "Inside Plant", value: kpis.activeVisitors, subtitle: "Current headcount", icon: Users, variant: "success" as const },
        { title: "Vehicles", value: kpis.vehiclesEntered, subtitle: "Movement today", icon: Activity, variant: "info" as const },
        { title: "Safety Alerts", value: 0, subtitle: "No incidents reported", icon: ShieldAlert, variant: "success" as const },
      ];
    }

    if (userIsProduction) {
       return [
        { title: "Asset Status", value: kpis.activeAssets, subtitle: `Out of ${kpis.totalAssets} assets`, icon: Factory, variant: "primary" as const },
        { title: "Work Requests", value: kpis.openWOs, subtitle: "Raised & Pending", icon: Wrench, variant: "warning" as const },
        { title: "Avg Resolution", value: `${kpis.mttrAvg}m`, subtitle: "Mean Time to Repair", icon: Timer, variant: "info" as const },
        { title: "Recent Activity", value: kpis.closedLast24h, subtitle: "Resolved (24h)", icon: CheckCircle2, variant: "success" as const },
      ];
    }

    // Default Maintenance/Admin view
    return (showingOverview
      ? [
          { title: "Total Plants", value: kpis.totalPlants, subtitle: "Operational units", icon: Building2, variant: "info" as const },
          { title: "Total Assets", value: kpis.totalAssets, subtitle: `${kpis.activeAssets} active`, icon: Factory, variant: "primary" as const },
          { title: "Open WO", value: kpis.openWOs, subtitle: "Global pending", icon: Workflow, variant: "warning" as const },
          { title: "PM Compliance", value: `${kpis.pmCompliance}%`, subtitle: "Global health", icon: CalendarCheck, variant: "success" as const },
        ]
      : [
          { title: "Active Assets", value: kpis.activeAssets, subtitle: `of ${kpis.totalAssets} total`, icon: Factory, variant: "primary" as const },
          { title: "Pending WO", value: kpis.openWOs, subtitle: "Requires action", icon: Wrench, variant: "warning" as const },
          { title: "MTTR", value: `${kpis.mttrAvg} min`, subtitle: "Repair performance", icon: Timer, variant: "info" as const },
          { title: "Verification", value: kpis.pendingApproval, subtitle: "Awaiting review", icon: ShieldAlert, variant: "destructive" as const },
        ]);
  };

  const dashboardCards = getRoleSpecificCards();

  // Phase 3: Advanced KPIs mapping
  const woKpis = kpis.workOrderKPIs || {};
  const breakdownKpis = kpis.breakdownKPIs || {};
  const timeKpis = kpis.timeKPIs || {};
  const costKpis = kpis.costKPIs || {};

  return (
    <PageShell className="space-y-12 animate-fade-in pb-16">
      {/* Dynamic Header Section */}
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="h-10 w-1 rounded-full bg-primary" />
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">{getRoleGreeting()}</p>
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
            {userIsSuperAdmin && showingOverview ? "Global Governance" : "Command Center"}
          </h1>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex h-8 items-center gap-2 rounded-full bg-white/60 backdrop-blur-md px-4 border border-slate-100 shadow-sm">
               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
               <p className="text-xs font-bold text-slate-500">{subtitle}</p>
            </div>
          </div>
        </div>

        {userIsSuperAdmin && (
          <div className="w-full lg:w-[350px]">
             <Select value={selectedPlantId || "overview"} onValueChange={(val) => val === "overview" ? setSelectedPlantId(null) : setSelectedPlantId(val)}>
                <SelectTrigger className="h-16 rounded-[1.5rem] border-none bg-white shadow-industrial hover:shadow-industrial-lg transition-all px-8 text-base font-bold">
                  <SelectValue placeholder="Organization Overview" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                  <SelectItem value="overview" className="rounded-xl py-3 focus:bg-primary/5">Organization Overview</SelectItem>
                  {plants.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} className="rounded-xl py-3 focus:bg-primary/5">{p.plant_code || p.plant_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>
        )}
      </div>

      {/* Primary KPI Grid */}
      <div className="space-y-6">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Real-time Operations
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardCards.map((card, idx) => (
            <KPICard key={card.title} {...card} className="h-full" />
          ))}
        </div>
      </div>

      {/* Phase 3: Detailed Industrial Analytics Grid */}
      {!userIsHR && !userIsSafety && (
        <div className="space-y-12">
          
          {/* Work Order Lifecycle */}
          <div className="space-y-6">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Work Order Lifecycle
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <KPICard title="Total Raised" value={woKpis.totalWO || 0} icon={FileText} variant="default" className="p-4" />
              <KPICard title="In Progress" value={woKpis.inProgressWO || 0} icon={Activity} variant="primary" className="p-4" />
              <KPICard title="Pending Appr" value={woKpis.pendingApprovalWO || 0} icon={ShieldAlert} variant="warning" className="p-4" />
              <KPICard title="Rejected" value={woKpis.rejectedWO || 0} icon={AlertTriangle} variant="destructive" className="p-4" />
              <KPICard title="Successfully Closed" value={woKpis.closedWO || 0} icon={CheckCircle2} variant="success" className="p-4" />
            </div>
          </div>

          {/* Breakdown & Reliability */}
          <div className="space-y-6">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Timer className="h-4 w-4" /> Breakdown & Reliability
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
              <KPICard title="Total Breakdowns" value={breakdownKpis.totalBreakdowns || 0} icon={AlertTriangle} variant="destructive" />
              <KPICard title="Operator Fault" value={breakdownKpis.operatorFaultCases || 0} icon={Users} variant="warning" />
              <KPICard title="MTTR" value={`${timeKpis.mttr || 0}m`} subtitle="Avg Repair Time" icon={Timer} variant="info" />
              <KPICard title="MTBF" value={`${timeKpis.mtbf || 0}h`} subtitle="Between Failures" icon={Activity} variant="success" />
            </div>
          </div>


          {/* Trends & Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <MTTRTrendChart data={charts.mttrTrendData} />
             <MTBFTrendChart data={charts.mtbfTrendData} />
             <div className="lg:col-span-2">
                <WOTrendChart data={charts.woTrendData} />
             </div>
             <WOByStatusChart data={charts.woByStatusData} />
             <WOByCategoryChart data={charts.woByCategoryData} />
             <div className="lg:col-span-2 mt-4">
                <RecentWorkOrdersTable workOrders={recentWOs} isLoading={isLoading} />
             </div>
          </div>
        </div>
      )}

      {userIsHR && (
        <div className="grid gap-6 lg:grid-cols-2">
           <Card className="rounded-[2rem] border-none shadow-industrial overflow-hidden">
              <CardHeader className="p-8">
                 <CardTitle className="text-xl font-bold flex items-center gap-3">
                   <Users className="h-6 w-6 text-primary" />
                   Personnel Distribution
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                 <div className="h-[300px] flex items-center justify-center text-muted-foreground italic border border-dashed rounded-3xl">
                    Detailed HR analytics coming soon...
                 </div>
              </CardContent>
           </Card>
           <Card className="rounded-[2rem] border-none shadow-industrial overflow-hidden">
              <CardHeader className="p-8">
                 <CardTitle className="text-xl font-bold flex items-center gap-3">
                   <Timer className="h-6 w-6 text-primary" />
                   Shift Utilization
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                 <div className="h-[300px] flex items-center justify-center text-muted-foreground italic border border-dashed rounded-3xl">
                    Shift monitoring dashboard coming soon...
                 </div>
              </CardContent>
           </Card>
        </div>
      )}

      {userIsSafety && (
        <div className="space-y-6">
           <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-[2rem] border-none shadow-industrial overflow-hidden">
                <CardHeader className="p-8 pb-4">
                  <CardTitle className="text-xl font-bold">Gate Movement Trends</CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                   <div className="h-[300px] flex items-center justify-center text-muted-foreground italic border border-dashed rounded-3xl">
                      Visitor trend analytics...
                   </div>
                </CardContent>
              </Card>
              <Card className="rounded-[2rem] border-none shadow-industrial overflow-hidden">
                <CardHeader className="p-8 pb-4">
                  <CardTitle className="text-xl font-bold">Security Health</CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                   <div className="h-[300px] flex items-center justify-center text-muted-foreground italic border border-dashed rounded-3xl">
                      Compliance monitoring...
                   </div>
                </CardContent>
              </Card>
           </div>
        </div>
      )}

      {userIsSuperAdmin && showingOverview && (
        <Card className="rounded-[2.5rem] border-none shadow-industrial overflow-hidden bg-white/40 backdrop-blur-xl">
           <CardHeader className="p-8 border-b border-white/20">
              <CardTitle className="text-2xl font-black">Organization Plant Comparison</CardTitle>
              <p className="text-muted-foreground font-medium">Cross-plant operational benchmarks</p>
           </CardHeader>
           <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-8 py-6">Plant</th>
                        <th className="px-6 py-6">Operational Status</th>
                        <th className="px-6 py-6">Assets</th>
                        <th className="px-6 py-6">PM Compliance</th>
                        <th className="px-6 py-6">Resolution Time</th>
                        <th className="px-8 py-6 text-right">Health</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {comparisonRows.map((row) => (
                        <tr key={row.plantId} className="group hover:bg-white/60 transition-colors">
                           <td className="px-8 py-6">
                              <div className="flex flex-col">
                                <span className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">{row.plantCode}</span>
                                <span className="text-xs font-medium text-slate-400">{row.plantName}</span>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                <span className="text-sm font-bold text-slate-700">Online</span>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <span className="text-sm font-black text-slate-900">{row.totalAssets}</span>
                              <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">Assets</span>
                           </td>
                           <td className="px-6 py-6">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full bg-emerald-500 rounded-full" 
                                    style={{ width: `${row.pmCompliance}%` }}
                                  />
                              </div>
                              <span className="mt-1 block text-xs font-black text-emerald-600">{row.pmCompliance}%</span>
                           </td>
                           <td className="px-6 py-6">
                              <span className="text-sm font-bold text-slate-900">{row.mttrAvg}</span>
                              <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">Min</span>
                           </td>
                           <td className="px-8 py-6 text-right">
                              <StatusBadge variant={row.pmCompliance > 80 ? "success" : row.pmCompliance > 60 ? "warning" : "destructive"}>
                                 {row.pmCompliance > 80 ? "Excellent" : row.pmCompliance > 60 ? "Stable" : "Critical"}
                              </StatusBadge>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              </div>
           </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
