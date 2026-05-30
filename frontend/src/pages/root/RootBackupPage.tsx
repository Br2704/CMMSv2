import { useState, useEffect } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, HardDriveDownload, HardDriveUpload, Activity, Wrench, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/FormDialog";
import { BackupOverview } from "./backup/components/BackupOverview";
import { CreateBackupWizard } from "./backup/components/CreateBackupWizard";
import { RestoreWizard } from "./backup/components/RestoreWizard";
import { listOrganizations, type Organization } from "@/api/organizations";
import { listPlants, type Plant } from "@/api/plants";
import { deleteAllData, getDeleteJobStatus, type DeleteJobStatusResponse } from "@/api/backup";
import { toast } from "sonner";

export default function RootBackupPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("ALL");
  const [selectedPlant, setSelectedPlant] = useState<string>("ALL");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteJob, setDeleteJob] = useState<DeleteJobStatusResponse | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const resp = await listOrganizations({ page: 1, limit: 500 });
        setOrganizations(resp.data || []);
      } catch (err) {
        // ignore — keep list empty
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const params: any = { page: 1, limit: 500 };
        if (selectedOrg && selectedOrg !== "ALL") params.organizationId = selectedOrg;
        const resp = await listPlants(params);
        setPlants(resp.data || []);
      } catch (err) {
        // ignore
      }
    })();
  }, [selectedOrg]);

  useEffect(() => {
    if (!deleteJobId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await getDeleteJobStatus(deleteJobId);
        if (!cancelled && response.success && response.data) {
          setDeleteJob(response.data);
          if (["completed", "failed", "canceled"].includes(response.data.state)) {
            setDeleteJobId(null);
          }
        }
      } catch {
        // keep polling until the job resolves or the user closes the dialog
      }
    };

    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deleteJobId]);

  const scopeLabel = () => {
    if (selectedPlant && selectedPlant !== "ALL") {
      const p = plants.find((x) => x.id === selectedPlant);
      return p ? `Plant (${p.plantCode || p.plantName})` : `Plant (${selectedPlant})`;
    }

    if (selectedOrg && selectedOrg !== "ALL") {
      const o = organizations.find((x) => x.id === selectedOrg);
      return o ? `Organization (${o.name})` : `Organization (${selectedOrg})`;
    }

    return "All";
  };

  return (
    <PageShell>
      <PageHeader
        title="Enterprise Backup & Disaster Recovery"
        subtitle="Manage secure encrypted backups, retention policies, and system restoration."
        actions={
          <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-2 rounded-md border border-destructive/20">
            <Wrench className="h-4 w-4" />
            <Label htmlFor="maintenance-mode" className="font-medium cursor-pointer">Global Maintenance Mode</Label>
            <Switch
              id="maintenance-mode"
              checked={maintenanceMode}
              onCheckedChange={setMaintenanceMode}
              className="data-[state=checked]:bg-destructive ml-2"
            />
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="flex items-center space-x-2">
          <Label className="min-w-[110px]">Organization</Label>
          <Select value={selectedOrg} onValueChange={(v) => { setSelectedOrg(v); setSelectedPlant("ALL"); }}>
            <SelectTrigger className="min-w-[220px]"><SelectValue placeholder="All Organizations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Organizations</SelectItem>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Label className="min-w-[110px]">Plant</Label>
          <Select value={selectedPlant} onValueChange={(v) => setSelectedPlant(v)}>
            <SelectTrigger className="min-w-[220px]"><SelectValue placeholder="All Plants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Plants</SelectItem>
              {plants.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.plantCode || p.plantName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end md:justify-start">
          <button
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete All Data
          </button>
        </div>
      </div>

      {deleteJob && (
        <div className="mt-4 rounded-md border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Delete job status</div>
              <div className="text-xs text-muted-foreground">Job {deleteJob.jobId} is {deleteJob.state}.</div>
            </div>
            <div className="text-sm font-medium">{Math.round(deleteJob.progress ?? 0)}%</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
            <div className="h-2 bg-destructive" style={{ width: `${Math.max(0, Math.min(100, deleteJob.progress ?? 0))}%` }} />
          </div>
          {deleteJob.failedReason ? <div className="mt-2 text-xs text-destructive">{deleteJob.failedReason}</div> : null}
        </div>
      )}

      {maintenanceMode && (
        <div className="mt-4 p-4 bg-destructive text-destructive-foreground rounded-md flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <Shield className="h-5 w-5 mt-0.5" />
          <div>
            <h4 className="font-semibold">Maintenance Mode Active</h4>
            <p className="text-sm opacity-90">All non-root users are currently blocked from logging in or using the system. APIs will return 503 Service Unavailable. Ensure you disable this after restoring.</p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 mt-6">
        <TabsList className="bg-background border h-12 items-center justify-start p-1 w-fit">
          <TabsTrigger value="overview" className="gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Activity className="h-4 w-4" />
            Overview & History
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <HardDriveDownload className="h-4 w-4" />
            Create Backup
          </TabsTrigger>
          <TabsTrigger value="restore" className="gap-2 h-10 px-4 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive">
            <HardDriveUpload className="h-4 w-4" />
            Restore Center
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="outline-none">
          <BackupOverview onNavigateCreate={() => setActiveTab("create")} onNavigateRestore={() => setActiveTab("restore")} />
        </TabsContent>

        <TabsContent value="create" className="outline-none">
          <CreateBackupWizard onComplete={() => setActiveTab("overview")} />
        </TabsContent>

        <TabsContent value="restore" className="outline-none">
          <RestoreWizard />
        </TabsContent>
      </Tabs>

      <FormDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Confirm Delete All Data" description="Type DELETE and press Confirm to permanently remove data for the selected scope. This action is irreversible." onSubmit={async () => {
        if (confirmInput !== "DELETE") return;
        setIsDeleting(true);
        try {
          const scope = selectedPlant ? "PLANT" : selectedOrg ? "ORGANIZATION" : "ALL";
          const res = await deleteAllData(scope as any, { organizationId: selectedOrg || undefined, plantId: selectedPlant || undefined });
          if (res && (res.success ?? true)) {
            setDeleteJobId(res.data?.jobId ?? null);
            toast.success("Deletion request accepted. Data removal will be processed.");
            setIsDeleteOpen(false);
          } else {
            toast.error("Failed to request deletion.");
          }
        } catch (err) {
          toast.error("Failed to request deletion.");
        } finally {
          setIsDeleting(false);
          setConfirmInput("");
        }
      }} submitLabel={isDeleting ? "Deleting..." : "Confirm Delete"} isLoading={isDeleting}>
        <div className="space-y-4">
          <p className="text-sm">Selected scope: <strong>{scopeLabel()}</strong></p>
          <p className="text-sm text-muted-foreground">To confirm, type "DELETE" (all-caps) below and press Confirm. This will permanently remove data.</p>
          <Input value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} placeholder="Type DELETE to confirm" />
        </div>
      </FormDialog>
    </PageShell>
  );
}
