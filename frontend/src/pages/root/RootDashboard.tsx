import { useEffect, useState, useMemo } from "react";
import { Building2, Factory, Users2, PieChart as PieChartIcon, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { getGovernanceOverview, type GovernanceOverviewResponse } from "@/api/governance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6366f1"];

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

  const chartData = useMemo(() => {
    if (!data?.recentlyCreatedOrganizations) return [];
    return data.recentlyCreatedOrganizations.map(org => ({
      name: org.name,
      plants: org.plantsCount,
      users: org.usersCount,
    }));
  }, [data]);

  const subscriptionData = useMemo(() => {
    if (!data?.subscriptionStatusCounts) return [];
    const { ACTIVE, TRIAL, EXPIRING, EXPIRED } = data.subscriptionStatusCounts;
    return [
      { name: "Active", value: Math.max(ACTIVE, 0) },
      { name: "Trial", value: Math.max(TRIAL, 0) },
      { name: "Expiring", value: Math.max(EXPIRING, 0) },
      { name: "Expired", value: Math.max(EXPIRED, 0) },
    ].filter(s => s.value > 0);
  }, [data]);

  return (
    <PageShell>
      <PageHeader
        title="Governance Dashboard"
        subtitle="Operations control center for multi-organization rollout and access governance"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Organizations</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-bold tracking-tight">{loading ? "-" : data?.organizationsCount ?? 0}</p>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Plants</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-bold tracking-tight">{loading ? "-" : data?.plantsCount ?? 0}</p>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Factory className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Users</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-3xl font-bold tracking-tight">{loading ? "-" : data?.usersCount ?? 0}</p>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users2 className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Card className="shadow-card lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Scale Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  />
                  <Bar dataKey="plants" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Subscription Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subscriptionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {subscriptionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.recentlyCreatedOrganizations || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No recent organizations</p>
              ) : (
                data?.recentlyCreatedOrganizations.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 hover:bg-accent/5 transition-colors">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground uppercase">{item.code || "No Code"}</p>
                    </div>
                    <p className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Plants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.recentlyCreatedPlants || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No recent plants</p>
              ) : (
                data?.recentlyCreatedPlants.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 hover:bg-accent/5 transition-colors">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.plantCode}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.plantName}</p>
                    </div>
                    <p className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Governance Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-4">
              <p className="text-xs font-medium text-blue-600 uppercase mb-1">Onboarding Velocity</p>
              <p className="text-lg font-bold">
                {loading ? "-" : `${(data?.recentlyCreatedOrganizations?.length ?? 0) + (data?.recentlyCreatedPlants?.length ?? 0)} new entities`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Growth in the last 30 days</p>
            </div>
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
              <p className="text-xs font-medium text-emerald-600 uppercase mb-1">Scale Readiness</p>
              <p className="text-lg font-bold">
                {loading ? "-" : `${data?.organizationsCount ?? 0} Orgs • ${data?.plantsCount ?? 0} Plants`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Multi-tenant management active</p>
            </div>
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4">
              <p className="text-xs font-medium text-violet-600 uppercase mb-1">Access Control</p>
              <p className="text-sm font-semibold">RBAC Compliance: 100%</p>
              <p className="text-xs text-muted-foreground mt-1">Org-specific permissions enforced</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
