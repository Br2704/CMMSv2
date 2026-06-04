import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWarrantyAlerts, closeWarrantyAlert, WarrantyAlertApi } from "@/api/warranty-alerts";
import { PageShell } from "@/components/layout/PageShell";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldAlert, CheckCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function WarrantyAlerts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [closeTarget, setCloseTarget] = useState<WarrantyAlertApi | null>(null);
  const [remarks, setRemarks] = useState("");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["warranty-alerts"],
    queryFn: getWarrantyAlerts,
  });

  const closeMutation = useMutation({
    mutationFn: (data: { id: string; remarks: string }) => closeWarrantyAlert(data.id, data.remarks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warranty-alerts"] });
      toast.success("Warranty alert closed successfully");
      setCloseTarget(null);
      setRemarks("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to close alert");
    },
  });

  const filteredAlerts = alerts.filter((alert) => {
    const code = alert.machine?.code?.toLowerCase() || "";
    const name = alert.machine?.name?.toLowerCase() || "";
    const q = search.toLowerCase();
    return code.includes(q) || name.includes(q);
  });

  const columns = [
    { key: "machine", header: "Machine", render: (a: WarrantyAlertApi) => (<div><p className="font-semibold">{a.machine?.name || "-"}</p><p className="text-xs text-muted-foreground">{a.machine?.code}</p></div>) },
    { key: "status", header: "Status", render: (a: WarrantyAlertApi) => <StatusBadge variant={a.status === "OPEN" ? "critical" : "default"}>{a.status}</StatusBadge> },
    { key: "created", header: "Alert Date", render: (a: WarrantyAlertApi) => format(new Date(a.createdAt), "dd MMM yyyy HH:mm") },
    { key: "expiry", header: "Warranty Expiry", render: (a: WarrantyAlertApi) => a.machine?.warrantyExpiry ? format(new Date(a.machine.warrantyExpiry), "dd MMM yyyy") : "-" },
    { key: "remarks", header: "Close Remarks", render: (a: WarrantyAlertApi) => <span className="text-xs">{a.remarks || "-"}</span> },
    { key: "closer", header: "Closed By", render: (a: WarrantyAlertApi) => a.closer ? (<div><p className="text-sm">{a.closer.name}</p><p className="text-xs text-muted-foreground">{format(new Date(a.closedAt!), "dd MMM yyyy")}</p></div>) : "-" },
    {
      key: "actions", header: "Actions", className: "text-right", render: (a: WarrantyAlertApi) => a.status === "OPEN" ? (
        <Button variant="outline" size="sm" onClick={() => setCloseTarget(a)}>
          <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
          Close
        </Button>
      ) : null
    }
  ];

  return (
    <PageShell title="Warranty Alerts" description="Manage expiring machine warranties" icon={ShieldAlert}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by machine name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        
        <DataTableShell
          columns={columns}
          data={filteredAlerts}
          isLoading={isLoading}
          emptyMessage="No warranty alerts found."
        />

        <Dialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close Warranty Alert</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Machine: {closeTarget?.machine?.name} ({closeTarget?.machine?.code})</p>
                <p className="text-xs text-muted-foreground">Warranty Expiry: {closeTarget?.machine?.warrantyExpiry ? format(new Date(closeTarget.machine.warrantyExpiry), "dd MMM yyyy") : "Unknown"}</p>
              </div>
              <div className="space-y-2">
                <Label>Remarks / Action Taken <span className="text-destructive">*</span></Label>
                <Textarea 
                  placeholder="Enter remarks about warranty renewal, AMC initiation, or part replacements..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
              <Button 
                onClick={() => closeMutation.mutate({ id: closeTarget!.id, remarks })}
                disabled={!remarks.trim() || closeMutation.isPending}
              >
                {closeMutation.isPending ? "Closing..." : "Close Alert"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageShell>
  );
}
