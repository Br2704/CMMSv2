import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, Plus, Save, Users } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { listPlants } from "@/api/plants";
import { listUsers } from "@/api/users";
import {
  createEsgAuthorizedUser,
  createEsgEmissionFactor,
  createEsgMasterKpi,
  deleteEsgAuthorizedUser,
  getEsgMasterAnalytics,
  listEsgAuthorizedUsers,
  listEsgEmissionFactors,
  listEsgMasterKpis,
  listEsgTargets,
  listEsgWorkbookOrganizationTargets,
  listEsgWorkbookPlantTargets,
  saveEsgTarget,
  saveEsgWorkbookOrganizationTarget,
  saveEsgWorkbookPlantTarget,
  updateEsgEmissionFactor,
  updateEsgMasterKpi,
} from "@/api/esg";
import { ESG_WORKBOOK_METRICS } from "@/config/esg-workbook";
import { useAuthStore } from "@/store/auth.store";
import { isSuperAdmin } from "@/lib/permission-engine";
import { useAccessibleRoutes } from "@/hooks/useAccessibleRoutes";

const categoryOptions = [
  { value: "Energy", label: "Energy" },
  { value: "Water", label: "Water" },
  { value: "Emissions", label: "Emissions" },
  { value: "Waste", label: "Waste" },
  { value: "Renewables", label: "Renewables" },
];

const esgCategoryOptions = [
  { value: "ENERGY", label: "Energy" },
  { value: "WATER", label: "Water" },
  { value: "EMISSIONS", label: "Emissions" },
  { value: "WASTE", label: "Waste" },
  { value: "PRODUCTION", label: "Production" },
  { value: "RENEWABLES", label: "Renewables" },
  { value: "ALL", label: "All Sections" },
];

export default function ESGConfigMaster() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const superAdmin = isSuperAdmin(user?.roles ?? []);
  const [plantId, setPlantId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editingFactorId, setEditingFactorId] = useState<string | null>(null);

  const [kpiForm, setKpiForm] = useState({
    kpiName: "",
    kpiCategory: "Energy",
    formula: "",
    unit: "",
    description: "",
    status: "ACTIVE",
  });
  const [factorForm, setFactorForm] = useState({
    energyType: "",
    unit: "",
    co2Factor: "",
    source: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    isActive: "true",
  });
  const [targetForm, setTargetForm] = useState({
    plantId: "",
    year: String(year),
    targetEnergyReduction: "",
    targetWaterReduction: "",
    targetEmissionReduction: "",
    targetWasteReduction: "",
    renewableTarget: "",
  });
  const [authForm, setAuthForm] = useState({
    plantId: "",
    userId: "",
    esgCategory: "ENERGY",
  });
  const [workbookTargetForm, setWorkbookTargetForm] = useState<{
    scope: string;
    plantId: string;
    metricCode: string;
    targetValue: string;
    notes: string;
  }>({
    scope: "PLANT",
    plantId: "",
    metricCode: ESG_WORKBOOK_METRICS[0].code,
    targetValue: "",
    notes: "",
  });

  const plantsQuery = useQuery({
    queryKey: ["esg_master_plants"],
    queryFn: () => listPlants({ page: 1, limit: 500, includeInactive: true }),
    enabled: superAdmin,
  });
  const selectedPlantId = plantId || targetForm.plantId || authForm.plantId;
  const usersQuery = useQuery({
    queryKey: ["esg_master_users", selectedPlantId],
    queryFn: () => listUsers({ plantId: selectedPlantId || undefined, page: 1, limit: 500 }),
    enabled: superAdmin && Boolean(selectedPlantId),
  });
  const kpisQuery = useQuery({
    queryKey: ["esg_master_kpis"],
    queryFn: () => listEsgMasterKpis({ page: 1, limit: 200 }),
    enabled: superAdmin,
  });
  const factorsQuery = useQuery({
    queryKey: ["esg_master_factors"],
    queryFn: listEsgEmissionFactors,
    enabled: superAdmin,
  });
  const targetsQuery = useQuery({
    queryKey: ["esg_master_targets", plantId, year],
    queryFn: () => listEsgTargets({ plantId: plantId || undefined, year }),
    enabled: superAdmin,
  });
  const authUsersQuery = useQuery({
    queryKey: ["esg_master_auth_users", plantId],
    queryFn: () => listEsgAuthorizedUsers({ plantId: plantId || undefined }),
    enabled: superAdmin,
  });
  const analyticsQuery = useQuery({
    queryKey: ["esg_master_analytics", year, month],
    queryFn: () => getEsgMasterAnalytics({ year, month }),
    enabled: superAdmin,
  });
  const workbookPlantTargetsQuery = useQuery({
    queryKey: ["esg_master_workbook_plant_targets", plantId, year],
    queryFn: () => listEsgWorkbookPlantTargets({ plantId: plantId || undefined, year }),
    enabled: superAdmin,
  });
  const workbookOrgTargetsQuery = useQuery({
    queryKey: ["esg_master_workbook_org_targets", user?.organizationId, year],
    queryFn: () => listEsgWorkbookOrganizationTargets({ organizationId: user?.organizationId || undefined, year }),
    enabled: superAdmin && Boolean(user?.organizationId),
  });

  const plantOptions = (plantsQuery.data?.data || []).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` }));
  const userOptions = (usersQuery.data?.data || []).map((profile) => ({ value: profile.userId, label: `${profile.fullName} - ${profile.email}` }));
  const workbookMetricOptions = ESG_WORKBOOK_METRICS.map((metric) => ({ value: metric.code, label: `${metric.label} (${metric.unit})` }));

  const saveKpi = async () => {
    try {
      if (editingKpiId) {
        await updateEsgMasterKpi(editingKpiId, { ...kpiForm });
      } else {
        await createEsgMasterKpi({ ...kpiForm });
      }
      toast.success("ESG KPI saved");
      setEditingKpiId(null);
      setKpiForm({ kpiName: "", kpiCategory: "Energy", formula: "", unit: "", description: "", status: "ACTIVE" });
      await queryClient.invalidateQueries({ queryKey: ["esg_master_kpis"] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save KPI");
    }
  };

  const saveFactor = async () => {
    try {
      const payload = { ...factorForm, co2Factor: Number(factorForm.co2Factor), isActive: factorForm.isActive === "true" };
      if (editingFactorId) {
        await updateEsgEmissionFactor(editingFactorId, payload);
      } else {
        await createEsgEmissionFactor(payload);
      }
      toast.success("Emission factor saved");
      setEditingFactorId(null);
      setFactorForm({ energyType: "", unit: "", co2Factor: "", source: "", effectiveDate: new Date().toISOString().slice(0, 10), isActive: "true" });
      await queryClient.invalidateQueries({ queryKey: ["esg_master_factors"] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save emission factor");
    }
  };

  const saveTarget = async () => {
    try {
      await saveEsgTarget({
        plantId: targetForm.plantId,
        year: Number(targetForm.year),
        targetEnergyReduction: Number(targetForm.targetEnergyReduction || 0),
        targetWaterReduction: Number(targetForm.targetWaterReduction || 0),
        targetEmissionReduction: Number(targetForm.targetEmissionReduction || 0),
        targetWasteReduction: Number(targetForm.targetWasteReduction || 0),
        renewableTarget: Number(targetForm.renewableTarget || 0),
      });
      toast.success("Plant ESG target saved");
      await queryClient.invalidateQueries({ queryKey: ["esg_master_targets", plantId, year] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save ESG target");
    }
  };

  const saveAuthorizedUser = async () => {
    try {
      await createEsgAuthorizedUser(authForm);
      toast.success("Authorized ESG user saved");
      await queryClient.invalidateQueries({ queryKey: ["esg_master_auth_users", plantId] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save authorized user");
    }
  };

  const saveWorkbookTarget = async () => {
    try {
      if (workbookTargetForm.scope === "PLANT") {
        await saveEsgWorkbookPlantTarget({
          plantId: workbookTargetForm.plantId,
          year,
          metricCode: workbookTargetForm.metricCode,
          targetValue: Number(workbookTargetForm.targetValue || 0),
          notes: workbookTargetForm.notes || null,
        });
        await queryClient.invalidateQueries({ queryKey: ["esg_master_workbook_plant_targets", plantId, year] });
      } else {
        await saveEsgWorkbookOrganizationTarget({
          organizationId: user?.organizationId || undefined,
          year,
          metricCode: workbookTargetForm.metricCode,
          targetValue: Number(workbookTargetForm.targetValue || 0),
          notes: workbookTargetForm.notes || null,
        });
        await queryClient.invalidateQueries({ queryKey: ["esg_master_workbook_org_targets", user?.organizationId, year] });
      }
      toast.success("Workbook ESG target saved");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save workbook ESG target");
    }
  };

  const analyticsRows = analyticsQuery.data?.data || [];
  const activeKpis = useMemo(() => (kpisQuery.data?.data || []).filter((item) => item.status === "ACTIVE").length, [kpisQuery.data?.data]);

  const { resolveLandingPath } = useAccessibleRoutes();
  if (!superAdmin) {
    return <Navigate to={resolveLandingPath()} replace />;
  }

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="ESG Master"
        subtitle="Super admin ESG configuration for KPIs, factors, targets, authorized users, and plant benchmarking"
        actions={
          <div className="flex flex-wrap gap-2">
            <SelectField label="" value={plantId} onChange={setPlantId} options={plantOptions} placeholder="Filter by plant" />
            <InputField label="" type="number" value={year} onChange={(value) => setYear(Number(value) || new Date().getFullYear())} />
            <InputField label="" type="number" value={month} onChange={(value) => setMonth(Number(value) || 1)} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="py-6"><div className="text-sm text-muted-foreground">Active KPIs</div><div className="text-3xl font-semibold">{activeKpis}</div></CardContent></Card>
        <Card><CardContent className="py-6"><div className="text-sm text-muted-foreground">Emission Factors</div><div className="text-3xl font-semibold">{factorsQuery.data?.data.length || 0}</div></CardContent></Card>
        <Card><CardContent className="py-6"><div className="text-sm text-muted-foreground">Plant Targets</div><div className="text-3xl font-semibold">{targetsQuery.data?.data.length || 0}</div></CardContent></Card>
        <Card><CardContent className="py-6"><div className="text-sm text-muted-foreground">Authorized ESG Users</div><div className="text-3xl font-semibold">{authUsersQuery.data?.data.length || 0}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="kpis" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kpis">KPI Master</TabsTrigger>
          <TabsTrigger value="factors">Emission Factors</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="workbook-targets">Workbook Targets</TabsTrigger>
          <TabsTrigger value="authorized">Authorized Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <DataTableShell title="KPI Configuration">
              <ResponsiveTable
                data={kpisQuery.data?.data || []}
                keyExtractor={(item) => item.id}
                columns={[
                  { key: "name", header: "KPI", render: (item) => item.kpiName },
                  { key: "category", header: "Category", render: (item) => item.kpiCategory },
                  { key: "unit", header: "Unit", render: (item) => item.unit || "-" },
                  { key: "status", header: "Status", render: (item) => <StatusBadge variant={item.status === "ACTIVE" ? "active" : "default"}>{item.status}</StatusBadge> },
                  { key: "action", header: "", render: (item) => <Button variant="ghost" size="sm" onClick={() => { setEditingKpiId(item.id); setKpiForm({ kpiName: item.kpiName, kpiCategory: item.kpiCategory, formula: item.formula || "", unit: item.unit || "", description: item.description || "", status: item.status }); }}>Edit</Button> },
                ]}
              />
          </DataTableShell>
          <Card>
            <CardHeader><CardTitle>{editingKpiId ? "Edit KPI" : "Add KPI"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InputField label="KPI Name" value={kpiForm.kpiName} onChange={(value) => setKpiForm((current) => ({ ...current, kpiName: value }))} />
              <SelectField label="Category" value={kpiForm.kpiCategory} onChange={(value) => setKpiForm((current) => ({ ...current, kpiCategory: value }))} options={categoryOptions} />
              <InputField label="Unit" value={kpiForm.unit} onChange={(value) => setKpiForm((current) => ({ ...current, unit: value }))} />
              <InputField label="Formula" value={kpiForm.formula} onChange={(value) => setKpiForm((current) => ({ ...current, formula: value }))} />
              <TextareaField label="Description" value={kpiForm.description} onChange={(value) => setKpiForm((current) => ({ ...current, description: value }))} />
              <SelectField label="Status" value={kpiForm.status} onChange={(value) => setKpiForm((current) => ({ ...current, status: value }))} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]} />
              <Button className="w-full gap-2" onClick={saveKpi}><Save className="h-4 w-4" />Save KPI</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workbook-targets" className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <DataTableShell title="Workbook ESG Targets">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-muted-foreground">Plant-wise targets</div>
                <ResponsiveTable
                  data={workbookPlantTargetsQuery.data?.data || []}
                  keyExtractor={(item) => item.id}
                  columns={[
                    { key: "plant", header: "Plant", render: (item) => plantOptions.find((option) => option.value === item.plantId)?.label || item.plantId },
                    { key: "metric", header: "Metric", render: (item) => item.metricLabel },
                    { key: "target", header: "Target", render: (item) => `${item.targetValue} ${item.unit || ""}` },
                  ]}
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-muted-foreground">Organization targets</div>
                <ResponsiveTable
                  data={workbookOrgTargetsQuery.data?.data || []}
                  keyExtractor={(item) => item.id}
                  columns={[
                    { key: "metric", header: "Metric", render: (item) => item.metricLabel },
                    { key: "target", header: "Target", render: (item) => `${item.targetValue} ${item.unit || ""}` },
                    { key: "year", header: "Year", render: (item) => item.year },
                  ]}
                />
              </div>
            </div>
          </DataTableShell>
          <Card>
            <CardHeader><CardTitle>Set Workbook Target</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SelectField label="Scope" value={workbookTargetForm.scope} onChange={(value) => setWorkbookTargetForm((current) => ({ ...current, scope: value }))} options={[{ value: "PLANT", label: "Plant" }, { value: "ORG", label: "Organization" }]} />
              {workbookTargetForm.scope === "PLANT" ? (
                <SelectField label="Plant" value={workbookTargetForm.plantId} onChange={(value) => setWorkbookTargetForm((current) => ({ ...current, plantId: value }))} options={plantOptions} />
              ) : null}
              <SelectField label="Workbook Metric" value={workbookTargetForm.metricCode} onChange={(value) => setWorkbookTargetForm((current) => ({ ...current, metricCode: value }))} options={workbookMetricOptions} />
              <InputField label="Year" type="number" value={year} onChange={(value) => setYear(Number(value) || new Date().getFullYear())} />
              <InputField label="Target Value" type="number" value={workbookTargetForm.targetValue} onChange={(value) => setWorkbookTargetForm((current) => ({ ...current, targetValue: value }))} />
              <TextareaField label="Notes" value={workbookTargetForm.notes} onChange={(value) => setWorkbookTargetForm((current) => ({ ...current, notes: value }))} />
              <Button className="w-full gap-2" onClick={saveWorkbookTarget}><Save className="h-4 w-4" />Save Workbook Target</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factors" className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <DataTableShell title="Emission Factors">
              <ResponsiveTable
                data={factorsQuery.data?.data || []}
                keyExtractor={(item) => item.id}
                columns={[
                  { key: "type", header: "Energy Type", render: (item) => item.energyType },
                  { key: "unit", header: "Unit", render: (item) => item.unit },
                  { key: "factor", header: "CO2 Factor", render: (item) => item.co2Factor },
                  { key: "effective", header: "Effective", render: (item) => item.effectiveDate },
                  { key: "action", header: "", render: (item) => <Button variant="ghost" size="sm" onClick={() => { setEditingFactorId(item.id); setFactorForm({ energyType: item.energyType, unit: item.unit, co2Factor: String(item.co2Factor), source: item.source || "", effectiveDate: item.effectiveDate, isActive: String(item.isActive) }); }}>Edit</Button> },
                ]}
              />
          </DataTableShell>
          <Card>
            <CardHeader><CardTitle>{editingFactorId ? "Edit Factor" : "Add Factor"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InputField label="Energy Type" value={factorForm.energyType} onChange={(value) => setFactorForm((current) => ({ ...current, energyType: value }))} />
              <InputField label="Unit" value={factorForm.unit} onChange={(value) => setFactorForm((current) => ({ ...current, unit: value }))} />
              <InputField label="CO2 Factor" type="number" value={factorForm.co2Factor} onChange={(value) => setFactorForm((current) => ({ ...current, co2Factor: value }))} />
              <InputField label="Source" value={factorForm.source} onChange={(value) => setFactorForm((current) => ({ ...current, source: value }))} />
              <InputField label="Effective Date" type="date" value={factorForm.effectiveDate} onChange={(value) => setFactorForm((current) => ({ ...current, effectiveDate: value }))} />
              <SelectField label="Status" value={factorForm.isActive} onChange={(value) => setFactorForm((current) => ({ ...current, isActive: value }))} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} />
              <Button className="w-full gap-2" onClick={saveFactor}><Plus className="h-4 w-4" />Save Factor</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets" className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <DataTableShell title="Plant ESG Targets">
              <ResponsiveTable
                data={targetsQuery.data?.data || []}
                keyExtractor={(item) => item.id}
                columns={[
                  { key: "plant", header: "Plant", render: (item) => plantOptions.find((option) => option.value === item.plantId)?.label || item.plantId },
                  { key: "year", header: "Year", render: (item) => item.year },
                  { key: "renewable", header: "Renewable %", render: (item) => item.renewableTarget || "-" },
                  { key: "energy", header: "Energy", render: (item) => item.targetEnergyReduction || "-" },
                ]}
              />
          </DataTableShell>
          <Card>
            <CardHeader><CardTitle>Set Target</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SelectField label="Plant" value={targetForm.plantId} onChange={(value) => setTargetForm((current) => ({ ...current, plantId: value }))} options={plantOptions} />
              <InputField label="Year" type="number" value={targetForm.year} onChange={(value) => setTargetForm((current) => ({ ...current, year: value }))} />
              <InputField label="Energy Target" type="number" value={targetForm.targetEnergyReduction} onChange={(value) => setTargetForm((current) => ({ ...current, targetEnergyReduction: value }))} />
              <InputField label="Water Target" type="number" value={targetForm.targetWaterReduction} onChange={(value) => setTargetForm((current) => ({ ...current, targetWaterReduction: value }))} />
              <InputField label="Emission Target" type="number" value={targetForm.targetEmissionReduction} onChange={(value) => setTargetForm((current) => ({ ...current, targetEmissionReduction: value }))} />
              <InputField label="Waste Target" type="number" value={targetForm.targetWasteReduction} onChange={(value) => setTargetForm((current) => ({ ...current, targetWasteReduction: value }))} />
              <InputField label="Renewable Target" type="number" value={targetForm.renewableTarget} onChange={(value) => setTargetForm((current) => ({ ...current, renewableTarget: value }))} />
              <Button className="w-full gap-2" onClick={saveTarget}><Save className="h-4 w-4" />Save Target</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authorized" className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <DataTableShell title="ESG Authorized Users">
              <ResponsiveTable
                data={authUsersQuery.data?.data || []}
                keyExtractor={(item) => item.id}
                columns={[
                  { key: "plant", header: "Plant", render: (item) => plantOptions.find((option) => option.value === item.plantId)?.label || item.plantId },
                  { key: "category", header: "Category", render: (item) => item.esgCategory },
                  { key: "user", header: "User", render: (item) => item.userName || item.userId },
                  { key: "action", header: "", render: (item) => <Button variant="ghost" size="sm" onClick={async () => { await deleteEsgAuthorizedUser(item.id); await queryClient.invalidateQueries({ queryKey: ["esg_master_auth_users", plantId] }); toast.success("Authorized ESG user removed"); }}>Remove</Button> },
                ]}
              />
          </DataTableShell>
          <Card>
            <CardHeader><CardTitle>Add Authorized User</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SelectField label="Plant" value={authForm.plantId} onChange={(value) => setAuthForm((current) => ({ ...current, plantId: value, userId: "" }))} options={plantOptions} />
              <SelectField label="ESG Category" value={authForm.esgCategory} onChange={(value) => setAuthForm((current) => ({ ...current, esgCategory: value }))} options={esgCategoryOptions} />
              <SelectField label="Authorized User" value={authForm.userId} onChange={(value) => setAuthForm((current) => ({ ...current, userId: value }))} options={userOptions} />
              <Button className="w-full gap-2" onClick={saveAuthorizedUser}><Users className="h-4 w-4" />Assign ESG User</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader><CardTitle>Cross Plant ESG Benchmark</CardTitle></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="plantName" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_energy_consumption" fill="hsl(var(--chart-1))" />
                    <Bar dataKey="water_consumption" fill="hsl(var(--chart-2))" />
                    <Bar dataKey="total_ghg_emissions" fill="hsl(var(--chart-3))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ResponsiveTable
                data={analyticsRows}
                keyExtractor={(item) => item.plantId}
                columns={[
                  { key: "plant", header: "Plant", render: (item) => item.plantName },
                  { key: "energy", header: "Energy", render: (item) => String(item.total_energy_consumption ?? "-") },
                  { key: "water", header: "Water", render: (item) => String(item.water_consumption ?? "-") },
                  { key: "emissions", header: "Emissions", render: (item) => String(item.total_ghg_emissions ?? "-") },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
