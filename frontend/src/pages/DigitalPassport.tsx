import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { httpRequest } from '@/api/http';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, Calendar, Wrench, ShieldCheck, Activity, ChevronLeft, ScrollText } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

export default function DigitalPassport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAccessModule } = usePermissions();

  const { data: passport, isLoading, error } = useQuery({
    queryKey: ['asset-passport', id],
    queryFn: () => httpRequest<any>(`/assets/${id}/passport`, { method: 'GET' }),
    select: (res) => res.data?.data,
    enabled: !!id
  });

  if (isLoading) return <div className="p-8">Loading Passport Data...</div>;
  if (error || !passport) return <div className="p-8">Error loading passport data or Asset not found.</div>;

  const { profile, workOrders, pmHistory, logHistory, approvalHistory, revisionHistory, compliance } = passport;

  return (
    <PageShell>
      <div className="mb-4 flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Machine Digital Passport</h1>
          <p className="text-muted-foreground">{profile.name} ({profile.assetCode}) - {profile.status}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card className="col-span-1 border-primary/20 bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">PM Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{compliance.pmCompliance}%</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Work Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{workOrders?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">PM Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pmHistory?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Log Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{logHistory?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 items-center justify-start rounded-md p-1 bg-muted/50">
          <TabsTrigger value="overview" className="flex items-center gap-2 h-full"><Activity className="h-4 w-4"/> Overview</TabsTrigger>
          <TabsTrigger value="work-orders" className="flex items-center gap-2 h-full"><Wrench className="h-4 w-4"/> Work Orders</TabsTrigger>
          <TabsTrigger value="pms" className="flex items-center gap-2 h-full"><Calendar className="h-4 w-4"/> PM & PD</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2 h-full"><ScrollText className="h-4 w-4"/> Log History</TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2 h-full"><ShieldCheck className="h-4 w-4"/> Audit & Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Asset Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{profile.category || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Manufacturer</p>
                  <p className="font-medium">{profile.manufacturer || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="font-medium">{profile.model || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Serial Number</p>
                  <p className="font-medium">{profile.serialNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Installation Date</p>
                  <p className="font-medium">{profile.installationDate ? new Date(profile.installationDate).toLocaleDateString() : '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work-orders" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Work Order History</CardTitle>
            </CardHeader>
            <CardContent>
              {workOrders?.length === 0 ? <p className="text-sm text-muted-foreground">No work orders recorded.</p> : (
                <div className="space-y-4">
                  {workOrders?.map((wo: any) => (
                    <div key={wo.id} className="flex justify-between items-center p-3 border rounded-md">
                      <div>
                        <p className="font-medium">{wo.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(wo.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge>{wo.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pms" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>PM / PD History</CardTitle>
            </CardHeader>
            <CardContent>
              {pmHistory?.length === 0 ? <p className="text-sm text-muted-foreground">No PM history.</p> : (
                <div className="space-y-4">
                  {pmHistory?.map((pm: any) => (
                    <div key={pm.id} className="flex justify-between items-center p-3 border rounded-md">
                      <div>
                        <p className="font-medium">{pm.title || 'Routine Maintenance'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(pm.scheduledDate || pm.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Badge variant={pm.status === 'COMPLETED' ? 'secondary' : 'default'}>{pm.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {logHistory?.length === 0 ? <p className="text-sm text-muted-foreground">No logs recorded.</p> : (
                <div className="space-y-4">
                  {logHistory?.map((log: any) => (
                    <div key={log.id} className="flex justify-between items-center p-3 border rounded-md">
                      <div>
                        <p className="font-medium">Log Entry</p>
                        <p className="text-xs text-muted-foreground">{new Date(log.entryDate || log.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline">Recorded</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Approval History</CardTitle>
              <CardDescription>Execution governance timeline</CardDescription>
            </CardHeader>
            <CardContent>
              {approvalHistory?.length === 0 ? <p className="text-sm text-muted-foreground">No approvals associated with this asset.</p> : (
                <div className="space-y-4 border-l-2 border-muted ml-3 pl-4">
                  {approvalHistory?.map((exec: any) => (
                    <div key={exec.id} className="relative">
                      <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                      <p className="font-medium">{exec.executionType.replace('_', ' ')} - {exec.status}</p>
                      <p className="text-xs text-muted-foreground">Submitted: {new Date(exec.createdAt).toLocaleString()}</p>
                      {exec.comments && <p className="text-sm mt-1 bg-muted p-2 rounded">{exec.comments}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revision History</CardTitle>
              <CardDescription>Master data audit trails</CardDescription>
            </CardHeader>
            <CardContent>
              {revisionHistory?.length === 0 ? <p className="text-sm text-muted-foreground">No revisions.</p> : (
                <div className="space-y-4">
                  {revisionHistory?.map((rev: any) => (
                    <div key={rev.id} className="p-3 border rounded-md">
                      <p className="font-medium text-sm">Action: {rev.action}</p>
                      <p className="text-xs text-muted-foreground">Date: {new Date(rev.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
