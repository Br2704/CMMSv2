import { useEffect, useState } from "react";
import { Building2, Factory, Users2 } from "lucide-react";
import { toast } from "sonner";
import { getGovernanceOverview, type GovernanceOverviewResponse } from "@/api/governance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

export default function RootDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GovernanceOverviewResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await getGovernanceOverview();
        setData(response.data);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load governance overview");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Governance Dashboard"
        subtitle="Operations control center for multi-organization rollout and access governance"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Organizations</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{loading ? "-" : data?.organizationsCount ?? 0}</p>
            <Building2 className="h-6 w-6 text-primary" />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Plants</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{loading ? "-" : data?.plantsCount ?? 0}</p>
            <Factory className="h-6 w-6 text-primary" />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{loading ? "-" : data?.usersCount ?? 0}</p>
            <Users2 className="h-6 w-6 text-primary" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Recent Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {(data?.recentlyCreatedOrganizations || []).length === 0 ? (
                <p className="text-muted-foreground">No recent organizations</p>
              ) : (
                data?.recentlyCreatedOrganizations.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code || "-"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Recent Plants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {(data?.recentlyCreatedPlants || []).length === 0 ? (
                <p className="text-muted-foreground">No recent plants</p>
              ) : (
                data?.recentlyCreatedPlants.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                    <div>
                      <p className="font-medium">{item.plantCode}</p>
                      <p className="text-xs text-muted-foreground">{item.plantName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Governance Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-muted-foreground">Onboarding velocity</p>
              <p className="font-medium">
                {loading ? "-" : `${(data?.recentlyCreatedOrganizations?.length ?? 0) + (data?.recentlyCreatedPlants?.length ?? 0)} new entities (recent)`}
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-muted-foreground">Scale readiness</p>
              <p className="font-medium">
                {loading ? "-" : `${data?.organizationsCount ?? 0} orgs / ${data?.plantsCount ?? 0} plants managed`}
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-muted-foreground">Access governance</p>
              <p className="font-medium">Use Role Access to enforce org-specific permissions.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
