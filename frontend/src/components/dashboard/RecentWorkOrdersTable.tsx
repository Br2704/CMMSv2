import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listWorkOrderMasters } from "@/api/workOrderMasters";
import { humanizeWorkOrderCode, normalizeWorkOrderCode } from "@/config/work-order-masters";
import { cn } from "@/lib/utils";

interface RecentWOsProps {
  workOrders: any[];
  isLoading: boolean;
}

export function RecentWorkOrdersTable({ workOrders, isLoading }: RecentWOsProps) {
  const navigate = useNavigate();
  const { data: workOrderMasters = [] } = useQuery({
    queryKey: ["recent_work_order_masters"],
    queryFn: async () => {
      const response = await listWorkOrderMasters({ page: 1, limit: 2000, includeInactive: false });
      return response.data || [];
    },
  });

  const categoryLabels = useMemo(() => {
    const map = new Map<string, string>();
    workOrderMasters
      .filter((item) => item.optionType === "CATEGORY" && item.isActive)
      .forEach((item) => {
        const normalizedCode = normalizeWorkOrderCode(item.code);
        map.set(`${item.plantId || ""}:${normalizedCode}`, item.label);
        if (!map.has(`*:${normalizedCode}`)) {
          map.set(`*:${normalizedCode}`, item.label);
        }
      });
    return map;
  }, [workOrderMasters]);

  const resolveCategoryLabel = (code: string | null | undefined, plantId?: string | null) => {
    if (!code) return "-";
    const normalizedCode = normalizeWorkOrderCode(code);
    return (
      categoryLabels.get(`${plantId || ""}:${normalizedCode}`) ||
      categoryLabels.get(`*:${normalizedCode}`) ||
      humanizeWorkOrderCode(normalizedCode)
    );
  };

  return (
    <div>
      <Card className="rounded-[2.5rem] border-none shadow-industrial overflow-hidden bg-white/40 backdrop-blur-xl">
        <CardHeader className="p-8 border-b border-white/20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900">Recent Work Orders</CardTitle>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Live Maintenance Feed</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate("/work-orders")}
            className="h-12 px-6 rounded-2xl border-slate-200 bg-white/80 hover:bg-white font-bold"
          >
            Open Command Center
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-8 py-6">WO ID</th>
                    <th className="px-6 py-6">Asset Detail</th>
                    <th className="px-6 py-6">Classification</th>
                    <th className="px-6 py-6">Status & Priority</th>
                    <th className="px-8 py-6 text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workOrders.map((wo: any) => (
                    <tr 
                      key={wo.id} 
                      className="group cursor-pointer hover:bg-white/60 transition-colors"
                      onClick={() => navigate("/work-orders")}
                    >
                      <td className="px-8 py-6">
                        <span className="text-base font-black text-primary underline-offset-4 decoration-2">
                          #{wo.wo_number}
                        </span>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 text-slate-900">{wo.assets?.name || "System Generic"}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{wo.assets?.code || "N/A"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                         <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100/50 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200/30">
                           {resolveCategoryLabel(wo.category, wo.plant_id)}
                         </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-3">
                          <StatusBadge
                            status={wo.status}
                            variant={
                              wo.status === "CLOSED" ? "success" :
                              wo.status === "IN_PROGRESS" ? "info" :
                              ["USER_VERIFICATION", "APPROVAL_PENDING", "REJECTED"].includes(wo.status) ? "critical" : "warning"
                            }
                            className="text-[10px] font-black tracking-widest uppercase"
                            showDot={false}
                          />
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            wo.priority === "CRITICAL" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" :
                            wo.priority === "HIGH" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" :
                            "bg-emerald-500"
                          )} />
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-slate-700">
                            {formatDistanceToNow(new Date(wo.created_at), { addSuffix: false })}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Elapsed</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {workOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No recent work orders found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
