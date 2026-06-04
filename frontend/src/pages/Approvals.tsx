import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { governanceApi, ChangeRequest, PendingExecution } from '../api/governance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function Approvals() {
  const [mainTab, setMainTab] = useState('masters');
  const [subTab, setSubTab] = useState('pending');
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | PendingExecution | null>(null);
  const [comments, setComments] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Master Changes Queries
  const { data: pendingMastersData, isLoading: isLoadingPendingMasters } = useQuery({
    queryKey: ['approvals', 'masters', 'pending'],
    queryFn: () => governanceApi.getApprovals({ status: 'PENDING_L1', page: 1, limit: 100 }),
    select: (res) => res.data.data,
    enabled: mainTab === 'masters' && subTab === 'pending'
  });

  const { data: approvedMastersData, isLoading: isLoadingApprovedMasters } = useQuery({
    queryKey: ['approvals', 'masters', 'history'],
    queryFn: () => governanceApi.getApprovals({ status: 'APPROVED', page: 1, limit: 100 }),
    select: (res) => res.data.data,
    enabled: mainTab === 'masters' && subTab === 'history'
  });

  // Execution Queries
  const { data: pendingExecutionsData, isLoading: isLoadingPendingExecutions } = useQuery({
    queryKey: ['approvals', 'executions', 'pending'],
    queryFn: () => governanceApi.getExecutionApprovals({ status: 'PENDING_L1', page: 1, limit: 100 }),
    select: (res) => res.data.data,
    enabled: mainTab === 'executions' && subTab === 'pending'
  });

  const { data: approvedExecutionsData, isLoading: isLoadingApprovedExecutions } = useQuery({
    queryKey: ['approvals', 'executions', 'history'],
    queryFn: () => governanceApi.getExecutionApprovals({ status: 'APPROVED', page: 1, limit: 100 }),
    select: (res) => res.data.data,
    enabled: mainTab === 'executions' && subTab === 'history'
  });

  const approveMutation = useMutation({
    mutationFn: () => mainTab === 'masters' 
      ? governanceApi.approveRequest(selectedRequest!.id, comments)
      : governanceApi.approveExecution(selectedRequest!.id, comments),
    onSuccess: () => {
      toast({ title: 'Approved successfully' });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setSelectedRequest(null);
      setComments('');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => mainTab === 'masters'
      ? governanceApi.rejectRequest(selectedRequest!.id, comments)
      : governanceApi.rejectExecution(selectedRequest!.id, comments),
    onSuccess: () => {
      toast({ title: 'Rejected successfully' });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setSelectedRequest(null);
      setComments('');
    },
  });

  const isChangeRequest = (req: any): req is ChangeRequest => req.moduleType !== undefined;

  const renderCard = (request: ChangeRequest | PendingExecution) => (
    <Card key={request.id} className="mb-4">
      <CardContent className="pt-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{isChangeRequest(request) ? request.moduleType : request.executionType}</Badge>
            {isChangeRequest(request) && (
              <Badge variant={request.actionType === 'DELETE' ? 'destructive' : request.actionType === 'UPDATE' ? 'secondary' : 'default'}>
                {request.actionType}
              </Badge>
            )}
            <Badge variant={request.status.includes('PENDING') ? 'outline' : 'secondary'}>
              {request.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-sm font-medium">Submitted by: {request.submittedBy?.fullName || 'System'}</p>
          <p className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString()}</p>
        </div>
        <Button variant="outline" onClick={() => setSelectedRequest(request)}>
          View Details
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approval Inbox</h1>
        <p className="text-muted-foreground">Review and approve changes for Masters and Execution Logs.</p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="masters">Master Changes (PM, Calibration, Log Templates)</TabsTrigger>
          <TabsTrigger value="executions">Execution Approvals (Logs, PM/PD Completion)</TabsTrigger>
        </TabsList>
        
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList>
            <TabsTrigger value="pending">Pending Review</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {mainTab === 'masters' ? (
              <>
                {isLoadingPendingMasters ? <p>Loading...</p> : pendingMastersData?.map(renderCard)}
                {pendingMastersData?.length === 0 && <p className="text-muted-foreground">No pending master requests.</p>}
              </>
            ) : (
              <>
                {isLoadingPendingExecutions ? <p>Loading...</p> : pendingExecutionsData?.map(renderCard)}
                {pendingExecutionsData?.length === 0 && <p className="text-muted-foreground">No pending execution requests.</p>}
              </>
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {mainTab === 'masters' ? (
              <>
                {isLoadingApprovedMasters ? <p>Loading...</p> : approvedMastersData?.map(renderCard)}
                {approvedMastersData?.length === 0 && <p className="text-muted-foreground">No history for master requests.</p>}
              </>
            ) : (
              <>
                {isLoadingApprovedExecutions ? <p>Loading...</p> : approvedExecutionsData?.map(renderCard)}
                {approvedExecutionsData?.length === 0 && <p className="text-muted-foreground">No history for execution requests.</p>}
              </>
            )}
          </TabsContent>
        </Tabs>
      </Tabs>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approval Details</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <h4 className="font-semibold mb-2">Payload Data:</h4>
            <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-[300px]">
              {JSON.stringify(selectedRequest?.payload, null, 2)}
            </pre>
            
            {selectedRequest?.comments && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Previous Comments:</h4>
                <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                  {selectedRequest.comments}
                </div>
              </div>
            )}

            {selectedRequest?.status.includes('PENDING') && (
              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium">Approval / Rejection Comments</label>
                <Textarea 
                  value={comments} 
                  onChange={(e) => setComments(e.target.value)} 
                  placeholder="Optional for approval, required for rejection..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            {selectedRequest?.status.includes('PENDING') ? (
              <>
                <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={!comments || rejectMutation.isPending}>
                  Reject
                </Button>
                <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                  Approve
                </Button>
              </>
            ) : (
              <Button onClick={() => setSelectedRequest(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
