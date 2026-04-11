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
  Factory,
  Loader2,
  ShieldAlert,
  Timer,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

import { KPICard } from "@/components/dashboard/KPICard";
import {
  AssetStatusChart,
  MTBFTrendChart,
  MTTRTrendChart,
  WOByCategoryChart,
  WOByPriorityChart,
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

  const { isLoading, plants, kpis, charts, recentWOs, comparisonRows, userIsSuperAdmin, userIsAdmin, userIsIncharge } =
    useDashboardData(selectedPlantId);
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

  const subtitle = userIsSuperAdmin
    ? showingOverview
      ? `Overview KPI across all plants in ${organizationName || "your organization"}.`
      : `Plant KPI dashboard for ${selectedPlant?.plant_code || selectedPlant?.plant_name || "selected plant"}.`
    : `Welcome back, ${user?.fullName}! ${
        userIsAdmin ? "Showing all plant data." : userIsIncharge ? "Showing your category data." : "Showing your work order data."
      }`;

  const summaryCards = (showingOverview
    ? [
        {
          title: "Total Plants",
          value: kpis.totalPlants,
          subtitle: "Active plants in organization",
          icon: Building2,
          variant: "info" as const,
        },
        {
          title: "Total Assets",
          value: kpis.totalAssets,
          subtitle: `${kpis.activeAssets} active assets`,
          icon: Factory,
          variant: "primary" as const,
        },
        {
          title: "Open Work Orders",
          value: kpis.openWOs,
          subtitle: "Open across all plants",
          icon: Workflow,
          variant: "warning" as const,
        },
        {
          title: "PM Compliance",
          value: `${kpis.pmCompliance}%`,
          subtitle: "Organization-wide maintenance health",
          icon: CalendarCheck,
          variant: "success" as const,
        },
      ]
    : [
        {
          title: "Total Assets",
          value: kpis.totalAssets,
          subtitle: `${kpis.activeAssets} active assets`,
          icon: Factory,
          variant: "primary" as const,
        },
        {
          title: "Open Work Orders",
          value: kpis.openWOs,
          subtitle: "Active and in progress",
          icon: Wrench,
          variant: "warning" as const,
        },
        {
          title: "Closed (24h)",
          value: kpis.closedLast24h,
          subtitle: "Closed in last 24 hours",
          icon: CheckCircle2,
          variant: "success" as const,
        },
        {
          title: "Pending Verification",
          value: kpis.pendingApproval,
          subtitle: "Awaiting raiser confirmation",
          icon: ShieldAlert,
          variant: "destructive" as const,
        },
      ]) satisfies Array<{
    title: string;
    value: string | number;
    subtitle: string;
    icon: typeof Building2;
    variant: "primary" | "success" | "warning" | "destructive" | "info";
  }>;

  const reliabilityCards = [
    {
      title: "MTTR",
      value: `${kpis.mttrAvg} min`,
      subtitle: "Mean Time To Repair",
      icon: Timer,
      variant: "warning" as const,
      visible: hasKpiVisible("MTTR"),
    },
    {
      title: "MTBF",
      value: `${kpis.mtbfAvg} min`,
      subtitle: "Mean Time Between Failures",
      icon: Activity,
      variant: "primary" as const,
      visible: hasKpiVisible("MTBF"),
    },
  ].filter((card) => card.visible);

  const executionCards = [
    {
      title: "Overdue PM",
      value: kpis.overduePM,
      subtitle: "Requires maintenance attention",
      icon: AlertTriangle,
      variant: "destructive" as const,
      visible: hasKpiVisible("OVERDUE_PM"),
    },
    {
      title: "PM Compliance",
      value: `${kpis.pmCompliance}%`,
      subtitle: "Preventive maintenance health",
      icon: CalendarCheck,
      variant: "success" as const,
      visible: true,
    },
    {
      title: "Overdue Calibrations",
      value: kpis.overdueCalibrations,
      subtitle: "Instrumentation pending",
      icon: CircleGauge,
      variant: "warning" as const,
      visible: hasKpiVisible("OVERDUE_CALIBRATIONS"),
    },
    {
      title: "Visitors Today",
      value: kpis.visitorsToday,
      subtitle: "Gate entries in 24 hours",
      icon: Users,
      variant: "info" as const,
      visible: userIsAdmin && hasKpiVisible("VISITORS_TODAY"),
    },
    {
      title: "Active Visitors",
      value: kpis.activeVisitors,
      subtitle: "Currently inside plant",
      icon: Users,
      variant: "primary" as const,
      visible: userIsAdmin,
    },
    {
      title: "Vehicles Entered",
      value: kpis.vehiclesEntered,
      subtitle: "Vehicle movement today",
      icon: Activity,
      variant: "warning" as const,
      visible: userIsAdmin,
    },
    {
      title: "Materials Inward",
      value: kpis.materialsInward,
      subtitle: "Material inward today",
      icon: Workflow,
      variant: "success" as const,
      visible: userIsAdmin,
    },
    {
      title: "Materials Outward",
      value: kpis.materialsOutward,
      subtitle: "Material outward today",
      icon: AlertTriangle,
      variant: "destructive" as const,
      visible: userIsAdmin,
    },
  ].filter((card) => card.visible);

  const handleSuperAdminTabChange = (value: string) => {
    if (value === "overview") {
      setSelectedPlantId(null);
      setActivePlant(null, null, null);
      return;
    }
    const plant = plants.find((item: PlantRow) => item.id === value);
    setSelectedPlantId(plant?.id || null);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageShell className="space-y-4 lg:space-y-6">
      {!userIsSuperAdmin ? (
        <PageHeader
          title="Dashboard"
          subtitle={subtitle}
        />
      ) : null}

      {userIsSuperAdmin ? (
        <Card className="border-primary/10 bg-gradient-to-br from-card to-muted/20 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {organizationName || "Organization Dashboard"}
                </h1>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {subtitle}
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                <div className="w-full lg:w-[260px]">
                  <Select value={selectedPlantId || "overview"} onValueChange={handleSuperAdminTabChange}>
                    <SelectTrigger className="h-12 w-full rounded-2xl border border-border bg-background/85">
                      <SelectValue placeholder="Select plant view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overview">Overview</SelectItem>
                      {plants.map((plant: PlantRow) => (
                        <SelectItem key={plant.id} value={plant.id}>
                          {plant.plant_code || plant.plant_name || "-"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <KPICard
            key={card.title}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            variant={card.variant}
            className="h-full min-h-[128px] sm:min-h-[148px]"
          />
        ))}
      </div>

      {reliabilityCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          {reliabilityCards.map((card) => (
            <KPICard
              key={card.title}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              icon={card.icon}
              variant={card.variant}
              className="h-full min-h-[128px] sm:min-h-[148px]"
            />
          ))}
        </div>
      ) : null}

      {executionCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-4">
          {executionCards.map((card) => (
            <KPICard
              key={card.title}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              icon={card.icon}
              variant={card.variant}
              className="h-full min-h-[128px] sm:min-h-[148px]"
            />
          ))}
        </div>
      ) : null}

      {userIsSuperAdmin && showingOverview ? (
        <>
          <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
            <CardHeader className="border-b border-border/60 bg-gradient-to-r from-primary/8 via-transparent to-transparent pb-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-sm">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl tracking-tight sm:text-2xl">Organization Plant Overview</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                        Compare operational KPI across all plants in {organizationName || "this organization"}.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge variant="info" showDot={false}>
                    {comparisonRows.length} Plants
                  </StatusBadge>
                  <StatusBadge variant="success" showDot={false}>
                    Org Overview
                  </StatusBadge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/35">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <th className="px-6 py-4">Plant</th>
                      <th className="px-4 py-4">Assets</th>
                      <th className="px-4 py-4">Active Assets</th>
                      <th className="px-4 py-4">Open WOs</th>
                      <th className="px-4 py-4">Closed 24h</th>
                      <th className="px-4 py-4">Overdue PM</th>
                      <th className="px-4 py-4">Overdue Cal</th>
                      <th className="px-4 py-4">PM Compliance</th>
                      <th className="px-6 py-4 text-right">MTTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, index) => (
                      <tr
                        key={row.plantId}
                        className={index % 2 === 0 ? "border-t border-border/50 bg-background/60" : "border-t border-border/50 bg-muted/15"}
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{row.plantCode}</span>
                            <span className="text-xs text-muted-foreground">{row.plantName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-medium">{row.totalAssets}</td>
                        <td className="px-4 py-4 font-medium">{row.activeAssets}</td>
                        <td className="px-4 py-4 font-medium">{row.openWOs}</td>
                        <td className="px-4 py-4 font-medium">{row.closedLast24h}</td>
                        <td className="px-4 py-4 font-medium">{row.overduePM}</td>
                        <td className="px-4 py-4 font-medium">{row.overdueCalibrations}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex min-w-[84px] items-center justify-center rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                            {row.pmCompliance}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-medium">{row.mttrAvg} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <MTTRTrendChart data={charts.mttrTrendData} />
            <MTBFTrendChart data={charts.mtbfTrendData} />
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <WOTrendChart data={charts.woTrendData} />
            <WOByCategoryChart data={charts.woByCategoryData} />
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <WOByStatusChart data={charts.woByStatusData} />
            <WOByPriorityChart data={charts.woByPriorityData} />
            <AssetStatusChart data={charts.assetStatusData} />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <MTTRTrendChart data={charts.mttrTrendData} />
            <MTBFTrendChart data={charts.mtbfTrendData} />
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <WOTrendChart data={charts.woTrendData} />
            <WOByCategoryChart data={charts.woByCategoryData} />
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <WOByStatusChart data={charts.woByStatusData} />
            <WOByPriorityChart data={charts.woByPriorityData} />
            <AssetStatusChart data={charts.assetStatusData} />
          </div>

          <RecentWorkOrdersTable workOrders={recentWOs} isLoading={isLoading} />
        </>
      )}
    </PageShell>
  );
}
