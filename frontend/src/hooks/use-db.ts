import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { getStoredAccessToken } from "@/api/http";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

const BACKGROUND_REFRESH_MS = 15_000;

function useAuthQueryEnabled() {
  const { isAuthenticated, isLoading } = useAuthStore();
  return !isLoading && isAuthenticated && Boolean(getStoredAccessToken());
}

const protectedQueryOptions = {
  staleTime: 5_000,
  refetchOnWindowFocus: true as const,
  refetchOnReconnect: true as const,
  refetchInterval: BACKGROUND_REFRESH_MS,
  refetchIntervalInBackground: false as const,
  retry: (failureCount: number, error: any) => {
    const status = error?.status;
    if (status === 401 || status === 403) {
      return false;
    }
    return failureCount < 1;
  },
};

// Generic fetch hook
export function useSupabaseQuery<T>(
  key: string[],
  tableName: string,
  options?: {
    select?: string;
    orderBy?: { column: string; ascending?: boolean };
    filter?: { column: string; value: any };
    enabled?: boolean;
  }
) {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: key,
    enabled: (options?.enabled ?? true) && authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      let query = dbClient.from(tableName as any).select(options?.select || "*");
      if (options?.filter) {
        query = query.eq(options.filter.column, options.filter.value);
      }
      if (options?.orderBy) {
        query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? false });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as T[];
    },
  });
}

// Plants
export function usePlants() {
  return useSupabaseQuery<any>(["plants"], "plants", { orderBy: { column: "created_at" } });
}

// Departments
export function useDepartments() {
  return useSupabaseQuery<any>(["departments"], "departments", { orderBy: { column: "created_at" } });
}

// Vendors
export function useVendors() {
  return useSupabaseQuery<any>(["vendors"], "vendors", { orderBy: { column: "created_at" } });
}

// Cost Centers
export function useCostCenters() {
  return useSupabaseQuery<any>(["cost_centers"], "cost_centers", { orderBy: { column: "created_at" } });
}

// Assets
export function useAssets() {
  return useSupabaseQuery<any>(["assets"], "assets", { orderBy: { column: "created_at" } });
}

// Work Orders
export function useWorkOrders() {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: ["work_orders"],
    enabled: authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("work_orders")
        .select("*, assets(id, code, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// PM Schedules
export function usePMSchedules() {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: ["pm_schedules"],
    enabled: authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("pm_schedules")
        .select("*, assets(id, code, name)")
        .order("next_due", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Spare Items
export function useSpareItems() {
  return useSupabaseQuery<any>(["spare_items"], "spare_items", { orderBy: { column: "created_at" } });
}

// Calibration Records
export function useCalibrationRecords() {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: ["calibration_records"],
    enabled: authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("calibration_records")
        .select("*, assets(id, code, name), vendors(id, name)")
        .order("next_due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// AMC Contracts
export function useAMCContracts() {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: ["amc_contracts"],
    enabled: authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      const { data, error } = await dbClient
        .from("amc_contracts")
        .select("*, assets(id, code, name), vendors(id, name)")
        .order("end_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Dashboard metrics
export function useDashboardMetrics() {
  const authEnabled = useAuthQueryEnabled();
  return useQuery({
    queryKey: ["dashboard_metrics"],
    enabled: authEnabled,
    ...protectedQueryOptions,
    queryFn: async () => {
      const [assetsRes, woRes, pmRes] = await Promise.all([
        dbClient.from("assets").select("id", { count: "exact", head: true }),
        dbClient.from("work_orders").select("id, status, closed_at, downtime_minutes, created_at"),
        dbClient.from("pm_schedules").select("id, status"),
      ]);

      const totalAssets = assetsRes.count || 0;
      const workOrders = woRes.data || [];
      const pmSchedules = pmRes.data || [];

      const activeWO = workOrders.filter(wo => !["CLOSED"].includes(wo.status)).length;
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const closedToday = workOrders.filter(wo => wo.status === "CLOSED" && wo.closed_at && new Date(wo.closed_at) > yesterday).length;
      const overduePM = pmSchedules.filter(pm => pm.status === "OVERDUE").length;

      // Calculate MTTR from closed work orders
      const closedWOs = workOrders.filter(wo => wo.status === "CLOSED" && wo.closed_at);
      
      let sumMttr = 0;
      let countMttr = 0;
      closedWOs.forEach(wo => {
          const start = wo.started_at || wo.opened_at || wo.created_at;
          const end = wo.resolved_at || wo.closed_at;
          if (start && end) {
              const mins = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60);
              if (mins > 0) {
                  sumMttr += mins;
                  countMttr++;
              }
          }
      });
      const mttrAvg = countMttr > 0 ? Math.round(sumMttr / countMttr) : 0;

      const scheduledPM = pmSchedules.filter(pm => pm.status === "SCHEDULED" || pm.status === "COMPLETED").length;
      const totalPM = pmSchedules.length;
      const pmCompliance = totalPM > 0 ? Math.round((scheduledPM / totalPM) * 100) : 100;

      return { totalAssets, activeWO, closedToday, overduePM, mttrAvg, mtbfAvg: 0, pmCompliance };
    },
  });
}

// Generic mutation helper
export function useInsertMutation(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const { data: result, error } = await dbClient.from(tableName as any).insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Record added successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add record");
    },
  });
}

export function useUpdateMutation(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: result, error } = await dbClient.from(tableName as any).update(data).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Record updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update record");
    },
  });
}

export function useDeleteMutation(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dbClient.from(tableName as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Record deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete record");
    },
  });
}
