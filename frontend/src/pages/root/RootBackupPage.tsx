import { useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, HardDriveDownload, HardDriveUpload, Activity, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BackupOverview } from "./backup/components/BackupOverview";
import { CreateBackupWizard } from "./backup/components/CreateBackupWizard";
import { RestoreWizard } from "./backup/components/RestoreWizard";

export default function RootBackupPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  return (
    <PageShell>
      <PageHeader
        title="Enterprise Backup & Disaster Recovery"
        subtitle="Manage secure encrypted backups, retention policies, and system restoration."
      >
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
      </PageHeader>

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
    </PageShell>
  );
}
