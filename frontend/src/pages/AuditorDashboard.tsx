import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { httpRequest } from '@/api/http';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldCheck, Activity, BarChart, Clock } from 'lucide-react';

export default function AuditorDashboard() {
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['auditor-metrics'],
    queryFn: () => httpRequest<any>('/auditor/compliance-metrics', { method: 'GET' }),
    select: (res) => res.data
  });

  const { data: timelineData, isLoading: loadingTimeline } = useQuery({
    queryKey: ['auditor-timeline'],
    queryFn: () => httpRequest<any>('/auditor/timeline', { method: 'GET' }),
    select: (res) => res.data?.timeline
  });

  if (loadingMetrics || loadingTimeline) return <div className="p-8">Loading Auditor Dashboard...</div>;

  return (
    <PageShell>
      <PageHeader
        title="Auditor Dashboard"
        description="Read-only compliance metrics and enterprise approval timeline."
        icon={ShieldCheck}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 mt-4">
        <Card className="col-span-1 border-primary/20 bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">PM Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.pmCompliance || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">{metrics?.completedPms} / {metrics?.totalPms} Completed</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">PD Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.pdCompliance || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">{metrics?.completedPds} / {metrics?.totalPds} Completed</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Calibration Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.calibrationCompliance || 0}%</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Production Log Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.productionCompliance || 0}%</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12 items-center justify-start rounded-md p-1 bg-muted/50 max-w-md">
          <TabsTrigger value="timeline" className="flex items-center gap-2 h-full"><Clock className="h-4 w-4"/> Approval Timeline</TabsTrigger>
          <TabsTrigger value="evidence" className="flex items-center gap-2 h-full"><Activity className="h-4 w-4"/> Evidence Repository</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Enterprise Approval & Revision Timeline</CardTitle>
              <CardDescription>Chronological list of all Maker-Checker events</CardDescription>
            </CardHeader>
            <CardContent>
              {timelineData?.length === 0 ? <p className="text-sm text-muted-foreground">No timeline events found.</p> : (
                <div className="space-y-6 border-l-2 border-muted ml-4 pl-6 relative">
                  {timelineData?.map((item: any, i: number) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-primary ring-4 ring-background flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-background" />
                      </div>
                      {item.type === 'EXECUTION' ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">EXECUTION APPROVAL</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleString()}</span>
                          </div>
                          <p className="font-medium text-sm">{item.data.executionType.replace('_', ' ')} - {item.data.status}</p>
                          <p className="text-sm text-muted-foreground mt-1">Submitted by: {item.data.submittedByUser?.fullName || 'System'}</p>
                          {item.data.level1ApproverUser && (
                            <p className="text-sm text-muted-foreground">L1 Approved by: {item.data.level1ApproverUser.fullName}</p>
                          )}
                          {item.data.level2ApproverUser && (
                            <p className="text-sm text-muted-foreground">L2 Approved by: {item.data.level2ApproverUser.fullName}</p>
                          )}
                          {item.data.comments && (
                            <p className="text-sm mt-2 bg-muted p-2 rounded border">{item.data.comments}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary">MASTER DATA REVISION</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleString()}</span>
                          </div>
                          <p className="font-medium text-sm">{item.data.entityName} {item.data.action}</p>
                          <p className="text-sm text-muted-foreground mt-1">Changed by: {item.data.changedByUser?.fullName || 'System'}</p>
                          {item.data.reason && (
                            <p className="text-sm mt-2 bg-muted p-2 rounded border">{item.data.reason}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Evidence Repository</CardTitle>
              <CardDescription>Digitally signed logs and executed checklists</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <h3 className="text-lg font-medium">Evidence Repository Integration</h3>
                <p className="text-muted-foreground max-w-sm mt-2">
                  All executed records are securely hashed and stored in the database. Filterable views are coming in the next release.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
