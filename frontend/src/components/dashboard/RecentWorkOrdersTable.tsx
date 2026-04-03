import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listWorkOrderMasters } from "@/api/workOrderMasters";
import { getFallbackWorkOrderOptions, humanizeWorkOrderCode, normalizeWorkOrderCode } from "@/config/work-order-masters";

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
  const fallbackCategoryLabels = useMemo(() => {
    const map = new Map<string, string>();
    getFallbackWorkOrderOptions("CATEGORY").forEach((item) => {
      map.set(item.value, item.label);
    });
    return map;
  }, []);

  const resolveCategoryLabel = (code: string | null | undefined, plantId?: string | null) => {
    if (!code) return "-";
    const normalizedCode = normalizeWorkOrderCode(code);
    return (
      categoryLabels.get(`${plantId || ""}:${normalizedCode}`) ||
      categoryLabels.get(`*:${normalizedCode}`) ||
      fallbackCategoryLabels.get(normalizedCode) ||
      humanizeWorkOrderCode(normalizedCode)
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }}>
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Recent Work Orders</CardTitle>
            <p className="text-sm text-muted-foreground">Latest maintenance activities for your role</p>
          </div>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => navigate("/work-orders")}>View All</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : workOrders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No work orders found for your role.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO Number</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Raised</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((wo: any) => (
                    <TableRow key={wo.id} className="group cursor-pointer hover:bg-muted/50" onClick={() => navigate("/work-orders")}>
                      <TableCell className="font-medium text-primary">{wo.wo_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{wo.assets?.name || "-"}</p>
                          <p className="text-xs text-muted-foreground">{wo.assets?.code}</p>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-sm">{resolveCategoryLabel(wo.category, wo.plant_id)}</span></TableCell>
                      <TableCell>
                        <StatusBadge variant={wo.priority === "CRITICAL" ? "critical" : wo.priority === "HIGH" ? "warning" : "default"}>
                          {wo.priority}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge variant={
                          wo.status === "CLOSED" ? "completed" :
                          wo.status === "IN_PROGRESS" ? "in_progress" :
                          wo.status === "APPROVAL_PENDING" ? "critical" : "warning"
                        }>
                          {wo.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(wo.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
