import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, Leaf, Lock, Save, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputField, SelectField } from "@/components/shared/FormField";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPlants } from "@/api/plants";
import {
  exportEsgReport,
  getEsgDashboard,
  getEsgData,
  getEsgWorkbookOrganizationSummary,
  getEsgWorkbookSummary,
  listEsgWorkbookDailyEntries,
  lockEsgSection,
  saveEsgEmissionData,
  saveEsgEnergyData,
  saveEsgProductionData,
  saveEsgWasteData,
  saveEsgWaterData,
  saveEsgWorkbookDailyEntries,
  type EsgEmissionData,
  type EsgEnergyData,
  type EsgProductionData,
  type EsgSectionKey,
  type EsgWasteData,
  type EsgWaterData,
  type EsgWorkbookCategory,
} from "@/api/esg";
import { ESG_WORKBOOK_INPUT_METRICS } from "@/config/esg-workbook";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { usePermissions } from "@/hooks/usePermissions";

const monthOptions = [{ value: "1", label: "Jan" }, { value: "2", label: "Feb" }, { value: "3", label: "Mar" }, { value: "4", label: "Apr" }, { value: "5", label: "May" }, { value: "6", label: "Jun" }, { value: "7", label: "Jul" }, { value: "8", label: "Aug" }, { value: "9", label: "Sep" }, { value: "10", label: "Oct" }, { value: "11", label: "Nov" }, { value: "12", label: "Dec" }];
const workbookCategoryOptions: Array<{ value: EsgWorkbookCategory; label: string }> = [{ value: "PRODUCTION", label: "Production" }, { value: "ENERGY", label: "Energy" }, { value: "RENEWABLES", label: "Renewables" }, { value: "EMISSIONS", label: "Emissions" }, { value: "WATER", label: "Water" }, { value: "WASTE", label: "Waste" }, { value: "MATERIALS", label: "Materials" }];

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const toNumber = (value: string | number | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const fmt = (value: string | number | null | undefined) => toNumber(value).toFixed(2);
const workbookMetrics = (category: EsgWorkbookCategory) => ESG_WORKBOOK_INPUT_METRICS.filter((metric) => metric.category === category);
const workbookRow = (rows: Array<{ metricCode: string; value: string; unit: string | null; metricLabel: string; status: string; plantTargetValue?: string | null; organizationTargetValue?: string | null }> | undefined, code: string) => rows?.find((row) => row.metricCode === code);

export default function ESG() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { hasModuleAccess } = usePermissions();
  const superAdmin = isSuperAdmin(user);
  const canApprove = hasModuleAccess("esg", "approve");
  const [plantId, setPlantId] = useState(user?.plantId || "");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [section, setSection] = useState<EsgSectionKey>("energy");
  const [workbookCategory, setWorkbookCategory] = useState<EsgWorkbookCategory>("ENERGY");
  const [entryDate, setEntryDate] = useState(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`);
  const [workbookForm, setWorkbookForm] = useState<Record<string, string>>({});
  const [energyForm, setEnergyForm] = useState<EsgEnergyData>({ year, month, gridElectricityKwh: 0, dieselConsumptionLitre: 0, coalConsumption: 0, gasConsumption: 0, steamConsumption: 0, solarGeneration: 0, windGeneration: 0, greenEnergyPurchase: 0 });
  const [waterForm, setWaterForm] = useState<EsgWaterData>({ year, month, freshWaterIntake: 0, groundWater: 0, municipalWater: 0, recycledWater: 0, rainWater: 0, waterDischarge: 0 });
  const [emissionForm, setEmissionForm] = useState<EsgEmissionData>({ year, month, scope1Emissions: 0, scope2Emissions: 0, scope3Emissions: 0, boilerNox: 0, boilerSox: 0, boilerPm: 0, stackEmission: 0 });
  const [wasteForm, setWasteForm] = useState<EsgWasteData>({ year, month, hazardousWaste: 0, nonHazardousWaste: 0, recycledWaste: 0, landfillWaste: 0, incineratedWaste: 0 });
  const [productionForm, setProductionForm] = useState<EsgProductionData>({ year, month, productionQuantity: 0, operatingHours: 0, machineUtilization: 0 });

  useEffect(() => { if (!superAdmin) setPlantId(user?.plantId || ""); }, [superAdmin, user?.plantId]);
  useEffect(() => { setEntryDate(`${year}-${String(month).padStart(2, "0")}-01`); }, [year, month]);

  const plantsQuery = useQuery({ queryKey: ["esg_plants"], queryFn: () => listPlants({ page: 1, limit: 500, includeInactive: false }), enabled: superAdmin });
  const dashboardQuery = useQuery({ queryKey: ["esg_dashboard", plantId, year, month], queryFn: () => getEsgDashboard({ plantId: plantId || undefined, year, month }), enabled: Boolean(plantId) });
  const dataQuery = useQuery({ queryKey: ["esg_data", plantId, year, month], queryFn: () => getEsgData({ plantId: plantId || undefined, year, month }), enabled: Boolean(plantId) });
  const dailyQuery = useQuery({ queryKey: ["esg_workbook_daily", plantId, year, month, workbookCategory], queryFn: () => listEsgWorkbookDailyEntries({ plantId: plantId || undefined, year, month, category: workbookCategory }), enabled: Boolean(plantId) });
  const workbookSummaryQuery = useQuery({ queryKey: ["esg_workbook_summary", plantId, year, month], queryFn: () => getEsgWorkbookSummary({ plantId: plantId || undefined, year, month }), enabled: Boolean(plantId) });
  const orgSummaryQuery = useQuery({ queryKey: ["esg_workbook_org_summary", year, month], queryFn: () => getEsgWorkbookOrganizationSummary({ year, month }), enabled: Boolean(plantId) });

  useEffect(() => {
    const data = dataQuery.data?.data;
    if (!data) return;
    setEnergyForm({ plantId: data.plantId, year: data.year, month: data.month, gridElectricityKwh: toNumber(data.energy?.gridElectricityKwh), dieselConsumptionLitre: toNumber(data.energy?.dieselConsumptionLitre), coalConsumption: toNumber(data.energy?.coalConsumption), gasConsumption: toNumber(data.energy?.gasConsumption), steamConsumption: toNumber(data.energy?.steamConsumption), solarGeneration: toNumber(data.energy?.solarGeneration), windGeneration: toNumber(data.energy?.windGeneration), greenEnergyPurchase: toNumber(data.energy?.greenEnergyPurchase), isLocked: data.energy?.isLocked });
    setWaterForm({ plantId: data.plantId, year: data.year, month: data.month, freshWaterIntake: toNumber(data.water?.freshWaterIntake), groundWater: toNumber(data.water?.groundWater), municipalWater: toNumber(data.water?.municipalWater), recycledWater: toNumber(data.water?.recycledWater), rainWater: toNumber(data.water?.rainWater), waterDischarge: toNumber(data.water?.waterDischarge), isLocked: data.water?.isLocked });
    setEmissionForm({ plantId: data.plantId, year: data.year, month: data.month, scope1Emissions: toNumber(data.emissions?.scope1Emissions), scope2Emissions: toNumber(data.emissions?.scope2Emissions), scope3Emissions: toNumber(data.emissions?.scope3Emissions), boilerNox: toNumber(data.emissions?.boilerNox), boilerSox: toNumber(data.emissions?.boilerSox), boilerPm: toNumber(data.emissions?.boilerPm), stackEmission: toNumber(data.emissions?.stackEmission), isLocked: data.emissions?.isLocked });
    setWasteForm({ plantId: data.plantId, year: data.year, month: data.month, hazardousWaste: toNumber(data.waste?.hazardousWaste), nonHazardousWaste: toNumber(data.waste?.nonHazardousWaste), recycledWaste: toNumber(data.waste?.recycledWaste), landfillWaste: toNumber(data.waste?.landfillWaste), incineratedWaste: toNumber(data.waste?.incineratedWaste), isLocked: data.waste?.isLocked });
    setProductionForm({ plantId: data.plantId, year: data.year, month: data.month, productionQuantity: toNumber(data.production?.productionQuantity), operatingHours: toNumber(data.production?.operatingHours), machineUtilization: toNumber(data.production?.machineUtilization), isLocked: data.production?.isLocked });
  }, [dataQuery.data]);

  useEffect(() => {
    const form: Record<string, string> = {};
    workbookMetrics(workbookCategory).forEach((metric) => {
      const existing = dailyQuery.data?.data.find((row) => row.entryDate === entryDate && row.metricCode === metric.code);
      form[metric.code] = existing ? String(toNumber(existing.value)) : "";
    });
    setWorkbookForm(form);
  }, [dailyQuery.data?.data, entryDate, workbookCategory]);

  const access = dataQuery.data?.data?.access;
  const sectionLocked = { energy: Boolean(energyForm.isLocked), water: Boolean(waterForm.isLocked), emissions: Boolean(emissionForm.isLocked), waste: Boolean(wasteForm.isLocked), production: Boolean(productionForm.isLocked) };
  const currentCategory = { energy: "ENERGY", water: "WATER", emissions: "EMISSIONS", waste: "WASTE", production: "PRODUCTION" }[section];
  const currentReadOnly = !(superAdmin || access?.categories.includes(currentCategory) || access?.categories.includes("ALL")) || sectionLocked[section];
  const workbookReadOnly = !(superAdmin || access?.categories.includes(workbookCategory) || access?.categories.includes("ALL"));
  const plantOptions = (plantsQuery.data?.data || []).map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` }));
  const workbookRows = workbookSummaryQuery.data?.data.rows || [];
  const workbookCards = ["PRODUCTION_TOTAL", "TOTAL_ENERGY_GJ", "TOTAL_EMISSIONS", "SPECIFIC_RAW_WATER"].map((code) => workbookRow(workbookRows, code)).filter(Boolean);
  const workbookSectionRows = workbookRows.filter((row) => row.category === workbookCategory);

  const invalidateWorkbook = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["esg_workbook_daily", plantId, year, month, workbookCategory] }),
    queryClient.invalidateQueries({ queryKey: ["esg_workbook_summary", plantId, year, month] }),
    queryClient.invalidateQueries({ queryKey: ["esg_workbook_org_summary", year, month] }),
  ]);

  const saveWorkbookDay = async () => {
    try {
      await saveEsgWorkbookDailyEntries({ plantId, entryDate, entries: workbookMetrics(workbookCategory).map((metric) => ({ metricCode: metric.code, value: toNumber(workbookForm[metric.code]) })) });
      await invalidateWorkbook();
      toast.success("Day-wise ESG data saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to save day-wise ESG data"); }
  };

  const saveSection = async () => {
    try {
      if (section === "energy") await saveEsgEnergyData({ ...energyForm, plantId });
      if (section === "water") await saveEsgWaterData({ ...waterForm, plantId });
      if (section === "emissions") await saveEsgEmissionData({ ...emissionForm, plantId });
      if (section === "waste") await saveEsgWasteData({ ...wasteForm, plantId });
      if (section === "production") await saveEsgProductionData({ ...productionForm, plantId });
      await queryClient.invalidateQueries({ queryKey: ["esg_data", plantId, year, month] });
      toast.success("Monthly ESG section saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to save monthly ESG data"); }
  };

  const toggleLock = async () => {
    try {
      await lockEsgSection({ plantId, year, month, section, locked: !sectionLocked[section] });
      await queryClient.invalidateQueries({ queryKey: ["esg_data", plantId, year, month] });
      toast.success(sectionLocked[section] ? "Section unlocked" : "Section locked");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to update lock"); }
  };

  const reportExport = async (format: "csv" | "pdf", reportType: "MONTHLY" | "ANNUAL" | "GHG" | "WATER" | "WASTE") => {
    try {
      const blob = await exportEsgReport({ plantId: superAdmin ? undefined : plantId, year, month, reportType, format });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `esg-${reportType.toLowerCase()}-${year}-${String(month).padStart(2, "0")}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to export report"); }
  };

  return (
    <PageShell>
      <PageHeader title="Sustainability ESG" subtitle="Plant-wise workbook entry, master-aligned month rollup, and organization ESG summary" actions={<div className="flex flex-wrap gap-2">{superAdmin ? <SelectField label="" value={plantId} onChange={setPlantId} options={plantOptions} placeholder="Select plant" /> : null}<SelectField label="" value={String(month)} onChange={(value) => setMonth(Number(value))} options={monthOptions} /><InputField label="" type="number" value={year} onChange={(value) => setYear(Number(value) || currentYear)} /></div>} />
      {dashboardQuery.data?.data.readOnly ? <Card className="border-amber-300 bg-amber-50"><CardContent className="flex items-center gap-3 py-4 text-sm text-amber-900"><ShieldCheck className="h-4 w-4" />ESG data entry is read-only for this plant. Only super admin or assigned ESG users can update section data.</CardContent></Card> : null}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="data">Data Entry</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger></TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{workbookCards.map((row) => row ? <Card key={row.metricCode}><CardHeader className="pb-2"><CardTitle className="text-sm">{row.metricLabel}</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{fmt(row.value)}</div><div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{row.unit || "-"}</span><StatusBadge variant={row.status === "ALERT" ? "warning" : "active"} showDot={false}>{row.status}</StatusBadge></div></CardContent></Card> : null)}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Plant Month Rollup</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Plant</TableHead><TableHead>Plant Target</TableHead><TableHead>Org Target</TableHead></TableRow></TableHeader><TableBody>{workbookRows.map((row) => <TableRow key={row.metricCode}><TableCell>{row.metricLabel}</TableCell><TableCell>{fmt(row.value)} {row.unit || ""}</TableCell><TableCell>{row.plantTargetValue ? `${fmt(row.plantTargetValue)} ${row.unit || ""}` : "-"}</TableCell><TableCell>{row.organizationTargetValue ? `${fmt(row.organizationTargetValue)} ${row.unit || ""}` : "-"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            <Card><CardHeader><CardTitle>Current KPI Status</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>KPI</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{(dashboardQuery.data?.data.current.kpis || []).map((kpi) => <TableRow key={kpi.id}><TableCell>{kpi.kpiName}</TableCell><TableCell>{fmt(kpi.value)} {kpi.unit || ""}</TableCell><TableCell><StatusBadge variant={kpi.status === "ALERT" ? "warning" : "active"}>{kpi.status}</StatusBadge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Tabs defaultValue="daily" className="space-y-4">
            <TabsList><TabsTrigger value="daily">Day-wise Entry</TabsTrigger><TabsTrigger value="monthly">Monthly ESG Entry</TabsTrigger></TabsList>
            <TabsContent value="daily" className="space-y-4">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Workbook Day-wise Data Entry</CardTitle><p className="text-sm text-muted-foreground">Select the Excel section and enter daily values. The month-wise summary updates automatically.</p></div><Button className="gap-2" onClick={saveWorkbookDay} disabled={workbookReadOnly || !plantId}><Save className="h-4 w-4" />Save Day</Button></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-3"><SelectField label="" value={workbookCategory} onChange={(value) => setWorkbookCategory(value as EsgWorkbookCategory)} options={workbookCategoryOptions} /><InputField label="" type="date" value={entryDate} onChange={setEntryDate} /></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workbookMetrics(workbookCategory).map((metric) => <InputField key={metric.code} label={`${metric.label} (${metric.unit})`} type="number" value={workbookForm[metric.code] ?? ""} onChange={(value) => setWorkbookForm((current) => ({ ...current, [metric.code]: value }))} disabled={workbookReadOnly} />)}</div></CardContent></Card>
              <Card><CardHeader><CardTitle>{workbookCategoryOptions.find((option) => option.value === workbookCategory)?.label} Month-wise Rollup</CardTitle></CardHeader><CardContent className="max-h-80 overflow-auto"><Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Value</TableHead><TableHead>Plant Target</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{workbookSectionRows.map((row) => <TableRow key={row.metricCode}><TableCell>{row.metricLabel}</TableCell><TableCell>{fmt(row.value)} {row.unit || ""}</TableCell><TableCell>{row.plantTargetValue ? `${fmt(row.plantTargetValue)} ${row.unit || ""}` : row.organizationTargetValue ? `${fmt(row.organizationTargetValue)} ${row.unit || ""}` : "-"}</TableCell><TableCell><StatusBadge variant={row.status === "ALERT" ? "warning" : "active"}>{row.status}</StatusBadge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
              <Card><CardHeader><CardTitle>Saved Day Entries</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Metric</TableHead><TableHead>Value</TableHead><TableHead>Category</TableHead></TableRow></TableHeader><TableBody>{(dailyQuery.data?.data || []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No day-wise entries found for this month.</TableCell></TableRow> : (dailyQuery.data?.data || []).map((row) => <TableRow key={row.id}><TableCell>{row.entryDate}</TableCell><TableCell>{row.metricLabel}</TableCell><TableCell>{fmt(row.value)} {row.unit || ""}</TableCell><TableCell>{row.category}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            </TabsContent>
            <TabsContent value="monthly">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Monthly ESG Data Entry</CardTitle><div className="flex gap-2">{canApprove ? <Button variant="outline" className="gap-2" onClick={toggleLock}><Lock className="h-4 w-4" />{sectionLocked[section] ? "Unlock Section" : "Lock Section"}</Button> : null}<Button className="gap-2" onClick={saveSection} disabled={currentReadOnly}><Save className="h-4 w-4" />Save Section</Button></div></CardHeader><CardContent className="space-y-4"><Tabs value={section} onValueChange={(value) => setSection(value as EsgSectionKey)}><TabsList><TabsTrigger value="energy">Energy</TabsTrigger><TabsTrigger value="water">Water</TabsTrigger><TabsTrigger value="emissions">Emissions</TabsTrigger><TabsTrigger value="waste">Waste</TabsTrigger><TabsTrigger value="production">Production</TabsTrigger></TabsList></Tabs><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{section === "energy" ? <><InputField label="Grid Electricity (kWh)" type="number" value={energyForm.gridElectricityKwh} onChange={(value) => setEnergyForm((current) => ({ ...current, gridElectricityKwh: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Diesel (L)" type="number" value={energyForm.dieselConsumptionLitre} onChange={(value) => setEnergyForm((current) => ({ ...current, dieselConsumptionLitre: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Coal" type="number" value={energyForm.coalConsumption} onChange={(value) => setEnergyForm((current) => ({ ...current, coalConsumption: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Gas" type="number" value={energyForm.gasConsumption} onChange={(value) => setEnergyForm((current) => ({ ...current, gasConsumption: toNumber(value) }))} disabled={currentReadOnly} /></> : null}{section === "water" ? <><InputField label="Fresh Water Intake" type="number" value={waterForm.freshWaterIntake} onChange={(value) => setWaterForm((current) => ({ ...current, freshWaterIntake: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Ground Water" type="number" value={waterForm.groundWater} onChange={(value) => setWaterForm((current) => ({ ...current, groundWater: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Municipal Water" type="number" value={waterForm.municipalWater} onChange={(value) => setWaterForm((current) => ({ ...current, municipalWater: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Recycled Water" type="number" value={waterForm.recycledWater} onChange={(value) => setWaterForm((current) => ({ ...current, recycledWater: toNumber(value) }))} disabled={currentReadOnly} /></> : null}{section === "emissions" ? <><InputField label="Scope 1 Emissions" type="number" value={emissionForm.scope1Emissions} onChange={(value) => setEmissionForm((current) => ({ ...current, scope1Emissions: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Scope 2 Emissions" type="number" value={emissionForm.scope2Emissions} onChange={(value) => setEmissionForm((current) => ({ ...current, scope2Emissions: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Scope 3 Emissions" type="number" value={emissionForm.scope3Emissions} onChange={(value) => setEmissionForm((current) => ({ ...current, scope3Emissions: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Stack Emission" type="number" value={emissionForm.stackEmission} onChange={(value) => setEmissionForm((current) => ({ ...current, stackEmission: toNumber(value) }))} disabled={currentReadOnly} /></> : null}{section === "waste" ? <><InputField label="Hazardous Waste" type="number" value={wasteForm.hazardousWaste} onChange={(value) => setWasteForm((current) => ({ ...current, hazardousWaste: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Non Hazardous Waste" type="number" value={wasteForm.nonHazardousWaste} onChange={(value) => setWasteForm((current) => ({ ...current, nonHazardousWaste: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Recycled Waste" type="number" value={wasteForm.recycledWaste} onChange={(value) => setWasteForm((current) => ({ ...current, recycledWaste: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Landfill Waste" type="number" value={wasteForm.landfillWaste} onChange={(value) => setWasteForm((current) => ({ ...current, landfillWaste: toNumber(value) }))} disabled={currentReadOnly} /></> : null}{section === "production" ? <><InputField label="Production Quantity" type="number" value={productionForm.productionQuantity} onChange={(value) => setProductionForm((current) => ({ ...current, productionQuantity: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Operating Hours" type="number" value={productionForm.operatingHours} onChange={(value) => setProductionForm((current) => ({ ...current, operatingHours: toNumber(value) }))} disabled={currentReadOnly} /><InputField label="Machine Utilization %" type="number" value={productionForm.machineUtilization} onChange={(value) => setProductionForm((current) => ({ ...current, machineUtilization: toNumber(value) }))} disabled={currentReadOnly} /></> : null}</div></CardContent></Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="analytics"><Card><CardHeader><CardTitle>Organization ESG Summary</CardTitle></CardHeader><CardContent className="max-h-[32rem] overflow-auto"><Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Organization</TableHead><TableHead>Target</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{(orgSummaryQuery.data?.data.rows || []).map((row) => <TableRow key={row.metricCode}><TableCell>{row.metricLabel}</TableCell><TableCell>{fmt(row.value)} {row.unit || ""}</TableCell><TableCell>{row.organizationTargetValue ? `${fmt(row.organizationTargetValue)} ${row.unit || ""}` : "-"}</TableCell><TableCell><StatusBadge variant={row.status === "ALERT" ? "warning" : "active"}>{row.status}</StatusBadge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="reports"><Card><CardHeader><CardTitle>ESG Reports</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Button variant="outline" className="gap-2" onClick={() => reportExport("csv", "MONTHLY")}><FileSpreadsheet className="h-4 w-4" />Monthly ESG Excel</Button><Button variant="outline" className="gap-2" onClick={() => reportExport("pdf", "MONTHLY")}><Leaf className="h-4 w-4" />Monthly ESG PDF</Button><Button variant="outline" className="gap-2" onClick={() => reportExport("csv", "GHG")}><FileSpreadsheet className="h-4 w-4" />GHG Report Excel</Button><Button variant="outline" className="gap-2" onClick={() => reportExport("pdf", "WATER")}><CalendarDays className="h-4 w-4" />Water Report PDF</Button></CardContent></Card></TabsContent>
      </Tabs>
    </PageShell>
  );
}
