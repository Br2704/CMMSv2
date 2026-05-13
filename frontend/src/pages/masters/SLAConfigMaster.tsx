import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { httpRequest } from '@/api/http';
import { useToast } from '@/hooks/use-toast';
import { Clock, Plus, Pencil, Loader2, History } from 'lucide-react';

export default function SLAConfigMaster() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Array<Record<string, unknown>>>([]);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [activeTab, setActiveTab] = useState('config');
  const [editDialog, setEditDialog] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: Array<Record<string, unknown>> }>('/sla/config', { method: 'GET' });
      setConfigs(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: { items: Array<Record<string, unknown>> } }>('/escalation/history?page=1&limit=50', { method: 'GET' });
      setHistory(res.data.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfigs(), fetchHistory()]).finally(() => setLoading(false));
  }, [fetchConfigs, fetchHistory]);

  const handleSave = async () => {
    if (!editItem) return;
    try {
      if ((editItem as any).id) {
        await httpRequest(`/sla/config/${(editItem as any).id}`, { method: 'PUT', body: JSON.stringify(editItem) });
        toast({ title: 'Updated' });
      } else {
        await httpRequest('/sla/config', { method: 'POST', body: JSON.stringify(editItem) });
        toast({ title: 'Created' });
      }
      setEditDialog(false);
      setEditItem(null);
      await fetchConfigs();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SLA Configuration</h1>
          <p className="text-sm text-muted-foreground">Configure response/closure SLAs and escalation rules</p>
        </div>
        <Dialog open={editDialog} onOpenChange={setEditDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditItem({ scope: 'GLOBAL', priority: 'MEDIUM', responseTimeMinutes: 30, acknowledgementTimeMinutes: 15, closureTimeMinutes: 480, escalation1Minutes: 30, escalation2Minutes: 60, escalation3Minutes: 120, escalation4Minutes: 240, reminderIntervalMinutes: 60 })}>
              <Plus className="h-4 w-4 mr-2" />Add SLA Config
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editItem && (editItem as any).id ? 'Edit' : 'New'} SLA Configuration</DialogTitle></DialogHeader>
            {editItem && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <Select value={String((editItem as any).scope)} onValueChange={(v) => setEditItem({ ...editItem, scope: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GLOBAL">Global</SelectItem>
                        <SelectItem value="PRIORITY">By Priority</SelectItem>
                        <SelectItem value="DEPARTMENT">By Department</SelectItem>
                        <SelectItem value="CATEGORY">By Category</SelectItem>
                        <SelectItem value="ASSET_CRITICALITY">By Asset Criticality</SelectItem>
                        <SelectItem value="PLANT">By Plant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={String((editItem as any).priority)} onValueChange={(v) => setEditItem({ ...editItem, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Response SLA (min)</Label>
                    <Input type="number" value={(editItem as any).responseTimeMinutes} onChange={(e) => setEditItem({ ...editItem, responseTimeMinutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ack SLA (min)</Label>
                    <Input type="number" value={(editItem as any).acknowledgementTimeMinutes} onChange={(e) => setEditItem({ ...editItem, acknowledgementTimeMinutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Closure SLA (min)</Label>
                    <Input type="number" value={(editItem as any).closureTimeMinutes} onChange={(e) => setEditItem({ ...editItem, closureTimeMinutes: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Esc L1 (min)</Label>
                    <Input type="number" value={(editItem as any).escalation1Minutes} onChange={(e) => setEditItem({ ...editItem, escalation1Minutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Esc L2 (min)</Label>
                    <Input type="number" value={(editItem as any).escalation2Minutes} onChange={(e) => setEditItem({ ...editItem, escalation2Minutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Esc L3 (min)</Label>
                    <Input type="number" value={(editItem as any).escalation3Minutes} onChange={(e) => setEditItem({ ...editItem, escalation3Minutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Esc L4 (min)</Label>
                    <Input type="number" value={(editItem as any).escalation4Minutes} onChange={(e) => setEditItem({ ...editItem, escalation4Minutes: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reminder Interval (min)</Label>
                    <Input type="number" value={(editItem as any).reminderIntervalMinutes} onChange={(e) => setEditItem({ ...editItem, reminderIntervalMinutes: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Scope Value</Label>
                    <Input value={String((editItem as any).scopeValue || '')} onChange={(e) => setEditItem({ ...editItem, scopeValue: e.target.value })} placeholder="e.g., CRITICAL, ELECTRICAL, ..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={String((editItem as any).description || '')} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} />
                </div>
                <Button onClick={handleSave}>Save</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex gap-2 mb-4">
          <Button variant={activeTab === 'config' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('config')}><Clock className="h-4 w-4 mr-2" />SLA Rules</Button>
          <Button variant={activeTab === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('history')}><History className="h-4 w-4 mr-2" />Escalation History</Button>
        </div>

        {activeTab === 'config' && (
          <Card>
            <CardHeader><CardTitle>SLA Rules</CardTitle><CardDescription>Configure SLA thresholds per scope and priority</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Ack</TableHead>
                    <TableHead>Closure</TableHead>
                    <TableHead>Escalations</TableHead>
                    <TableHead>Reminder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No SLA configurations. Click "Add SLA Config" above.</TableCell></TableRow>}
                  {configs.map((config) => (
                    <TableRow key={String((config as any).id)}>
                      <TableCell><Badge variant="outline">{(config as any).scope}</Badge></TableCell>
                      <TableCell>{(config as any).scopeValue || '-'}</TableCell>
                      <TableCell><Badge>{(config as any).priority}</Badge></TableCell>
                      <TableCell>{(config as any).responseTimeMinutes}m</TableCell>
                      <TableCell>{(config as any).acknowledgementTimeMinutes}m</TableCell>
                      <TableCell>{(config as any).closureTimeMinutes}m</TableCell>
                      <TableCell className="text-xs">L1:{(config as any).escalation1Minutes}m L2:{(config as any).escalation2Minutes}m</TableCell>
                      <TableCell>{(config as any).reminderIntervalMinutes}m</TableCell>
                      <TableCell>{(config as any).isActive ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditItem(config); setEditDialog(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'history' && (
          <Card>
            <CardHeader><CardTitle>Escalation History</CardTitle><CardDescription>Records of all work order escalations</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO #</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Triggered At</TableHead>
                    <TableHead>Reminders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Users Notified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No escalation history</TableCell></TableRow>}
                  {history.map((entry) => (
                    <TableRow key={String((entry as any).id)}>
                      <TableCell className="font-mono text-sm">{(entry as any).woNumber}</TableCell>
                      <TableCell>L{(entry as any).level}</TableCell>
                      <TableCell>{(entry as any).triggerType}</TableCell>
                      <TableCell className="text-xs">{new Date((entry as any).triggeredAt).toLocaleString()}</TableCell>
                      <TableCell>{(entry as any).reminderCount}</TableCell>
                      <TableCell>{(entry as any).resolved ? <Badge className="bg-green-100 text-green-800">Resolved</Badge> : <Badge className="bg-yellow-100 text-yellow-800">Active</Badge>}</TableCell>
                      <TableCell className="text-xs">{((entry as any).notifiedUsers || []).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}
