import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { getGateDashboardSummary } from "@/api/gates";
import { getStoredAccessToken } from "@/api/http";
import { useAuthStore, isAdmin, isIncharge, isSuperAdmin } from "@/store/auth.store";
import { usePermissions } from "@/hooks/usePermissions";
import { useMemo, useRef } from "react";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { subDays, subHours, format, startOfDay } from "date-fns";

// Map incharge roles → WO categories
const INCHARGE_CATEGORY_MAP: Record<string, string> = {
  MECHANICAL_INCHARGE: "MECHANICAL",
  ELECTRICAL_INCHARGE: "ELECTRICAL",
  UTILITY_INCHARGE: "UTILITY",
  TOOLCHANGE_INCHARGE: "TOOL_CHANGE",
  CALIBRATION_INCHARGE: "CALIBRATION",
};

function getInchargeCategories(roles: string[]): string[] {
  return roles.filter((r) => INCHARGE_CATEGORY_MAP[r]).map((r) => INCHARGE_CATEGORY_MAP[r]);
}

function getAssetIdFromWo(wo: any): string | null {
  return wo?.asset_id || wo?.assets?.id || null;
}

function groupWosByAsset(workOrders: any[]): Record<string, any[]> {
  const byAsset: Record<string, any[]> = {};
  workOrders.forEach((wo: any) => {
    const assetId = getAssetIdFromWo(wo);
    if (!assetId) return;
    if (!byAsset[assetId]) byAsset[assetId] = [];
    byAsset[assetId].push(wo);
  });
  return byAsset;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Machine-wise MTTR: average downtime per machine, then average across machines.
function calculateMachineWiseMttrMinutes(workOrders: any[]): number {
  const byAsset = groupWosByAsset(workOrders);
  const perMachineMttr: number[] = [];

  Object.values(byAsset).forEach((rows) => {
    const closedWithDowntime = rows.filter(
      (wo: any) => wo.status === "CLOSED" && wo.downtime_minutes && wo.downtime_minutes > 0,
    );
    if (closedWithDowntime.length === 0) return;
    perMachineMttr.push(average(closedWithDowntime.map((wo: any) => Number(wo.downtime_minutes) || 0)));
  });

  return Math.round(average(perMachineMttr));
}

// Machine-wise MTBF: average gap between failures per machine, then average across machines.
function calculateMachineWiseMtbfMinutes(workOrders: any[]): number {
  const byAsset = groupWosByAsset(workOrders.filter((wo: any) => wo.status === "CLOSED" && wo.closed_at));
  const perMachineMtbfMinutes: number[] = [];

  Object.values(byAsset).forEach((rows) => {
    if (rows.length < 2) return;
    const failures = rows
      .map((wo: any) => new Date(wo.created_at))
      .filter((date: Date) => !Number.isNaN(date.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    if (failures.length < 2) return;

    const gaps: number[] = [];
    for (let index = 1; index < failures.length; index += 1) {
      const gapMinutes = (failures[index].getTime() - failures[index - 1].getTime()) / (1000 * 60);
      if (gapMinutes > 0) gaps.push(gapMinutes);
    }
    if (gaps.length === 0) return;
    perMachineMtbfMinutes.push(average(gaps));
  });

  return Math.round(average(perMachineMtbfMinutes));
}

export function useDashboardData(selectedPlantId?: string | null) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const authEnabled = !authLoading && isAuthenticated && Boolean(getStoredAccessToken());
  const permissionsReady = !permissionsLoading;
  const userIsAdmin = isAdmin(user);
  const userIsSuperAdmin = isSuperAdmin(user);
  const userIsIncharge = isIncharge(user);
  const inchargeCategories = useMemo(() => getInchargeCategories(user?.roles || []), [user?.roles]);
  const canReadWorkOrders = hasModuleAccess("workorders", "view");
  const canReadAssets = hasModuleAccess("assets", "view");
  const canReadPm = hasModuleAccess("pmpd", "view");
  const canReadCalibration = hasModuleAccess("calibration", "view");
  const canReadGates = hasModuleAccess("security-gate", "view");
  const canReadPlants = hasModuleAccess("masters.plant", "view") || hasModuleAccess("PLANTS", "view");
  const dashboardRefetchInterval: number | false = authEnabled ? 20_000 : false;
  const protectedQueryOptions = {
    enabled: authEnabled && permissionsReady,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true as const,
    refetchOnReconnect: true as const,
    refetchInterval: dashboardRefetchInterval,
    refetchIntervalInBackground: true as const,
    staleTime: 0,
    retry: (failureCount: number, error: any) => {
      const status = error?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  };

  const lastRealtimeRefreshAtRef = useRef(0);
  useDashboardRealtime({
    enabled: authEnabled && permissionsReady,
    onRefresh: () => {
      const now = Date.now();
      if (now - lastRealtimeRefreshAtRef.current < 1500) return;
      lastRealtimeRefreshAtRef.current = now;

      void queryClient.invalidateQueries({ queryKey: ["dashboard_wo"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_assets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_pm"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_calibrations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_gate"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_plants"] });
    },
  });

  // Fetch all work orders (RLS handles plant filtering)
  const { data: workOrders = [], isLoading: woLoading } = useQuery({
    queryKey: ["dashboard_wo"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadWorkOrders,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("work_orders")
        .select("id, plant_id, asset_id, status, category, priority, created_at, closed_at, opened_at, downtime_minutes, raised_by, assigned_to, wo_number, assets(id, code, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["dashboard_assets"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadAssets,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("assets")
        .select("id, plant_id, status, type, criticality");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: pmSchedules = [], isLoading: pmLoading } = useQuery({
    queryKey: ["dashboard_pm"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadPm,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("pm_schedules")
        .select("id, plant_id, status, frequency, next_due, last_completed");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: calibrations = [], isLoading: calLoading } = useQuery({
    queryKey: ["dashboard_calibrations"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadCalibration,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("calibration_records")
        .select("id, plant_id, status, next_due_date");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: gateSummary = { visitorsToday: 0, vehiclesEntered: 0, materialsInward: 0, materialsOutward: 0, activeVisitors: 0 }, isLoading: gateLoading } = useQuery({
    queryKey: ["dashboard_gate"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadGates,
    queryFn: async () => {
      const response = await getGateDashboardSummary({ plantId: userIsSuperAdmin ? selectedPlantId || undefined : user?.plantId || undefined });
      return response.data;
    },
  });

  const { data: plants = [], isLoading: plantsLoading } = useQuery({
    queryKey: ["dashboard_plants"],
    ...protectedQueryOptions,
    enabled: protectedQueryOptions.enabled && canReadPlants,
    queryFn: async () => {
      const { data, error } = await dbClient.from("plants").select("id, plant_code, plant_name, is_active");
      if (error) throw error;
      return data || [];
    },
  });

  const activePlants = useMemo(
    () => plants.filter((plant: any) => plant.is_active !== false),
    [plants],
  );

  const scopedWorkOrders = useMemo(() => {
    if (!userIsSuperAdmin || !selectedPlantId) return workOrders;
    return workOrders.filter((wo: any) => wo.plant_id === selectedPlantId);
  }, [workOrders, userIsSuperAdmin, selectedPlantId]);

  const scopedAssets = useMemo(() => {
    if (!userIsSuperAdmin || !selectedPlantId) return assets;
    return assets.filter((asset: any) => asset.plant_id === selectedPlantId);
  }, [assets, userIsSuperAdmin, selectedPlantId]);

  const scopedPmSchedules = useMemo(() => {
    if (!userIsSuperAdmin || !selectedPlantId) return pmSchedules;
    return pmSchedules.filter((pm: any) => pm.plant_id === selectedPlantId);
  }, [pmSchedules, userIsSuperAdmin, selectedPlantId]);

  const scopedCalibrations = useMemo(() => {
    if (!userIsSuperAdmin || !selectedPlantId) return calibrations;
    return calibrations.filter((calibration: any) => calibration.plant_id === selectedPlantId);
  }, [calibrations, userIsSuperAdmin, selectedPlantId]);

  const actorIds = useMemo(
    () =>
      new Set(
        [user?.authId, user?.id].filter((value): value is string => Boolean(value)),
      ),
    [user?.authId, user?.id],
  );

  const isOwnedByActor = (value: unknown) => typeof value === "string" && actorIds.has(value);

  // Role-based WO filtering
  const filteredWOs = useMemo(() => {
    if (userIsAdmin) return scopedWorkOrders;
    if (userIsIncharge) {
      return scopedWorkOrders.filter(
        (wo: any) => inchargeCategories.includes(wo.category) || isOwnedByActor(wo.raised_by) || isOwnedByActor(wo.assigned_to)
      );
    }
    if (actorIds.size === 0) return [];
    return scopedWorkOrders.filter((wo: any) => isOwnedByActor(wo.raised_by) || isOwnedByActor(wo.assigned_to));
  }, [scopedWorkOrders, userIsAdmin, userIsIncharge, inchargeCategories, actorIds]);

  const isLoading = (authEnabled && permissionsLoading) || woLoading || assetsLoading || pmLoading || calLoading || gateLoading || plantsLoading;

  // KPIs
  const now24h = subHours(new Date(), 24);
  const totalAssets = scopedAssets.length;
  const totalPlants = activePlants.length;
  const activeAssets = scopedAssets.filter((a: any) => a.status === "ACTIVE").length;
  const openWOs = filteredWOs.filter((wo: any) => wo.status !== "CLOSED").length;
  const closedLast24h = filteredWOs.filter(
    (wo: any) => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > now24h
  ).length;
  const overduePM = scopedPmSchedules.filter((pm: any) => pm.status === "OVERDUE").length;
  const pendingApproval = filteredWOs.filter((wo: any) => ["USER_VERIFICATION", "APPROVAL_PENDING"].includes(wo.status)).length;
  const overdueCalibrations = scopedCalibrations.filter((c: any) => c.status === "OVERDUE").length;
  const visitorsToday = gateSummary.visitorsToday;
  const vehiclesEntered = gateSummary.vehiclesEntered;
  const materialsInward = gateSummary.materialsInward;
  const materialsOutward = gateSummary.materialsOutward;
  const activeVisitors = gateSummary.activeVisitors;

  const mttrAvg = useMemo(() => calculateMachineWiseMttrMinutes(filteredWOs), [filteredWOs]);
  const mtbfAvg = useMemo(() => calculateMachineWiseMtbfMinutes(filteredWOs), [filteredWOs]);

  // PM Compliance
  const completedPM = scopedPmSchedules.filter((pm: any) => pm.status === "COMPLETED").length;
  const totalPM = scopedPmSchedules.length;
  const pmCompliance = totalPM > 0 ? Math.round((completedPM / totalPM) * 100) : 100;

  // WO by category (for pie/bar)
  const woByCategoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    filteredWOs.forEach((wo: any) => {
      cats[wo.category] = (cats[wo.category] || 0) + 1;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [filteredWOs]);

  // WO by status
  const woByStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    filteredWOs.forEach((wo: any) => {
      const s = wo.status.replace(/_/g, " ");
      statuses[s] = (statuses[s] || 0) + 1;
    });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [filteredWOs]);

  // WO by priority
  const woByPriorityData = useMemo(() => {
    const priorities: Record<string, number> = {};
    filteredWOs.forEach((wo: any) => {
      priorities[wo.priority] = (priorities[wo.priority] || 0) + 1;
    });
    return Object.entries(priorities).map(([name, value]) => ({ name, value }));
  }, [filteredWOs]);

  // WO trend (last 7 days) - raised vs closed per day
  const woTrendData = useMemo(() => {
    const days: { date: string; raised: number; closed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const nextDay = startOfDay(subDays(new Date(), i - 1));
      const raised = filteredWOs.filter(
        (wo: any) => new Date(wo.created_at) >= day && new Date(wo.created_at) < nextDay
      ).length;
      const closed = filteredWOs.filter(
        (wo: any) => wo.closed_at && new Date(wo.closed_at) >= day && new Date(wo.closed_at) < nextDay
      ).length;
      days.push({ date: dayStr, raised, closed });
    }
    return days;
  }, [filteredWOs]);

  // MTTR trend (last 7 days) - avg downtime of WOs closed each day
  const mttrTrendData = useMemo(() => {
    const days: { date: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const nextDay = startOfDay(subDays(new Date(), i - 1));
      const closedToday = filteredWOs.filter(
        (wo: any) =>
          wo.status === "CLOSED" &&
          wo.closed_at &&
          new Date(wo.closed_at) >= day &&
          new Date(wo.closed_at) < nextDay &&
          wo.downtime_minutes > 0
      );
      const avg = closedToday.length > 0
        ? Math.round(closedToday.reduce((s: number, w: any) => s + w.downtime_minutes, 0) / closedToday.length)
        : 0;
      days.push({ date: dayStr, value: avg });
    }
    return days;
  }, [filteredWOs]);

  // MTBF trend (last 7 days) - avg time between failures for WOs created each day
  const mtbfTrendData = useMemo(() => {
    const days: { date: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const nextDay = startOfDay(subDays(new Date(), i - 1));
      const dayWOs = filteredWOs.filter(
        (wo: any) => new Date(wo.created_at) >= day && new Date(wo.created_at) < nextDay
      );
      // Group by asset to find gaps
      const byAsset: Record<string, Date[]> = {};
      dayWOs.forEach((wo: any) => {
        const assetId = wo.asset_id || wo.assets?.id;
        if (!assetId) return;
        if (!byAsset[assetId]) byAsset[assetId] = [];
        byAsset[assetId].push(new Date(wo.created_at));
      });
      let totalGap = 0;
      let gapCount = 0;
      Object.values(byAsset).forEach((dates) => {
        if (dates.length < 2) return;
        dates.sort((a, b) => a.getTime() - b.getTime());
        for (let j = 1; j < dates.length; j++) {
          totalGap += (dates[j].getTime() - dates[j - 1].getTime()) / (1000 * 60);
          gapCount++;
        }
      });
      days.push({ date: dayStr, value: gapCount > 0 ? Math.round(totalGap / gapCount) : 0 });
    }
    return days;
  }, [filteredWOs]);

  // Asset status breakdown
  const assetStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    scopedAssets.forEach((a: any) => {
      const s = a.status.replace(/_/g, " ");
      statuses[s] = (statuses[s] || 0) + 1;
    });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [scopedAssets]);

  const comparisonRows = useMemo(() => {
    if (!userIsSuperAdmin) return [];

    return activePlants
      .map((plant: any) => {
        const plantAssets = assets.filter((asset: any) => asset.plant_id === plant.id);
        const plantWOs = workOrders.filter((wo: any) => wo.plant_id === plant.id);
        const plantPm = pmSchedules.filter((pm: any) => pm.plant_id === plant.id);
        const plantCalibrations = calibrations.filter((calibration: any) => calibration.plant_id === plant.id);

        const totalPlantAssets = plantAssets.length;
        const activePlantAssets = plantAssets.filter((asset: any) => asset.status === "ACTIVE").length;
        const plantOpenWos = plantWOs.filter((wo: any) => wo.status !== "CLOSED").length;
        const plantClosed24h = plantWOs.filter(
          (wo: any) => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > now24h,
        ).length;
        const plantOverduePm = plantPm.filter((pm: any) => pm.status === "OVERDUE").length;
        const plantOverdueCalibrations = plantCalibrations.filter((calibration: any) => calibration.status === "OVERDUE").length;
        const plantCompletedPm = plantPm.filter((pm: any) => pm.status === "COMPLETED").length;
        const plantPmCompliance = plantPm.length > 0 ? Math.round((plantCompletedPm / plantPm.length) * 100) : 100;

        const plantMttr = calculateMachineWiseMttrMinutes(plantWOs);

        return {
          plantId: plant.id as string,
          plantCode: (plant.plant_code as string | null) || "-",
          plantName: (plant.plant_name as string | null) || "Unnamed Plant",
          totalAssets: totalPlantAssets,
          activeAssets: activePlantAssets,
          openWOs: plantOpenWos,
          closedLast24h: plantClosed24h,
          overduePM: plantOverduePm,
          overdueCalibrations: plantOverdueCalibrations,
          pmCompliance: plantPmCompliance,
          mttrAvg: plantMttr,
        };
      })
      .sort((a, b) => a.plantCode.localeCompare(b.plantCode));
  }, [userIsSuperAdmin, activePlants, assets, workOrders, pmSchedules, calibrations, now24h]);

  // Recent WOs (top 5 from filtered)
  const recentWOs = filteredWOs.slice(0, 5);

  return {
    isLoading,
    plants: activePlants,
    kpis: {
      totalPlants,
      totalAssets, activeAssets, openWOs, closedLast24h,
      overduePM, pendingApproval, overdueCalibrations,
      visitorsToday, vehiclesEntered, materialsInward, materialsOutward, activeVisitors, mttrAvg, mtbfAvg, pmCompliance,
    },
    charts: {
      woByCategoryData, woByStatusData, woByPriorityData,
      woTrendData, mttrTrendData, mtbfTrendData, assetStatusData,
    },
    comparisonRows,
    recentWOs,
    userIsSuperAdmin,
    userIsAdmin,
    userIsIncharge,
  };
}
