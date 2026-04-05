import { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FileText, Download, BarChart3, Calendar, TrendingUp, Package, Wrench,
  Loader2, Activity, Gauge, ShieldAlert, Clock, Timer, AlertTriangle,
  ChevronDown, Filter, X
} from "lucide-react";
import { toast } from "sonner";
import { SelectField } from "@/components/shared/FormField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dbClient } from "@/api/dbClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadAdvancedReliabilityReport, getAdvancedReliabilityReport } from "@/api/reports";
import { listWorkOrderMasters, type WorkOrderMaster } from "@/api/workOrderMasters";
import { subscribeWorkOrderSync } from "@/lib/work-order-sync";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from "recharts";
import { format, subDays, eachDayOfInterval, differenceInMinutes, parseISO } from "date-fns";
import { KPICard } from "@/components/dashboard/KPICard";
import { hoursToMinutes } from "@/lib/time";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#8884d8", "#82ca9d", "#ffc658"
];

function getMasterCodes(masters: WorkOrderMaster[], optionType: "CATEGORY" | "WO_TYPE") {
  return Array.from(
    new Set(
      masters
        .filter((item) => item.optionType === optionType && item.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
        .map((item) => item.code),
    ),
  );
}

// Multi-select dropdown component
function MultiSelect({ label, options, selected, onChange, icon: Icon, labels }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  icon?: any;
  labels?: Record<string, string>;
}) {
  const getOptionLabel = (value: string) => labels?.[value] || value.replace(/_/g, " ");
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span>{label}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{selected.length}</Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span>{getOptionLabel(opt)}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => onChange([])}>
            <X className="h-3 w-3 mr-1" /> Clear all
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Filter bar component for reuse
function FilterBar({ filters, onReset }: {
  filters: {
    label: string;
    options: string[];
    selected: string[];
    onChange: (v: string[]) => void;
    icon?: any;
    labels?: Record<string, string>;
  }[];
  onReset: () => void;
}) {
  const hasActive = filters.some(f => f.selected.length > 0);
  return (
    <Card className="shadow-card">
      <CardContent className="py-3 px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> Filters
          </div>
          <div className="flex gap-2 flex-wrap">
            {filters.map(f => (
              <MultiSelect key={f.label} label={f.label} options={f.options} selected={f.selected} onChange={f.onChange} icon={f.icon} labels={f.labels} />
            ))}
            {hasActive && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onReset}>
                <X className="h-3 w-3 mr-1" /> Reset All
              </Button>
            )}
          </div>
        </div>
        {hasActive && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {filters.flatMap(f => f.selected.map(s => (
              <Badge key={`${f.label}-${s}`} variant="secondary" className="text-xs gap-1">
                {f.label}: {f.labels?.[s] || s.replace(/_/g, " ")}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => f.onChange(f.selected.filter(v => v !== s))} />
              </Badge>
            )))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// CSV export helper
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} records`);
}

const esc = (v: string | null | undefined) => `"${(v || "").replace(/"/g, '""')}"`;

export default function Reports() {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState("30");

  // MTTR filters
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // WO tab filters
  const [woStatuses, setWoStatuses] = useState<string[]>([]);
  const [woTypes, setWoTypes] = useState<string[]>([]);
  const [woPriorities, setWoPriorities] = useState<string[]>([]);
  const [woDepts, setWoDepts] = useState<string[]>([]);
  const [woCats, setWoCats] = useState<string[]>([]);

  // Safety tab filters
  const [safetyTypes, setSafetyTypes] = useState<string[]>([]);
  const [safetySeverities, setSafetySeverities] = useState<string[]>([]);
  const [safetyStatuses, setSafetyStatuses] = useState<string[]>([]);

  // Maintenance tab filters
  const [pmStatuses, setPmStatuses] = useState<string[]>([]);
  const [pmFreqs, setPmFreqs] = useState<string[]>([]);
  const [calStatuses, setCalStatuses] = useState<string[]>([]);
  const [amcStatuses, setAmcStatuses] = useState<string[]>([]);

  // Inventory tab filters
  const [invCategories, setInvCategories] = useState<string[]>([]);
  const [invStockStatus, setInvStockStatus] = useState<string[]>([]);
  const [srStatuses, setSrStatuses] = useState<string[]>([]);

  // Downtime tab filters
  const [dtDepts, setDtDepts] = useState<string[]>([]);
  const [dtCats, setDtCats] = useState<string[]>([]);
  const [dtPriorities, setDtPriorities] = useState<string[]>([]);

  // Export tab filters
  const [expStatuses, setExpStatuses] = useState<string[]>([]);
  const [expTypes, setExpTypes] = useState<string[]>([]);
  const [expPriorities, setExpPriorities] = useState<string[]>([]);
  const [expCats, setExpCats] = useState<string[]>([]);
  const [expDepts, setExpDepts] = useState<string[]>([]);
  const [advancedExportBusy, setAdvancedExportBusy] = useState<"csv" | "excel" | "pdf" | null>(null);

  // Fetch data
  const { data: workOrders = [], isLoading: woLoading } = useQuery({
    queryKey: ["report_work_orders"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("work_orders")
        .select("*, assets(name, code, department_id, departments(name))").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["report_departments"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("departments").select("id, name, code").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: pmSchedules = [] } = useQuery({
    queryKey: ["report_pm"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("pm_schedules").select("*, assets(name, code, department_id)");
      if (error) throw error;
      return data;
    },
  });

  const { data: calibrations = [] } = useQuery({
    queryKey: ["report_calibrations"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("calibration_records").select("*, assets(name, code)");
      if (error) throw error;
      return data;
    },
  });

  const { data: amcContracts = [] } = useQuery({
    queryKey: ["report_amc"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("amc_contracts").select("*, assets(name, code), vendors(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: safetyIncidents = [] } = useQuery({
    queryKey: ["report_safety"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("safety_incidents").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: spareItems = [] } = useQuery({
    queryKey: ["report_spares"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("spare_items").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: stockRequests = [] } = useQuery({
    queryKey: ["report_stock_requests"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("stock_requests").select("*, spare_items(name, code)");
      if (error) throw error;
      return data;
    },
  });
  const { data: workOrderMasters = [] } = useQuery({
    queryKey: ["report_work_order_masters"],
    queryFn: async () => {
      const response = await listWorkOrderMasters({ page: 1, limit: 2000, includeInactive: false });
      return response.data || [];
    },
  });

  useEffect(() => {
    const unsubscribe = subscribeWorkOrderSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["report_work_order_masters"] });
    });

    return unsubscribe;
  }, [queryClient]);

  // Option lists
  const deptNames = useMemo(() => departments.map((d: any) => d.name), [departments]);
  const deptIdMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d: any) => { m[d.name] = d.id; });
    return m;
  }, [departments]);
  const toDeptIds = (names: string[]) => names.map(n => deptIdMap[n]).filter(Boolean);

  const startDate = useMemo(() => format(subDays(new Date(), parseInt(dateRange, 10)), "yyyy-MM-dd"), [dateRange]);
  const endDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const { data: advancedReliability } = useQuery({
    queryKey: ["advanced_reliability", dateRange],
    queryFn: async () => {
      const response = await getAdvancedReliabilityReport({ startDate, endDate, page: 1, limit: 200 });
      return response.data;
    },
  });

  const categoryOptions = useMemo(() => getMasterCodes(workOrderMasters, "CATEGORY"), [workOrderMasters]);
  const statusOptions = ["RAISED", "OPENED", "IN_PROGRESS", "PARTIALLY_CLOSED", "APPROVAL_PENDING", "REJECTED", "CLOSED"];
  const typeOptions = useMemo(() => getMasterCodes(workOrderMasters, "WO_TYPE"), [workOrderMasters]);
  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    workOrderMasters
      .filter((item) => item.optionType === "CATEGORY" && item.isActive)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
      .forEach((item) => {
        if (!map[item.code]) {
          map[item.code] = item.label;
        }
      });
    return map;
  }, [workOrderMasters]);
  const typeLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    workOrderMasters
      .filter((item) => item.optionType === "WO_TYPE" && item.isActive)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
      .forEach((item) => {
        if (!map[item.code]) {
          map[item.code] = item.label;
        }
      });
    return map;
  }, [workOrderMasters]);
  const priorityOptions = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const safetyTypeOptions = useMemo(() => [...new Set(safetyIncidents.map((i: any) => i.incident_type))].filter((value): value is string => typeof value === "string" && value.length > 0), [safetyIncidents]);
  const safetySevOptions = useMemo(() => [...new Set(safetyIncidents.map((i: any) => i.severity))].filter((value): value is string => typeof value === "string" && value.length > 0), [safetyIncidents]);
  const safetyStatusOptions = useMemo(() => [...new Set(safetyIncidents.map((i: any) => i.status))].filter((value): value is string => typeof value === "string" && value.length > 0), [safetyIncidents]);
  const pmStatusOptions = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "OVERDUE"];
  const pmFreqOptions = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];
  const calStatusOptions = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "OVERDUE"];
  const amcStatusOptions = ["ACTIVE", "EXPIRED", "RENEWAL_DUE"];
  const invCategoryOptions = useMemo(() => [...new Set(spareItems.map((s: any) => s.category))].filter((value): value is string => typeof value === "string" && value.length > 0), [spareItems]);
  const stockStatusLabels = ["Below Min", "Reorder Needed", "Adequate"];
  const srStatusOptions = ["REQUESTED", "APPROVED", "REJECTED", "ISSUED", "CONSUMED"];

  // Generic WO filter
  const filterWOs = (wos: any[], deptIds: string[], cats: string[], statuses: string[], types: string[], priorities: string[]) => {
    let f = wos;
    if (deptIds.length > 0) f = f.filter((wo: any) => deptIds.includes(wo.assets?.department_id));
    if (cats.length > 0) f = f.filter((wo: any) => cats.includes(wo.category));
    if (statuses.length > 0) f = f.filter((wo: any) => statuses.includes(wo.status));
    if (types.length > 0) f = f.filter((wo: any) => types.includes(wo.wo_type));
    if (priorities.length > 0) f = f.filter((wo: any) => priorities.includes(wo.priority));
    return f;
  };

  // MTTR tab filtered
  const selectedDeptIds = useMemo(() => toDeptIds(selectedDepts), [selectedDepts, deptIdMap]);
  const filteredWOs = useMemo(() => filterWOs(workOrders, selectedDeptIds, selectedCategories, [], [], []), [workOrders, selectedDeptIds, selectedCategories]);

  // WO tab filtered
  const woFilteredDeptIds = useMemo(() => toDeptIds(woDepts), [woDepts, deptIdMap]);
  const woFiltered = useMemo(() => filterWOs(workOrders, woFilteredDeptIds, woCats, woStatuses, woTypes, woPriorities), [workOrders, woFilteredDeptIds, woCats, woStatuses, woTypes, woPriorities]);

  // Downtime tab filtered
  const dtFilteredDeptIds = useMemo(() => toDeptIds(dtDepts), [dtDepts, deptIdMap]);
  const dtFiltered = useMemo(() => filterWOs(workOrders, dtFilteredDeptIds, dtCats, [], [], dtPriorities), [workOrders, dtFilteredDeptIds, dtCats, dtPriorities]);

  // Safety filtered
  const safetyFiltered = useMemo(() => {
    let f = safetyIncidents;
    if (safetyTypes.length > 0) f = f.filter((i: any) => safetyTypes.includes(i.incident_type));
    if (safetySeverities.length > 0) f = f.filter((i: any) => safetySeverities.includes(i.severity));
    if (safetyStatuses.length > 0) f = f.filter((i: any) => safetyStatuses.includes(i.status));
    return f;
  }, [safetyIncidents, safetyTypes, safetySeverities, safetyStatuses]);

  // PM filtered
  const pmFiltered = useMemo(() => {
    let f = pmSchedules;
    if (pmStatuses.length > 0) f = f.filter((p: any) => pmStatuses.includes(p.status));
    if (pmFreqs.length > 0) f = f.filter((p: any) => pmFreqs.includes(p.frequency));
    return f;
  }, [pmSchedules, pmStatuses, pmFreqs]);

  // Calibration filtered
  const calFiltered = useMemo(() => {
    let f = calibrations;
    if (calStatuses.length > 0) f = f.filter((c: any) => calStatuses.includes(c.status));
    return f;
  }, [calibrations, calStatuses]);

  // AMC filtered
  const amcFiltered = useMemo(() => {
    let f = amcContracts;
    if (amcStatuses.length > 0) f = f.filter((a: any) => amcStatuses.includes(a.status));
    return f;
  }, [amcContracts, amcStatuses]);

  // Inventory filtered
  const invFiltered = useMemo(() => {
    let f = spareItems;
    if (invCategories.length > 0) f = f.filter((s: any) => invCategories.includes(s.category));
    if (invStockStatus.length > 0) {
      f = f.filter((s: any) => {
        const isBelowMin = s.current_stock <= s.min_level;
        const isReorder = s.current_stock <= s.reorder_level && s.current_stock > s.min_level;
        const isAdequate = s.current_stock > s.reorder_level;
        return (invStockStatus.includes("Below Min") && isBelowMin) ||
               (invStockStatus.includes("Reorder Needed") && isReorder) ||
               (invStockStatus.includes("Adequate") && isAdequate);
      });
    }
    return f;
  }, [spareItems, invCategories, invStockStatus]);

  // Stock requests filtered
  const srFiltered = useMemo(() => {
    let f = stockRequests;
    if (srStatuses.length > 0) f = f.filter((r: any) => srStatuses.includes(r.status));
    return f;
  }, [stockRequests, srStatuses]);

  // Export tab filtered
  const expFilteredDeptIds = useMemo(() => toDeptIds(expDepts), [expDepts, deptIdMap]);
  const expFiltered = useMemo(() => filterWOs(workOrders, expFilteredDeptIds, expCats, expStatuses, expTypes, expPriorities), [workOrders, expFilteredDeptIds, expCats, expStatuses, expTypes, expPriorities]);

  // MTTR
  const mttrData = useMemo(() => {
    const groupKey = selectedDepts.length > 0 ? "dept" : "category";
    const groups: Record<string, number[]> = {};
    filteredWOs.forEach((wo: any) => {
      if (wo.status === "CLOSED" && wo.opened_at && wo.closed_at) {
        const mins = differenceInMinutes(parseISO(wo.closed_at), parseISO(wo.opened_at));
        const key = groupKey === "dept" ? (wo.assets?.departments?.name || "Unknown") : (wo.category || "Unknown");
        if (!groups[key]) groups[key] = [];
        groups[key].push(mins);
      }
    });
    return Object.entries(groups).map(([name, vals]) => ({
      name: name.replace(/_/g, " "),
      mttr: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      count: vals.length,
    }));
  }, [filteredWOs, selectedDepts]);

  // MTBF
  const mtbfData = useMemo(() => {
    const assetWOs: Record<string, { dates: Date[]; dept: string }> = {};
    filteredWOs.forEach((wo: any) => {
      if (!assetWOs[wo.asset_id]) assetWOs[wo.asset_id] = { dates: [], dept: wo.assets?.departments?.name || "Unknown" };
      assetWOs[wo.asset_id].dates.push(parseISO(wo.created_at));
    });
    const deptMtbf: Record<string, number[]> = {};
    Object.values(assetWOs).forEach(({ dates, dept }) => {
      if (dates.length < 2) return;
      dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < dates.length; i++) {
        const mins = differenceInMinutes(dates[i], dates[i - 1]);
        if (!deptMtbf[dept]) deptMtbf[dept] = [];
        deptMtbf[dept].push(mins);
      }
    });
    return Object.entries(deptMtbf).map(([name, vals]) => ({
      name: name.replace(/_/g, " "),
      mtbf: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }));
  }, [filteredWOs]);

  // KPIs
  const kpis = useMemo(() => {
    const totalWO = workOrders.length;
    const closedWO = workOrders.filter((wo: any) => wo.status === "CLOSED").length;
    const openWO = workOrders.filter((wo: any) => wo.status !== "CLOSED").length;
    const avgDowntime = workOrders.filter((wo: any) => wo.downtime_minutes > 0)
      .reduce((s: number, wo: any) => s + wo.downtime_minutes, 0) /
      Math.max(workOrders.filter((wo: any) => wo.downtime_minutes > 0).length, 1);
    const pmCompliance = pmSchedules.length > 0
      ? Math.round((pmSchedules.filter((p: any) => p.status === "COMPLETED" || p.status === "SCHEDULED").length / pmSchedules.length) * 100) : 0;
    const totalIncidents = safetyIncidents.length;
    const openIncidents = safetyIncidents.filter((i: any) => i.status === "OPEN" || i.status === "INVESTIGATING").length;
    const totalCost = workOrders.reduce((s: number, wo: any) => s + (wo.actual_cost || 0), 0);
    return { totalWO, closedWO, openWO, avgDowntime: Math.round(avgDowntime), pmCompliance, totalIncidents, openIncidents, totalCost };
  }, [workOrders, pmSchedules, safetyIncidents]);

  // WO tab charts (use woFiltered)
  const woCategoryChart = useMemo(() => {
    const cats: Record<string, number> = {};
    woFiltered.forEach((wo: any) => { cats[wo.category] = (cats[wo.category] || 0) + 1; });
    return Object.entries(cats).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [woFiltered]);

  const woStatusChart = useMemo(() => {
    const s: Record<string, number> = {};
    woFiltered.forEach((wo: any) => { s[wo.status] = (s[wo.status] || 0) + 1; });
    return Object.entries(s).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [woFiltered]);

  const woTypeChart = useMemo(() => {
    const t: Record<string, number> = {};
    woFiltered.forEach((wo: any) => {
      const typeCode = wo.wo_type || "UNSPECIFIED";
      t[typeCode] = (t[typeCode] || 0) + 1;
    });
    return Object.entries(t).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [woFiltered]);

  const woTrend = useMemo(() => {
    const days = parseInt(dateRange);
    const interval = eachDayOfInterval({ start: subDays(new Date(), days), end: new Date() });
    return interval.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const count = woFiltered.filter((wo: any) => wo.created_at?.startsWith(dayStr)).length;
      return { date: format(day, "dd MMM"), count };
    });
  }, [woFiltered, dateRange]);

  const woPriorityChart = useMemo(() => {
    const p: Record<string, number> = {};
    woFiltered.forEach((wo: any) => { p[wo.priority] = (p[wo.priority] || 0) + 1; });
    return Object.entries(p).map(([name, value]) => ({ name, value }));
  }, [woFiltered]);

  // Safety charts (use safetyFiltered)
  const safetyChart = useMemo(() => {
    const t: Record<string, number> = {};
    safetyFiltered.forEach((i: any) => { t[i.incident_type] = (t[i.incident_type] || 0) + 1; });
    return Object.entries(t).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [safetyFiltered]);

  const safetySeverityChart = useMemo(() => {
    const s: Record<string, number> = {};
    safetyFiltered.forEach((i: any) => { s[i.severity] = (s[i.severity] || 0) + 1; });
    return Object.entries(s).map(([name, value]) => ({ name, value }));
  }, [safetyFiltered]);

  const safetyStatusChart = useMemo(() => {
    const s: Record<string, number> = {};
    safetyFiltered.forEach((i: any) => { s[i.status] = (s[i.status] || 0) + 1; });
    return Object.entries(s).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [safetyFiltered]);

  const safetyTrend = useMemo(() => {
    const days = parseInt(dateRange);
    const interval = eachDayOfInterval({ start: subDays(new Date(), days), end: new Date() });
    return interval.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const count = safetyFiltered.filter((i: any) => i.incident_date?.startsWith(dayStr)).length;
      return { date: format(day, "dd MMM"), count };
    });
  }, [safetyFiltered, dateRange]);

  const safetyKpis = useMemo(() => {
    const total = safetyFiltered.length;
    const open = safetyFiltered.filter((i: any) => i.status === "OPEN").length;
    const investigating = safetyFiltered.filter((i: any) => i.status === "INVESTIGATING").length;
    const lostTime = hoursToMinutes(safetyFiltered.reduce((s: number, i: any) => s + (i.lost_time_hours || 0), 0));
    const peopleAffected = safetyFiltered.reduce((s: number, i: any) => s + (i.people_involved || 0), 0);
    const highSev = safetyFiltered.filter((i: any) => i.severity === "HIGH" || i.severity === "CRITICAL").length;
    const nearMiss = safetyFiltered.filter((i: any) => i.incident_type === "NEAR_MISS").length;
    return { total, open, investigating, lostTime, peopleAffected, highSev, nearMiss };
  }, [safetyFiltered]);

  // Downtime charts (use dtFiltered)
  const downtimeByAsset = useMemo(() => {
    const assets: Record<string, { name: string; downtime: number }> = {};
    dtFiltered.forEach((wo: any) => {
      if (wo.downtime_minutes > 0 && wo.assets?.name) {
        if (!assets[wo.asset_id]) assets[wo.asset_id] = { name: wo.assets.name.substring(0, 20), downtime: 0 };
        assets[wo.asset_id].downtime += wo.downtime_minutes;
      }
    });
    return Object.values(assets).sort((a, b) => b.downtime - a.downtime).slice(0, 10);
  }, [dtFiltered]);

  // Low stock (use invFiltered)
  const lowStockItems = useMemo(() => {
    return invFiltered.filter((s: any) => s.current_stock <= s.min_level)
      .map((s: any) => ({ name: s.name.substring(0, 20), current: s.current_stock, min: s.min_level }))
      .slice(0, 10);
  }, [invFiltered]);

  // Export helpers
  const exportWOs = useCallback((wos: any[]) => {
    if (wos.length === 0) { toast.error("No work orders to export"); return; }
    downloadCSV(
      `work_orders_${format(new Date(), "yyyyMMdd")}.csv`,
      ["WO Number", "Category", "Type", "Priority", "Status", "Asset", "Department", "Problem", "Root Cause", "Action Taken", "Downtime (min)", "Labor Minutes", "Actual Cost", "Created", "Closed"],
      wos.map((wo: any) => [
        wo.wo_number, wo.category, wo.wo_type || "", wo.priority, wo.status,
        esc(wo.assets?.name), esc(wo.assets?.departments?.name),
        esc(wo.problem_description), esc(wo.root_cause), esc(wo.action_taken),
        wo.downtime_minutes || 0, hoursToMinutes(wo.labor_hours), wo.actual_cost || 0,
        wo.created_at ? format(parseISO(wo.created_at), "yyyy-MM-dd HH:mm") : "",
        wo.closed_at ? format(parseISO(wo.closed_at), "yyyy-MM-dd HH:mm") : "",
      ].map(String))
    );
  }, []);

  const isLoading = woLoading;

  const handleAdvancedExport = useCallback(async (formatType: "csv" | "excel" | "pdf") => {
    setAdvancedExportBusy(formatType);
    try {
      await downloadAdvancedReliabilityReport(formatType, { startDate, endDate, page: 1, limit: 500 });
      toast.success(`Advanced ${formatType.toUpperCase()} report exported`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export advanced report";
      toast.error(message);
    } finally {
      setAdvancedExportBusy(null);
    }
  }, [startDate, endDate]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Comprehensive insights — MTTR, MTBF, safety, inventory & more</p>
        </div>
        <SelectField label="" value={dateRange} onChange={setDateRange} options={[
          { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" }, { value: "365", label: "Last year" },
        ]} className="w-[150px]" />
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Global KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <KPICard title="Total WOs" value={kpis.totalWO} subtitle="work orders" icon={Wrench} variant="primary" />
            <KPICard title="Open WOs" value={kpis.openWO} subtitle="in progress" icon={Activity} variant="warning" />
            <KPICard title="Avg Downtime" value={`${kpis.avgDowntime}m`} subtitle="per WO" icon={Clock} variant="info" />
            <KPICard title="PM Compliance" value={`${kpis.pmCompliance}%`} subtitle="on schedule" icon={Calendar} variant={kpis.pmCompliance >= 80 ? "success" : "warning"} />
            <KPICard title="Safety Events" value={kpis.totalIncidents} subtitle={`${kpis.openIncidents} open`} icon={ShieldAlert} variant="destructive" />
            <KPICard title="Maint. Cost" value={`₹${Math.round(kpis.totalCost / 1000)}K`} subtitle="actual" icon={TrendingUp} variant="info" />
          </div>

          <Tabs defaultValue="mttr_analysis" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="mttr_analysis">MTTR / MTBF</TabsTrigger>
              <TabsTrigger value="work_orders">Work Orders</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="safety">Safety</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="downtime">Downtime</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            {/* MTTR / MTBF Tab */}
            <TabsContent value="mttr_analysis">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Departments", options: deptNames, selected: selectedDepts, onChange: setSelectedDepts, icon: BarChart3 },
                    { label: "Categories", options: categoryOptions, selected: selectedCategories, onChange: setSelectedCategories, icon: Wrench, labels: categoryLabelMap },
                  ]}
                  onReset={() => { setSelectedDepts([]); setSelectedCategories([]); }}
                />
                <p className="text-xs text-muted-foreground">Showing {filteredWOs.length} of {workOrders.length} work orders</p>

                {advancedReliability?.summary && (
                  <Card className="shadow-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" /> Advanced Reliability (Server-side)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <KPICard title="MTTR" value={`${hoursToMinutes(advancedReliability.summary.mttrHours)} min`} subtitle="mean repair" icon={Timer} variant="info" />
                        <KPICard title="MTBF" value={`${hoursToMinutes(advancedReliability.summary.mtbfHours)} min`} subtitle="between failures" icon={TrendingUp} variant="success" />
                        <KPICard title="Availability" value={`${advancedReliability.summary.availabilityPercent}%`} subtitle="operational" icon={Gauge} variant="primary" />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={advancedExportBusy !== null}
                          onClick={() => handleAdvancedExport("csv")}
                          className="gap-2"
                        >
                          {advancedExportBusy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} CSV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={advancedExportBusy !== null}
                          onClick={() => handleAdvancedExport("excel")}
                          className="gap-2"
                        >
                          {advancedExportBusy === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Excel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={advancedExportBusy !== null}
                          onClick={() => handleAdvancedExport("pdf")}
                          className="gap-2"
                        >
                          {advancedExportBusy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="shadow-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Timer className="h-4 w-4 text-primary" /> MTTR (min)</CardTitle>
                      <p className="text-xs text-muted-foreground">Mean Time To Repair</p>
                    </CardHeader>
                    <CardContent>
                      {mttrData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={mttrData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" className="text-xs" angle={-30} textAnchor="end" height={70} />
                            <YAxis className="text-xs" />
                            <Tooltip formatter={(v: any) => [`${v} min`, "MTTR"]} />
                            <Bar dataKey="mttr" fill="hsl(var(--primary))" name="MTTR (min)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-muted-foreground text-center py-10">No closed WO data with timestamps</p>}
                    </CardContent>
                  </Card>

                  <Card className="shadow-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-chart-2" /> MTBF (min)</CardTitle>
                      <p className="text-xs text-muted-foreground">Mean Time Between Failures</p>
                    </CardHeader>
                    <CardContent>
                      {mtbfData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={mtbfData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" className="text-xs" angle={-30} textAnchor="end" height={70} />
                            <YAxis className="text-xs" />
                            <Tooltip formatter={(v: any) => [`${v} min`, "MTBF"]} />
                            <Bar dataKey="mtbf" fill="hsl(var(--chart-2))" name="MTBF (min)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-muted-foreground text-center py-10">Need 2+ WOs per asset for MTBF</p>}
                    </CardContent>
                  </Card>
                </div>

                {mttrData.length > 0 && (
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">MTTR vs MTBF Comparison</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={mttrData.map((m) => ({
                          name: m.name, mttr: m.mttr,
                          mtbf: mtbfData.find(b => b.name === m.name)?.mtbf || 0, count: m.count,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" />
                          <YAxis className="text-xs" label={{ value: "Minutes", angle: -90, position: "insideLeft" }} />
                          <Tooltip /><Legend />
                          <Bar dataKey="mttr" fill="hsl(var(--primary))" name="MTTR (min)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="mtbf" fill="hsl(var(--chart-2))" name="MTBF (min)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Work Orders Tab */}
            <TabsContent value="work_orders">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Status", options: statusOptions, selected: woStatuses, onChange: setWoStatuses },
                    { label: "Type", options: typeOptions, selected: woTypes, onChange: setWoTypes, labels: typeLabelMap },
                    { label: "Priority", options: priorityOptions, selected: woPriorities, onChange: setWoPriorities },
                    { label: "Department", options: deptNames, selected: woDepts, onChange: setWoDepts, icon: BarChart3 },
                    { label: "Category", options: categoryOptions, selected: woCats, onChange: setWoCats, icon: Wrench, labels: categoryLabelMap },
                  ]}
                  onReset={() => { setWoStatuses([]); setWoTypes([]); setWoPriorities([]); setWoDepts([]); setWoCats([]); }}
                />
                <p className="text-xs text-muted-foreground">Showing {woFiltered.length} of {workOrders.length} work orders</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">WO Trend</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={woTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" className="text-xs" /><YAxis className="text-xs" />
                          <Tooltip />
                          <Area type="monotone" dataKey="count" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.2} name="Work Orders" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">By Category</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={woCategoryChart} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }: any) => `${name}: ${value}`}>
                            {woCategoryChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip /><Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={woStatusChart}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" /><YAxis className="text-xs" />
                          <Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" name="Count" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">By Type</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={woTypeChart}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                          <YAxis className="text-xs" /><Tooltip />
                          <Bar dataKey="value" fill="hsl(var(--chart-2))" name="Count" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card md:col-span-2">
                    <CardHeader><CardTitle className="text-base">By Priority</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={woPriorityChart} cx="50%" cy="50%" outerRadius={90} dataKey="value" label>
                            {woPriorityChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip /><Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Maintenance Tab */}
            <TabsContent value="maintenance">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "PM Status", options: pmStatusOptions, selected: pmStatuses, onChange: setPmStatuses },
                    { label: "PM Frequency", options: pmFreqOptions, selected: pmFreqs, onChange: setPmFreqs },
                    { label: "Cal. Status", options: calStatusOptions, selected: calStatuses, onChange: setCalStatuses },
                    { label: "AMC Status", options: amcStatusOptions, selected: amcStatuses, onChange: setAmcStatuses },
                  ]}
                  onReset={() => { setPmStatuses([]); setPmFreqs([]); setCalStatuses([]); setAmcStatuses([]); }}
                />
                <p className="text-xs text-muted-foreground">
                  PM: {pmFiltered.length}/{pmSchedules.length} · Calibration: {calFiltered.length}/{calibrations.length} · AMC: {amcFiltered.length}/{amcContracts.length}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">PM Status Distribution</CardTitle></CardHeader>
                    <CardContent>
                      {(() => {
                        const s: Record<string, number> = {};
                        pmFiltered.forEach((p: any) => { s[p.status] = (s[p.status] || 0) + 1; });
                        const data = Object.entries(s).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
                        return data.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                          </ResponsiveContainer>
                        ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No PM data</div>;
                      })()}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Calibration Status</CardTitle></CardHeader>
                    <CardContent>
                      {(() => {
                        const s: Record<string, number> = {};
                        calFiltered.forEach((c: any) => { s[c.status] = (s[c.status] || 0) + 1; });
                        const data = Object.entries(s).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
                        return data.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="name" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Bar dataKey="value" fill="hsl(var(--chart-3))" name="Count" radius={[4, 4, 0, 0]} /></BarChart>
                          </ResponsiveContainer>
                        ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No calibration data</div>;
                      })()}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card md:col-span-2">
                    <CardHeader><CardTitle className="text-base">AMC Contract Status</CardTitle></CardHeader>
                    <CardContent>
                      {amcFiltered.length > 0 ? (
                        <div className="space-y-3">
                          {amcFiltered.slice(0, 10).map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                              <div>
                                <p className="font-medium text-sm">{c.contract_number}</p>
                                <p className="text-xs text-muted-foreground">{c.assets?.name} • {c.vendors?.name}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-sm">{c.amount ? `₹${Math.round(c.amount / 1000)}K` : "—"}</p>
                                <p className={`text-xs ${c.status === "ACTIVE" ? "text-green-600" : c.status === "EXPIRED" ? "text-destructive" : "text-amber-600"}`}>{c.status?.replace(/_/g, " ")}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="flex justify-center items-center h-[200px] text-muted-foreground text-sm">No AMC data</div>}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Safety Tab */}
            <TabsContent value="safety">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Incident Type", options: safetyTypeOptions, selected: safetyTypes, onChange: setSafetyTypes },
                    { label: "Severity", options: safetySevOptions, selected: safetySeverities, onChange: setSafetySeverities },
                    { label: "Status", options: safetyStatusOptions, selected: safetyStatuses, onChange: setSafetyStatuses },
                  ]}
                  onReset={() => { setSafetyTypes([]); setSafetySeverities([]); setSafetyStatuses([]); }}
                />
                <p className="text-xs text-muted-foreground">Showing {safetyFiltered.length} of {safetyIncidents.length} incidents</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KPICard title="Total Incidents" value={safetyKpis.total} subtitle="reported" icon={ShieldAlert} variant="primary" />
                  <KPICard title="Open" value={safetyKpis.open} subtitle={`${safetyKpis.investigating} investigating`} icon={AlertTriangle} variant="warning" />
                  <KPICard title="Lost Time" value={`${safetyKpis.lostTime} min`} subtitle={`${safetyKpis.peopleAffected} people`} icon={Clock} variant="destructive" />
                  <KPICard title="High Severity" value={safetyKpis.highSev} subtitle={`${safetyKpis.nearMiss} near miss`} icon={ShieldAlert} variant={safetyKpis.highSev > 0 ? "destructive" : "success"} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Incidents by Type</CardTitle></CardHeader>
                    <CardContent>
                      {safetyChart.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={safetyChart}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} /><YAxis className="text-xs" /><Tooltip /><Bar dataKey="value" fill="hsl(var(--chart-4))" name="Count" radius={[4, 4, 0, 0]} /></BarChart>
                        </ResponsiveContainer>
                      ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No incidents</div>}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">By Severity</CardTitle></CardHeader>
                    <CardContent>
                      {safetySeverityChart.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart><Pie data={safetySeverityChart} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>{safetySeverityChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                        </ResponsiveContainer>
                      ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No data</div>}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Incident Status</CardTitle></CardHeader>
                    <CardContent>
                      {safetyStatusChart.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={safetyStatusChart}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="name" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Bar dataKey="value" fill="hsl(var(--chart-5))" name="Count" radius={[4, 4, 0, 0]} /></BarChart>
                        </ResponsiveContainer>
                      ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No data</div>}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Incident Trend</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={safetyTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" className="text-xs" /><YAxis className="text-xs" />
                          <Tooltip />
                          <Area type="monotone" dataKey="count" fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" fillOpacity={0.2} name="Incidents" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Inventory Tab */}
            <TabsContent value="inventory">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Category", options: invCategoryOptions, selected: invCategories, onChange: setInvCategories },
                    { label: "Stock Status", options: stockStatusLabels, selected: invStockStatus, onChange: setInvStockStatus },
                    { label: "Request Status", options: srStatusOptions, selected: srStatuses, onChange: setSrStatuses },
                  ]}
                  onReset={() => { setInvCategories([]); setInvStockStatus([]); setSrStatuses([]); }}
                />
                <p className="text-xs text-muted-foreground">
                  Items: {invFiltered.length}/{spareItems.length} · Requests: {srFiltered.length}/{stockRequests.length}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KPICard title="Total Items" value={invFiltered.length} subtitle="filtered" icon={Package} variant="primary" />
                  <KPICard title="Below Min" value={invFiltered.filter((s: any) => s.current_stock <= s.min_level).length} subtitle="critical" icon={AlertTriangle} variant="destructive" />
                  <KPICard title="Reorder Needed" value={invFiltered.filter((s: any) => s.current_stock <= s.reorder_level && s.current_stock > s.min_level).length} subtitle="items" icon={TrendingUp} variant="warning" />
                  <KPICard title="Adequate" value={invFiltered.filter((s: any) => s.current_stock > s.reorder_level).length} subtitle="OK" icon={Activity} variant="success" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Low Stock Alerts</CardTitle></CardHeader>
                    <CardContent>
                      {lowStockItems.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={lowStockItems} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" />
                            <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                            <Tooltip /><Legend />
                            <Bar dataKey="current" fill="hsl(var(--destructive))" name="Current" />
                            <Bar dataKey="min" fill="hsl(var(--muted-foreground))" name="Min Level" opacity={0.5} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">All stock levels OK</div>}
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardHeader><CardTitle className="text-base">Stock Requests by Status</CardTitle></CardHeader>
                    <CardContent>
                      {(() => {
                        const d: Record<string, number> = {};
                        srFiltered.forEach((r: any) => { d[r.status] = (d[r.status] || 0) + 1; });
                        const data = Object.entries(d).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
                        return data.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart><Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                          </ResponsiveContainer>
                        ) : <div className="flex justify-center items-center h-[300px] text-muted-foreground text-sm">No stock requests</div>;
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Downtime Tab */}
            <TabsContent value="downtime">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Department", options: deptNames, selected: dtDepts, onChange: setDtDepts, icon: BarChart3 },
                    { label: "Category", options: categoryOptions, selected: dtCats, onChange: setDtCats, icon: Wrench, labels: categoryLabelMap },
                    { label: "Priority", options: priorityOptions, selected: dtPriorities, onChange: setDtPriorities },
                  ]}
                  onReset={() => { setDtDepts([]); setDtCats([]); setDtPriorities([]); }}
                />
                <p className="text-xs text-muted-foreground">Showing {dtFiltered.length} of {workOrders.length} work orders</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <KPICard title="Total Downtime" value={`${Math.round(dtFiltered.reduce((s: number, w: any) => s + (w.downtime_minutes || 0), 0))}m`} subtitle="all assets" icon={Clock} variant="destructive" />
                  <KPICard title="Avg per WO" value={`${Math.round(dtFiltered.filter((w: any) => w.downtime_minutes > 0).reduce((s: number, w: any) => s + w.downtime_minutes, 0) / Math.max(dtFiltered.filter((w: any) => w.downtime_minutes > 0).length, 1))}m`} subtitle="downtime" icon={Timer} variant="warning" />
                  <KPICard title="Assets Affected" value={new Set(dtFiltered.filter((w: any) => w.downtime_minutes > 0).map((w: any) => w.asset_id)).size} subtitle="with downtime" icon={Gauge} variant="info" />
                </div>
                <Card className="shadow-card">
                  <CardHeader><CardTitle className="text-base">Top 10 Assets by Downtime (minutes)</CardTitle></CardHeader>
                  <CardContent>
                    {downtimeByAsset.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={downtimeByAsset}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={100} />
                          <YAxis className="text-xs" /><Tooltip />
                          <Bar dataKey="downtime" fill="hsl(var(--destructive))" name="Downtime (min)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="flex justify-center items-center h-[350px] text-muted-foreground text-sm">No downtime data</div>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Export Tab */}
            <TabsContent value="export">
              <div className="space-y-4">
                <FilterBar
                  filters={[
                    { label: "Status", options: statusOptions, selected: expStatuses, onChange: setExpStatuses },
                    { label: "Type", options: typeOptions, selected: expTypes, onChange: setExpTypes, labels: typeLabelMap },
                    { label: "Priority", options: priorityOptions, selected: expPriorities, onChange: setExpPriorities },
                    { label: "Category", options: categoryOptions, selected: expCats, onChange: setExpCats, icon: Wrench, labels: categoryLabelMap },
                    { label: "Department", options: deptNames, selected: expDepts, onChange: setExpDepts, icon: BarChart3 },
                  ]}
                  onReset={() => { setExpStatuses([]); setExpTypes([]); setExpPriorities([]); setExpCats([]); setExpDepts([]); }}
                />
                <p className="text-xs text-muted-foreground">WO export will include {expFiltered.length} of {workOrders.length} work orders</p>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Export Work Orders (Filtered)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      <Button variant="outline" className="justify-start gap-2" onClick={() => exportWOs(expFiltered)}>
                        <FileText className="h-4 w-4" /> Export Filtered WOs
                        <Badge variant="secondary" className="ml-auto text-[10px]">{expFiltered.length}</Badge>
                      </Button>
                      {categoryOptions.map(cat => {
                        const count = expFiltered.filter((w: any) => w.category === cat).length;
                        return (
                          <Button key={cat} variant="outline" className="justify-start gap-2 text-xs" onClick={() => exportWOs(expFiltered.filter((w: any) => w.category === cat))}>
                            <Download className="h-3.5 w-3.5" /> {categoryLabelMap[cat] || cat.replace(/_/g, " ")}
                            <Badge variant="secondary" className="ml-auto text-[10px]">{count}</Badge>
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Quick Reports</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`safety_report_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Incident#", "Type", "Severity", "Status", "Date", "Description", "Location", "Lost Time (min)", "People"],
                          safetyFiltered.map((i: any) => [
                            i.incident_number, i.incident_type, i.severity, i.status,
                            i.incident_date ? format(parseISO(i.incident_date), "yyyy-MM-dd") : "",
                            esc(i.description), esc(i.location), hoursToMinutes(i.lost_time_hours), i.people_involved || 0,
                          ].map(String))
                        );
                      }}>
                        <ShieldAlert className="h-4 w-4" /> Safety Incidents
                        <Badge variant="secondary" className="ml-auto text-[10px]">{safetyFiltered.length}</Badge>
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`pm_report_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Asset", "Frequency", "Status", "Next Due", "Last Completed"],
                          pmFiltered.map((p: any) => [
                            esc(p.assets?.name), p.frequency, p.status,
                            p.next_due ? format(parseISO(p.next_due), "yyyy-MM-dd") : "",
                            p.last_completed ? format(parseISO(p.last_completed), "yyyy-MM-dd") : "",
                          ].map(String))
                        );
                      }}>
                        <Calendar className="h-4 w-4" /> PM Schedules
                        <Badge variant="secondary" className="ml-auto text-[10px]">{pmFiltered.length}</Badge>
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`calibration_report_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Asset", "Status", "Cal Date", "Next Due", "Certificate#"],
                          calFiltered.map((c: any) => [
                            esc(c.assets?.name), c.status, c.calibration_date || "", c.next_due_date || "", c.certificate_number || "",
                          ].map(String))
                        );
                      }}>
                        <Gauge className="h-4 w-4" /> Calibration
                        <Badge variant="secondary" className="ml-auto text-[10px]">{calFiltered.length}</Badge>
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`inventory_report_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Code", "Name", "Category", "Current Stock", "Min Level", "Reorder Level", "Unit", "Location"],
                          invFiltered.map((s: any) => [
                            s.code, esc(s.name), s.category || "", s.current_stock, s.min_level, s.reorder_level, s.unit, esc(s.location),
                          ].map(String))
                        );
                      }}>
                        <Package className="h-4 w-4" /> Inventory
                        <Badge variant="secondary" className="ml-auto text-[10px]">{invFiltered.length}</Badge>
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`amc_report_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Contract#", "Asset", "Vendor", "Start", "End", "Amount", "Status"],
                          amcFiltered.map((c: any) => [
                            c.contract_number, esc(c.assets?.name), esc(c.vendors?.name),
                            c.start_date, c.end_date, c.amount || 0, c.status,
                          ].map(String))
                        );
                      }}>
                        <FileText className="h-4 w-4" /> AMC Contracts
                        <Badge variant="secondary" className="ml-auto text-[10px]">{amcFiltered.length}</Badge>
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => {
                        downloadCSV(`stock_requests_${format(new Date(), "yyyyMMdd")}.csv`,
                          ["Item", "Code", "Quantity", "Status", "Remarks", "Created"],
                          srFiltered.map((r: any) => [
                            esc(r.spare_items?.name), r.spare_items?.code || "", r.quantity, r.status,
                            esc(r.remarks), r.created_at ? format(parseISO(r.created_at), "yyyy-MM-dd") : "",
                          ].map(String))
                        );
                      }}>
                        <Package className="h-4 w-4" /> Stock Requests
                        <Badge variant="secondary" className="ml-auto text-[10px]">{srFiltered.length}</Badge>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
