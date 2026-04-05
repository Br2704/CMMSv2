import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import {
  createAmcServiceReport,
  generateAmcVisitTask,
  getAmcDashboard,
  getAmcPortal,
  listAmcServiceReports,
  listAmcVisits,
  verifyAmcServiceReport,
  type AmcDashboard,
  type AmcPortalData,
  type AmcServiceReport,
  type AmcVisit,
} from "@/api/amc";
import { isAdmin, isIncharge, useAuthStore } from "@/store/auth.store";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { hoursToMinutes } from "@/lib/time";

interface ReportFormState {
  visitScheduleId: string | null;
  workOrderId: string | null;
  serviceDate: string;
  workDone: string;
  partsReplaced: string;
  observations: string;
  recommendations: string;
  nextServiceDate: string;
  attachments: string;
}

interface VerifyFormState {
  verificationStatus: "VERIFIED" | "REJECTED";
  verificationRemarks: string;
}

const emptyReportForm: ReportFormState = {
  visitScheduleId: null,
  workOrderId: null,
  serviceDate: new Date().toISOString().slice(0, 10),
  workDone: "",
  partsReplaced: "",
  observations: "",
  recommendations: "",
  nextServiceDate: "",
  attachments: "",
};

const emptyVerifyForm: VerifyFormState = {
  verificationStatus: "VERIFIED",
  verificationRemarks: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function getStatusVariant(status: string) {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
    case "VERIFIED":
      return "active" as const;
    case "RENEWAL_DUE":
    case "NOTIFIED":
    case "REPORTED":
    case "SUBMITTED":
      return "warning" as const;
    case "TASK_CREATED":
    case "ON_HOLD":
      return "in_progress" as const;
    case "REJECTED":
    case "CANCELLED":
    case "EXPIRED":
      return "inactive" as const;
    default:
      return "default" as const;
  }
}

export default function AMC() {
  const { user } = useAuthStore();
  const isVendorPortal = user?.roles.includes("VENDOR") ?? false;
  const canManage = isAdmin(user);
  const canVerify = canManage || isIncharge(user);

  const [dashboard, setDashboard] = useState<AmcDashboard | null>(null);
  const [portal, setPortal] = useState<AmcPortalData | null>(null);
  const [visits, setVisits] = useState<AmcVisit[]>([]);
  const [reports, setReports] = useState<AmcServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportFormState>(emptyReportForm);
  const [verifyForm, setVerifyForm] = useState<VerifyFormState>(emptyVerifyForm);
  const [selectedReport, setSelectedReport] = useState<AmcServiceReport | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isVendorPortal) {
        const portalResponse = await getAmcPortal();
        setPortal(portalResponse.data);
      } else {
        const [dashboardResponse, visitsResponse, reportsResponse] = await Promise.all([
          getAmcDashboard(),
          listAmcVisits({ page: 1, limit: 200 }),
          listAmcServiceReports({ page: 1, limit: 200 }),
        ]);
        setDashboard(dashboardResponse.data);
        setVisits(visitsResponse.data);
        setReports(reportsResponse.data);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load AMC operations"));
    } finally {
      setLoading(false);
    }
  }, [isVendorPortal]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredVisits = useMemo(() => {
    const source = isVendorPortal ? portal?.upcomingVisits || [] : visits;
    if (!search) return source;
    return source.filter((item) => `${item.contractName} ${item.assetName} ${item.assetCode}`.toLowerCase().includes(search.toLowerCase()));
  }, [isVendorPortal, portal, visits, search]);

  const filteredReports = useMemo(() => {
    const source = isVendorPortal ? portal?.serviceHistory || [] : reports;
    if (!search) return source;
    return source.filter((item) => `${item.contractName} ${item.assetName} ${item.assetCode}`.toLowerCase().includes(search.toLowerCase()));
  }, [isVendorPortal, portal, reports, search]);

  const openVisitReport = (visit: AmcVisit) => {
    setReportForm({ ...emptyReportForm, visitScheduleId: visit.id, workOrderId: visit.workOrder?.id || null });
    setReportOpen(true);
  };

  const openBreakdownReport = (workOrderId: string) => {
    setReportForm({ ...emptyReportForm, visitScheduleId: null, workOrderId });
    setReportOpen(true);
  };

  const submitReport = async () => {
    if (!reportForm.workDone.trim()) {
      toast.error("Work done is required");
      return;
    }
    setSaving(true);
    try {
      await createAmcServiceReport({
        visitScheduleId: reportForm.visitScheduleId,
        workOrderId: reportForm.workOrderId,
        serviceDate: reportForm.serviceDate,
        workDone: reportForm.workDone,
        partsReplaced: reportForm.partsReplaced || null,
        observations: reportForm.observations || null,
        recommendations: reportForm.recommendations || null,
        nextServiceDate: reportForm.nextServiceDate || null,
        attachments: reportForm.attachments.split("\n").map((item) => item.trim()).filter(Boolean),
      });
      toast.success("AMC service report submitted");
      setReportOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to submit AMC report"));
    } finally {
      setSaving(false);
    }
  };

  const submitVerification = async () => {
    if (!selectedReport) return;
    setSaving(true);
    try {
      await verifyAmcServiceReport(selectedReport.id, verifyForm);
      toast.success("AMC service report verified");
      setVerifyOpen(false);
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to verify AMC report"));
    } finally {
      setSaving(false);
    }
  };

  const createVisitTask = async (visitId: string) => {
    setSaving(true);
    try {
      await generateAmcVisitTask(visitId);
      toast.success("AMC service task generated");
      await loadData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to generate service task"));
    } finally {
      setSaving(false);
    }
  };

  const visitColumns = [
    {
      key: "asset",
      header: "Asset",
      render: (visit: AmcVisit) => (
        <div>
          <p className="font-medium">{visit.assetName}</p>
          <p className="text-xs text-muted-foreground">{visit.assetCode}</p>
        </div>
      ),
    },
    {
      key: "contract",
      header: "Contract",
      render: (visit: AmcVisit) => visit.contractName,
      hideOnMobile: true,
    },
    {
      key: "date",
      header: "Visit Date",
      render: (visit: AmcVisit) => format(new Date(visit.visitDate), "dd MMM yyyy"),
    },
    {
      key: "status",
      header: "Status",
      render: (visit: AmcVisit) => <StatusBadge variant={getStatusVariant(visit.status)}>{visit.status.replace(/_/g, " ")}</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (visit: AmcVisit) => (
        <div className="flex justify-end gap-2">
          {!visit.workOrder && !isVendorPortal ? (
            <Button variant="outline" size="sm" onClick={() => void createVisitTask(visit.id)} disabled={saving}>
              Task
            </Button>
          ) : null}
          <Button size="sm" onClick={() => openVisitReport(visit)}>
            Report
          </Button>
        </div>
      ),
    },
  ];

  const reportColumns = [
    {
      key: "asset",
      header: "Asset",
      render: (report: AmcServiceReport) => (
        <div>
          <p className="font-medium">{report.assetName}</p>
          <p className="text-xs text-muted-foreground">{report.assetCode}</p>
        </div>
      ),
    },
    {
      key: "serviceDate",
      header: "Service Date",
      render: (report: AmcServiceReport) => format(new Date(report.serviceDate), "dd MMM yyyy"),
    },
    {
      key: "sla",
      header: "SLA",
      render: (report: AmcServiceReport) => `${report.responseTimeMinutes ?? 0} / ${report.resolutionTimeMinutes ?? 0} min`,
      hideOnMobile: true,
    },
    {
      key: "verification",
      header: "Verification",
      render: (report: AmcServiceReport) => <StatusBadge variant={getStatusVariant(report.verificationStatus)}>{report.verificationStatus}</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (report: AmcServiceReport) => (
        <div className="flex justify-end gap-2">
          {!isVendorPortal && canVerify && report.verificationStatus === "SUBMITTED" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedReport(report);
                setVerifyForm(emptyVerifyForm);
                setVerifyOpen(true);
              }}
            >
              Verify
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const breakdowns = portal?.breakdownRequests || [];

  return (
    <PageShell>
      <PageHeader
        title={isVendorPortal ? "AMC Vendor Portal" : "AMC Operations"}
        description={isVendorPortal ? "View assigned AMC machines, visits, breakdown requests, and service history" : "Track AMC compliance, visits, service tasks, vendor reports, and SLA performance"}
      />

      <Card>
        <CardContent className="p-4">
          <FilterToolbar
            search={
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search AMC asset, contract, or report..." className="pl-9" />
              </div>
            }
          />
        </CardContent>
      </Card>

      {loading ? (
        <TableSkeleton />
      ) : isVendorPortal ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Assigned Machines</p><p className="mt-2 text-2xl font-semibold">{portal?.assignedMachines.length || 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Upcoming Visits</p><p className="mt-2 text-2xl font-semibold">{portal?.upcomingVisits.length || 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Breakdown Requests</p><p className="mt-2 text-2xl font-semibold">{breakdowns.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Service History</p><p className="mt-2 text-2xl font-semibold">{portal?.serviceHistory.length || 0}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Assigned Machines</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {portal?.assignedMachines.map((machine) => (
                <StatusBadge key={machine.id} variant={machine.status === "ACTIVE" ? "active" : "default"}>{machine.code} - {machine.name}</StatusBadge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Upcoming AMC Visits</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveTable
                data={filteredVisits}
                columns={visitColumns}
                keyExtractor={(visit: AmcVisit) => visit.id}
                mobileCard={(visit: AmcVisit) => (
                  <MobileCard onEdit={() => openVisitReport(visit)}>
                    <MobileCardHeader title={visit.assetName} subtitle={visit.contractName} badge={<StatusBadge variant={getStatusVariant(visit.status)}>{visit.status}</StatusBadge>} />
                    <MobileCardRow label="Visit Date" value={visit.visitDate} />
                    <MobileCardRow label="WO" value={visit.workOrder?.woNumber || "-"} />
                  </MobileCard>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Breakdown Requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {breakdowns.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.woNumber}</p>
                      <p className="text-sm text-muted-foreground">{item.problemDescription}</p>
                    </div>
                    <Button size="sm" onClick={() => openBreakdownReport(item.id)}>Report</Button>
                  </div>
                </div>
              ))}
              {breakdowns.length === 0 ? <p className="text-sm text-muted-foreground">No active AMC breakdown requests.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Service History</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveTable
                data={filteredReports}
                columns={reportColumns}
                keyExtractor={(report: AmcServiceReport) => report.id}
                mobileCard={(report: AmcServiceReport) => (
                  <MobileCard>
                    <MobileCardHeader title={report.assetName} subtitle={report.contractName} badge={<StatusBadge variant={getStatusVariant(report.verificationStatus)}>{report.verificationStatus}</StatusBadge>} />
                    <MobileCardRow label="Service Date" value={report.serviceDate} />
                    <MobileCardRow label="Type" value={report.sourceType} />
                  </MobileCard>
                )}
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">AMC Compliance</p><p className="mt-2 text-2xl font-semibold">{dashboard?.amcCompliance || 0}%</p></div><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pending Visits</p><p className="mt-2 text-2xl font-semibold">{dashboard?.pendingVisits || 0}</p></div><ClipboardCheck className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Missed Visits</p><p className="mt-2 text-2xl font-semibold">{dashboard?.missedVisits || 0}</p></div><AlertTriangle className="h-6 w-6 text-rose-600" /></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Coverage / Response</p><p className="mt-2 text-2xl font-semibold">{dashboard?.machineAmcCoverage || 0}% / {hoursToMinutes(dashboard?.vendorResponseTimeHours)} min</p></div><Wrench className="h-6 w-6 text-primary" /></div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Visit Schedule & Service Tasks</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveTable
                data={filteredVisits}
                columns={visitColumns}
                keyExtractor={(visit: AmcVisit) => visit.id}
                mobileCard={(visit: AmcVisit) => (
                  <MobileCard onEdit={() => openVisitReport(visit)}>
                    <MobileCardHeader title={visit.assetName} subtitle={visit.contractName} badge={<StatusBadge variant={getStatusVariant(visit.status)}>{visit.status}</StatusBadge>} />
                    <MobileCardRow label="Visit Date" value={visit.visitDate} />
                    <MobileCardRow label="WO" value={visit.workOrder?.woNumber || "-"} />
                  </MobileCard>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendor Service Reports</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveTable
                data={filteredReports}
                columns={reportColumns}
                keyExtractor={(report: AmcServiceReport) => report.id}
                mobileCard={(report: AmcServiceReport) => (
                  <MobileCard onEdit={canVerify && report.verificationStatus === "SUBMITTED" ? () => { setSelectedReport(report); setVerifyForm(emptyVerifyForm); setVerifyOpen(true); } : undefined}>
                    <MobileCardHeader title={report.assetName} subtitle={report.contractName} badge={<StatusBadge variant={getStatusVariant(report.verificationStatus)}>{report.verificationStatus}</StatusBadge>} />
                    <MobileCardRow label="Service Date" value={report.serviceDate} />
                    <MobileCardRow label="SLA" value={`${report.responseTimeMinutes ?? 0}/${report.resolutionTimeMinutes ?? 0} min`} />
                  </MobileCard>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}

      <FormDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title="Submit AMC Service Report"
        description="Update work done, parts, observations, and next service recommendation"
        onSubmit={submitReport}
        submitLabel={saving ? "Saving..." : "Submit Report"}
        isLoading={saving}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label="Service Date" type="date" value={reportForm.serviceDate} onChange={(value) => setReportForm((current) => ({ ...current, serviceDate: value }))} required />
          <InputField label="Next Service Date" type="date" value={reportForm.nextServiceDate} onChange={(value) => setReportForm((current) => ({ ...current, nextServiceDate: value }))} />
          <TextareaField label="Work Done *" value={reportForm.workDone} onChange={(value) => setReportForm((current) => ({ ...current, workDone: value }))} className="sm:col-span-2" />
          <TextareaField label="Parts Replaced" value={reportForm.partsReplaced} onChange={(value) => setReportForm((current) => ({ ...current, partsReplaced: value }))} />
          <TextareaField label="Observations" value={reportForm.observations} onChange={(value) => setReportForm((current) => ({ ...current, observations: value }))} />
          <TextareaField label="Recommendations" value={reportForm.recommendations} onChange={(value) => setReportForm((current) => ({ ...current, recommendations: value }))} className="sm:col-span-2" />
          <TextareaField label="Attachment Links / Notes" value={reportForm.attachments} onChange={(value) => setReportForm((current) => ({ ...current, attachments: value }))} className="sm:col-span-2" />
        </div>
      </FormDialog>

      <FormDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify AMC Service Report"
        description="Machine incharge / admin verification of vendor report"
        onSubmit={submitVerification}
        submitLabel={saving ? "Saving..." : "Submit Verification"}
        isLoading={saving}
      >
        <div className="grid gap-4">
          <SelectField
            label="Verification Status"
            value={verifyForm.verificationStatus}
            onChange={(value) => setVerifyForm((current) => ({ ...current, verificationStatus: value as "VERIFIED" | "REJECTED" }))}
            options={[
              { value: "VERIFIED", label: "Verified" },
              { value: "REJECTED", label: "Rejected" },
            ]}
          />
          <TextareaField label="Verification Remarks" value={verifyForm.verificationRemarks} onChange={(value) => setVerifyForm((current) => ({ ...current, verificationRemarks: value }))} />
        </div>
      </FormDialog>
    </PageShell>
  );
}
