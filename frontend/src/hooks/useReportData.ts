import { useState, useEffect, useCallback, useRef } from "react";
import { listWorkOrders } from "@/api/workorders";
import { listAssets } from "@/api/assets";
import { listSpareItems } from "@/api/inventory";
import { listGateEntries } from "@/api/gates";
import { listSafetyMetrics } from "@/api/safety";
import { getEsgDashboard } from "@/api/esg";
import { listCalibrationTasks } from "@/api/calibration";
import { listPMSchedules } from "@/api/pm";
import type { Pagination } from "@/api/types";

type DataSource =
  | "work_orders"
  | "assets"
  | "inventory"
  | "safety"
  | "gates"
  | "esg"
  | "calibration"
  | "maintenance"
  | "pm";

interface ReportDataResult {
  headers: string[];
  rows: Array<Array<unknown>>;
  records: Array<Record<string, unknown>>;
  allRows: Array<Array<unknown>>;
  allRecords: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  goToPage: (page: number) => void;
  loadProgress: number;
}

type FetcherResponse = {
  success: boolean;
  data: Array<Record<string, unknown>>;
  pagination?: Pagination | null;
};

type DataSourceFetcher = (params: { limit: number; page: number }) => Promise<FetcherResponse>;

const DATA_SOURCE_MAP: Record<string, DataSourceFetcher> = {
  work_orders: async (params) => {
    const res = await listWorkOrders({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? (res as any).records ?? [], pagination };
  },
  assets: async (params) => {
    const res = await listAssets({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  inventory: async (params) => {
    const res = await listSpareItems({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  safety: async (params) => {
    const res = await listSafetyMetrics({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  gates: async (params) => {
    const res = await listGateEntries({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  esg: async (_params) => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const res = await getEsgDashboard({ year, month });
    const dashboard = (res as any).data;
    const rows: Array<Record<string, unknown>> = [];
    if (dashboard?.current?.energy) {
      rows.push({ section: "Energy", ...dashboard.current.energy });
    }
    if (dashboard?.current?.water) {
      rows.push({ section: "Water", ...dashboard.current.water });
    }
    if (dashboard?.current?.emissions) {
      rows.push({ section: "Emissions", ...dashboard.current.emissions });
    }
    if (dashboard?.current?.waste) {
      rows.push({ section: "Waste", ...dashboard.current.waste });
    }
    return { success: true, data: rows, pagination: null };
  },
  calibration: async (params) => {
    const res = await listCalibrationTasks({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  maintenance: async (params) => {
    const res = await listWorkOrders({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
  pm: async (params) => {
    const res = await listPMSchedules({ limit: params.limit, page: params.page });
    const pagination = (res as any).pagination ?? (res as any).meta?.pagination ?? null;
    return { success: true, data: (res as any).data ?? [], pagination };
  },
};

const DEFAULT_PAGE_SIZE = 10;

function extractHeaders(records: Array<Record<string, unknown>>): string[] {
  if (records.length === 0) return [];
  const keySet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      keySet.add(key);
    }
  }
  return Array.from(keySet);
}

function buildRow(record: Record<string, unknown>, keys: string[]): Array<unknown> {
  return keys.map((key) => {
    const val = record[key];
    if (val === null || val === undefined) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return val;
  });
}

/** Accumulated paginated report data. */
export function useReportData(
  dataSource: string | null | undefined,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ReportDataResult {
  const [allRecords, setAllRecords] = useState<Array<Record<string, unknown>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Array<unknown>>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const source = (dataSource ?? "work_orders") as DataSource;

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!(source in DATA_SOURCE_MAP)) {
        setError(`Unknown data source: ${source}`);
        setAllRecords([]);
        setRows([]);
        setHeaders([]);
        setTotal(0);
        setTotalPages(0);
        return;
      }

      const fetchId = ++fetchIdRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await DATA_SOURCE_MAP[source]({ limit: pageSize, page: pageNum });
        if (fetchId !== fetchIdRef.current) return;

        const data = res.data ?? [];
        const pagination = res.pagination;

        // Determine total and totalPages from the response
        const resolvedTotal = pagination?.total ?? (data.length < pageSize ? (pageNum - 1) * pageSize + data.length : -1);
        const resolvedTotalPages = pagination?.totalPages ?? (resolvedTotal > 0 ? Math.ceil(resolvedTotal / pageSize) : (data.length < pageSize ? pageNum : pageNum + 1));

        setTotal(resolvedTotal > 0 ? resolvedTotal : 0);
        setTotalPages(resolvedTotalPages);

        const extracted = extractHeaders(data);
        const builtRows: Array<Array<unknown>> = data.map((r) => buildRow(r, extracted));

        if (append) {
          setAllRecords((prev) => [...prev, ...data]);
          setRows((prev) => [...prev, ...builtRows]);
        } else {
          setAllRecords(data);
          setRows(builtRows);
          setHeaders(extracted);
        }

        setPage(pageNum);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        if (import.meta.env.DEV) console.error(`useReportData: failed to fetch ${source}`, err);
        setError(err instanceof Error ? err.message : String(err));
        if (!append) {
          setAllRecords([]);
          setRows([]);
          setHeaders([]);
          setTotal(0);
          setTotalPages(0);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [source, pageSize],
  );

  // Reset and fetch page 1 when dataSource changes
  useEffect(() => {
    setPage(1);
    setAllRecords([]);
    setRows([]);
    setHeaders([]);
    setTotal(0);
    setTotalPages(0);
    setError(null);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || loading) return;
    if (totalPages > 0 && page >= totalPages) return;
    fetchPage(page + 1, true);
  }, [page, totalPages, isLoadingMore, loading, fetchPage]);

  const goToPage = useCallback(
    (targetPage: number) => {
      if (isLoadingMore || loading) return;
      const clamped = Math.max(1, Math.min(targetPage, totalPages > 0 ? totalPages : Infinity));
      if (clamped === page) return;
      fetchPage(clamped, false);
    },
    [page, totalPages, isLoadingMore, loading, fetchPage],
  );

  const hasMore = totalPages > 0 ? page < totalPages : !(rows.length > 0 && rows.length < pageSize);

  const loadProgress = total > 0 && allRecords.length > 0
    ? Math.min(allRecords.length / total, 1)
    : 0;

  return {
    headers,
    rows,
    records: allRecords,
    allRows: rows,
    allRecords,
    loading,
    error,
    page,
    totalPages,
    total,
    hasMore,
    isLoadingMore,
    loadMore,
    goToPage,
    loadProgress,
  };
}
