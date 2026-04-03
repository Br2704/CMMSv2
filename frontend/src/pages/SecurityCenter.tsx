import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Clock3, RefreshCw, ShieldAlert, Siren, Verified } from "lucide-react";
import { acknowledgeSecurityEvent, fetchAuditLogs, fetchSecurityCompliance, fetchSecurityDashboard, fetchSecurityEvents, type AuditLogRecord, type SecurityComplianceResponse, type SecurityDashboardResponse, type SecurityEventRecord } from "@/api/security";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { isRootAdmin, useAuthStore } from "@/store/auth.store";

function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "CRITICAL" || severity === "HIGH") return "destructive";
  if (severity === "MEDIUM") return "secondary";
  return "outline";
}

export default function SecurityCenter() {
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [dashboard, setDashboard] = useState<SecurityDashboardResponse | null>(null);
  const [compliance, setCompliance] = useState<SecurityComplianceResponse | null>(null);
  const user = useAuthStore((state) => state.user);
  const canViewCompliance = isRootAdmin(user);
  const { toast } = useToast();

  const load = useCallback(async (severity = severityFilter) => {
    setIsLoading(true);
    try {
      const [dashboardData, eventData, auditData, complianceData] = await Promise.all([
        fetchSecurityDashboard(),
        fetchSecurityEvents(severity),
        fetchAuditLogs(),
        canViewCompliance ? fetchSecurityCompliance() : Promise.resolve(null),
      ]);
      setDashboard(dashboardData);
      setCompliance(complianceData);
      setEvents(eventData);
      setAuditLogs(auditData);
    } catch (error) {
      toast({
        title: "Security data unavailable",
        description: error instanceof Error ? error.message : "Failed to load security center data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [canViewCompliance, severityFilter, toast]);

  useEffect(() => {
    void load(severityFilter);
  }, [load, severityFilter]);

  const handleAcknowledge = async (eventId: string) => {
    try {
      await acknowledgeSecurityEvent(eventId);
      toast({ title: "Security event acknowledged" });
      await load();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unable to acknowledge security event.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Center</h1>
          <p className="text-sm text-muted-foreground">
            {canViewCompliance
              ? "Audit logs, live security events, and ISO 27001 control status."
              : "Security events and audit activity within your organization scope."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All severities</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Open Security Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.openEvents ?? 0}</p>
            </div>
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Critical Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.criticalEvents ?? 0}</p>
            </div>
            <Siren className="h-8 w-8 text-destructive" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Failed Auth Events</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.failedLoginEvents ?? 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Audit Changes 24h</p>
              <p className="mt-2 text-3xl font-semibold">{dashboard?.auditChangesLast24Hours ?? 0}</p>
            </div>
            <Clock3 className="h-8 w-8 text-sky-600" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          {canViewCompliance ? <TabsTrigger value="compliance">Compliance</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Live Security Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboard?.suspiciousIps?.length ? (
                <div className="flex flex-wrap gap-2">
                  {dashboard.suspiciousIps.map((row) => (
                    <Badge key={row.ipAddress} variant="outline">
                      {row.ipAddress}: {row.attempts}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="font-medium">{event.eventType}</div>
                        <div className="text-xs text-muted-foreground">{event.message}</div>
                      </TableCell>
                      <TableCell><Badge variant={severityVariant(event.severity)}>{event.severity}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{event.ipAddress ?? "n/a"}</TableCell>
                      <TableCell>{format(new Date(event.detectedAt), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell className="text-right">
                        {event.status === "OPEN" ? (
                          <Button size="sm" variant="outline" onClick={() => void handleAcknowledge(event.id)}>
                            Acknowledge
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Handled</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No security events matched the current filter.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.action}</div>
                        <div className="text-xs text-muted-foreground">{row.path ?? "n/a"}</div>
                      </TableCell>
                      <TableCell>{row.module ?? "n/a"}</TableCell>
                      <TableCell>{row.method ?? "n/a"}</TableCell>
                      <TableCell>{row.statusCode ?? "n/a"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ipAddress ?? "n/a"}</TableCell>
                      <TableCell>{format(new Date(row.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No audit records available.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewCompliance ? (
          <TabsContent value="compliance">
            <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>ISO 27001 Control Coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {compliance?.controls.map((control) => (
                    <div key={control.key} className="rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{control.key.replace(/_/g, " ")}</div>
                        <Badge variant={control.status === "implemented" ? "default" : "secondary"}>
                          {control.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{control.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Configuration Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">JWT Issuer</span>
                    <span className="font-medium">{compliance?.configuration.jwtIssuer ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Session Max Hours</span>
                    <span className="font-medium">{compliance?.configuration.sessionMaxHours ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Captcha Threshold</span>
                    <span className="font-medium">{compliance?.configuration.captchaThreshold ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Lockout Threshold</span>
                    <span className="font-medium">{compliance?.configuration.lockoutThreshold ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">SMTP Configured</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.smtpConfigured ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Security Alert Emails</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.securityAlertEmailsConfigured ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm">Signed Critical APIs</span>
                    <Verified className={`h-4 w-4 ${compliance?.configuration.requestSignatureEnabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
