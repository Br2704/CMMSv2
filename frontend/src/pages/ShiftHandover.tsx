import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { httpRequest } from '@/api/http';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ShiftHandover {
  id: string;
  shiftId: string;
  shiftName: string;
  departmentId: string | null;
  departmentName: string | null;
  pendingWoCount: number;
  pendingPmCount: number;
  pendingPdCount: number;
  pendingLogsCount: number;
  machineStatusSummary: Record<string, number>;
  followUpActions: string | null;
  status: string;
  handedOverBy: string;
  receivedBy: string | null;
  createdAt: string;
}

export default function ShiftHandover() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [followUpActions, setFollowUpActions] = useState('');

  const { data: shifts } = useQuery({
    queryKey: ['shifts-all'],
    queryFn: () => httpRequest<any>('/shifts', { method: 'GET' }),
    select: (res) => res.data?.data || [],
  });

  const { data: handovers, isLoading: isLoadingHandovers } = useQuery({
    queryKey: ['shift-handovers'],
    queryFn: () => httpRequest<any>('/shift-handovers', { method: 'GET' }),
    select: (res) => res.data?.data || [],
  });

  const generateMutation = useMutation({
    mutationFn: () => httpRequest<any>('/shift-handovers/generate', { 
      method: 'POST', 
      body: JSON.stringify({ shiftId: selectedShiftId })
    }),
    onSuccess: (res) => {
      // Prompt user to submit handover with this data
      submitHandoverMutation.mutate(res.data.data);
    }
  });

  const submitHandoverMutation = useMutation({
    mutationFn: (data: any) => httpRequest<any>('/shift-handovers', {
      method: 'POST',
      body: JSON.stringify({
        shiftId: selectedShiftId,
        pendingWoCount: data.pendingWoCount,
        pendingPmCount: data.pendingPmCount,
        pendingPdCount: data.pendingPdCount,
        pendingLogsCount: data.pendingLogsCount,
        machineStatusSummary: data.machineStatusSummary,
        followUpActions: followUpActions
      })
    }),
    onSuccess: () => {
      toast({ title: 'Shift Handover Submitted' });
      queryClient.invalidateQueries({ queryKey: ['shift-handovers'] });
      setFollowUpActions('');
      setSelectedShiftId('');
    }
  });

  const receiveHandoverMutation = useMutation({
    mutationFn: (id: string) => httpRequest<any>(`/shift-handovers/${id}/receive`, {
      method: 'POST'
    }),
    onSuccess: () => {
      toast({ title: 'Shift Handover Received' });
      queryClient.invalidateQueries({ queryKey: ['shift-handovers'] });
    }
  });

  return (
    <PageShell>
      <PageHeader title="Shift Handover" subtitle="Manage shift transitions and operational continuity." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Create Handover</CardTitle>
            <CardDescription>Generate end-of-shift handover summary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Shift</label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift..." />
                </SelectTrigger>
                <SelectContent>
                  {shifts?.map((shift: any) => (
                    <SelectItem key={shift.id} value={shift.id}>{shift.shiftName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Follow-Up Actions</label>
              <Textarea 
                placeholder="Important notes for the next shift..." 
                value={followUpActions} 
                onChange={e => setFollowUpActions(e.target.value)}
                rows={4}
              />
            </div>

            <Button 
              className="w-full" 
              onClick={() => generateMutation.mutate()} 
              disabled={!selectedShiftId || generateMutation.isPending || submitHandoverMutation.isPending}
            >
              Generate & Submit Handover
            </Button>
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle>Recent Handovers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHandovers ? <p>Loading...</p> : (
              <div className="space-y-4">
                {handovers?.length === 0 && <p className="text-muted-foreground text-sm">No handovers found.</p>}
                {handovers?.map((handover: ShiftHandover) => (
                  <div key={handover.id} className="p-4 rounded-lg border">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-semibold">{handover.shiftName || `Shift Handover`}</h4>
                        <p className="text-sm text-muted-foreground">{new Date(handover.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant={handover.status === 'COMPLETED' ? 'secondary' : 'default'}>
                        {handover.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="p-3 bg-muted rounded-md text-center">
                        <div className="text-2xl font-bold">{handover.pendingWoCount}</div>
                        <div className="text-xs text-muted-foreground">Open WOs</div>
                      </div>
                      <div className="p-3 bg-muted rounded-md text-center">
                        <div className="text-2xl font-bold">{handover.pendingPmCount + handover.pendingPdCount}</div>
                        <div className="text-xs text-muted-foreground">Pending PM/PD</div>
                      </div>
                      <div className="p-3 bg-muted rounded-md text-center">
                        <div className="text-2xl font-bold">{handover.pendingLogsCount}</div>
                        <div className="text-xs text-muted-foreground">Pending Logs</div>
                      </div>
                      <div className="p-3 bg-muted rounded-md text-center">
                        <div className="text-2xl font-bold">
                          {Object.keys(handover.machineStatusSummary || {}).length}
                        </div>
                        <div className="text-xs text-muted-foreground">Machine Statuses</div>
                      </div>
                    </div>

                    {handover.followUpActions && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-1">Notes / Follow Ups</p>
                        <p className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
                          {handover.followUpActions}
                        </p>
                      </div>
                    )}

                    {handover.status === 'PENDING_RECEIPT' && (
                      <Button onClick={() => receiveHandoverMutation.mutate(handover.id)} disabled={receiveHandoverMutation.isPending}>
                        Acknowledge & Receive
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
