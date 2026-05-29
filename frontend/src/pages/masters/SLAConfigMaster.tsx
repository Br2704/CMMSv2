import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { httpRequest } from '@/api/http';
import { useToast } from '@/hooks/use-toast';
import {
  Clock, Plus, Pencil, Loader2, History, ShieldAlert, AlertTriangle,
  CheckCircle2, Gauge, ArrowUpRight, Bell, XCircle, Save, Trash2, Eye
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  CRITICAL: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 border-red-200 dark:bg-red-500/15 dark:border-red-500/40', label: 'Critical', icon: '🔴' },
  HIGH: { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 border-orange-200 dark:bg-orange-500/15 dark:border-orange-500/40', label: 'High', icon: '🟠' },
  MEDIUM: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/15 dark:border-yellow-500/40', label: 'Medium', icon: '🟡' },
  LOW: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-500/15 dark:border-blue-500/40', label: 'Low', icon: '🔵' },
};

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`;
  return `${Math.round(m / 1440)}d ${Math.round((m % 1440) / 60)}h`;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function parseEventList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRuleAlerts(config: Record<string, unknown>): string[] {
  const alerts: string[] = [];
  const emailTargets = normalizeText(config.notificationEmail);
  const eventTargets = parseEventList(config.sendEmailOn);

  if (!config.isActive) {
    alerts.push('Inactive');
  }
  if (!emailTargets || eventTargets.length === 0) {
    alerts.push('Notifications disabled');
  }
  if (
    Number(config.responseTimeMinutes ?? 0) > Number(config.acknowledgementTimeMinutes ?? 0) ||
    Number(config.acknowledgementTimeMinutes ?? 0) > Number(config.closureTimeMinutes ?? 0)
  ) {
    alerts.push('Timer order looks unusual');
  }
  if (![1, 2, 3, 4].some((level) => normalizeText(config[`escalationRole${level}`]))) {
    alerts.push('No escalation roles mapped');
  }

  return alerts;
}

export default function SLAConfigMaster() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<Array<Record<string, unknown>>>([]);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [editDialog, setEditDialog] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewItem, setPreviewItem] = useState<Record<string, unknown> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: Array<Record<string, unknown>> }>('/sla/config?includeInactive=true', { method: 'GET' });
      if (Array.isArray(res.data)) setConfigs(res.data);
    } catch (e) { console.error('fetchConfigs failed:', e); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: { items: Array<Record<string, unknown>> } }>('/escalation/history?page=1&limit=100', { method: 'GET' });
      if (res.data?.items) setHistory(res.data.items);
    } catch (e) { console.error('fetchHistory failed:', e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: Record<string, unknown> }>('/sla/stats', { method: 'GET' });
      if (res.data) setStats(res.data);
    } catch (e) { console.error('fetchStats failed:', e); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfigs(), fetchHistory(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchConfigs, fetchHistory, fetchStats]);

  const handleSave = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      if ((editItem as any).id) {
        await httpRequest(`/sla/config/${(editItem as any).id}`, { method: 'PUT', body: JSON.stringify(editItem) });
        toast({ title: 'SLA rule updated' });
      } else {
        await httpRequest('/sla/config', { method: 'POST', body: JSON.stringify(editItem) });
        toast({ title: 'SLA rule created' });
      }
      setEditDialog(false);
      setEditItem(null);
      await Promise.all([fetchConfigs(), fetchStats()]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: Record<string, unknown>) => {
    try {
      await httpRequest(`/sla/config/${(item as any).id}`, { method: 'PUT', body: JSON.stringify({ isActive: !(item as any).isActive }) });
      toast({ title: (item as any).isActive ? 'SLA rule deactivated' : 'SLA rule activated' });
      await fetchConfigs();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    }
  };

  const openNew = () => {
    setEditItem({ scope: 'GLOBAL', priority: 'MEDIUM', responseTimeMinutes: 30, acknowledgementTimeMinutes: 15, closureTimeMinutes: 480, escalation1Minutes: 30, escalation2Minutes: 60, escalation3Minutes: 120, escalation4Minutes: 240, reminderIntervalMinutes: 60, isActive: true });
    setEditDialog(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditItem({ ...item });
    setEditDialog(true);
  };

  const openPreview = (item: Record<string, unknown>) => {
    setPreviewItem({ ...item });
    setPreviewDialog(true);
  };

  const handleDelete = async (item: Record<string, unknown>) => {
    const id = String(item.id ?? '');
    if (!id) return;

    const confirmed = window.confirm(`Delete SLA rule ${String(item.scope ?? 'rule')} for ${String(item.priority ?? 'priority')}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await httpRequest(`/sla/config/${id}`, { method: 'DELETE' });
      toast({ title: 'SLA rule deleted' });
      await Promise.all([fetchConfigs(), fetchHistory(), fetchStats()]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    }
  };

  const filteredConfigs = useMemo(() => {
    return configs.filter((config) => {
      const haystack = [
        config.scope,
        config.scopeValue,
        config.priority,
        config.description,
        config.notificationEmail,
        config.sendEmailOn,
      ]
        .map(normalizeText)
        .join(' ');

      const matchesSearch = !searchTerm || haystack.includes(normalizeText(searchTerm));
      const matchesScope = scopeFilter === 'ALL' || String(config.scope ?? '') === scopeFilter;
      const matchesPriority = priorityFilter === 'ALL' || String(config.priority ?? '') === priorityFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && Boolean(config.isActive)) ||
        (statusFilter === 'INACTIVE' && !config.isActive) ||
        (statusFilter === 'NOTIFICATION_READY' && normalizeText(config.notificationEmail) && parseEventList(config.sendEmailOn).length > 0) ||
        (statusFilter === 'NO_ALERTS' && (!normalizeText(config.notificationEmail) || parseEventList(config.sendEmailOn).length === 0));

      return matchesSearch && matchesScope && matchesPriority && matchesStatus;
    });
  }, [configs, priorityFilter, scopeFilter, searchTerm, statusFilter]);

  const ruleSummary = useMemo(() => {
    const total = configs.length;
    const active = configs.filter((config) => Boolean(config.isActive)).length;
    const notificationReady = configs.filter((config) => normalizeText(config.notificationEmail) && parseEventList(config.sendEmailOn).length > 0).length;
    const avgResponse = total > 0 ? Math.round(configs.reduce((sum, config) => sum + Number(config.responseTimeMinutes ?? 0), 0) / total) : 0;

    return { total, active, inactive: total - active, notificationReady, avgResponse };
  }, [configs]);

  const clearFilters = () => {
    setSearchTerm('');
    setScopeFilter('ALL');
    setPriorityFilter('ALL');
    setStatusFilter('ALL');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const slaComplianceRate = (stats as any).slaComplianceRate ?? 100;
  const complianceColor = slaComplianceRate >= 90 ? 'text-green-600 dark:text-green-400' : slaComplianceRate >= 70 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
            <Gauge className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">SLA & Escalation Engine</h1>
            <p className="text-sm text-muted-foreground font-medium">Precision response management & automated accountability</p>
          </div>
        </div>
        <Button onClick={openNew} className="gradient-primary shadow-glow h-10 px-6 rounded-xl font-bold">
          <Plus className="h-4 w-4 mr-2" />
          New SLA Rule
        </Button>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total Rules</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{ruleSummary.total}</p></CardContent></Card>
        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Active Rules</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{ruleSummary.active}</p></CardContent></Card>
        <Card className="border-l-4 border-l-violet-500 dark:border-l-violet-400"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Notification Ready</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{ruleSummary.notificationReady}</p></CardContent></Card>
        <Card className="border-l-4 border-l-cyan-500 dark:border-l-cyan-400"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Avg Response</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{formatMinutes(ruleSummary.avgResponse)}</p></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">SLA Compliance</CardTitle></CardHeader><CardContent><p className={`text-2xl font-bold ${complianceColor}`}>{slaComplianceRate}%</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={`border-l-4 ${(stats as any).overdueWOs > 0 ? 'border-l-red-500 dark:border-l-red-400' : 'border-l-green-500 dark:border-l-green-400'}`}>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Overdue WOs</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><p className={`text-2xl font-bold ${(stats as any).overdueWOs > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{(stats as any).overdueWOs ?? 0}</p>{(stats as any).overdueWOs > 0 && <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />}</CardContent>
        </Card>
        <Card className={`border-l-4 ${(stats as any).escalatedWOs > 0 ? 'border-l-orange-500 dark:border-l-orange-400' : 'border-l-gray-300 dark:border-l-slate-700'}`}>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Escalated</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><p className={`text-2xl font-bold ${(stats as any).escalatedWOs > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-muted-foreground'}`}>{(stats as any).escalatedWOs ?? 0}</p>{(stats as any).escalatedWOs > 0 && <ArrowUpRight className="h-4 w-4 text-orange-500 dark:text-orange-400" />}</CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-500 dark:border-l-slate-400">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Inactive Rules</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{ruleSummary.inactive}</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 dark:border-l-rose-400">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Open WOs</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{(stats as any).openWOs ?? 0}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules"><Gauge className="h-4 w-4 mr-2" />SLA Rules</TabsTrigger>
          <TabsTrigger value="matrix"><ShieldAlert className="h-4 w-4 mr-2" />Escalation Matrix</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-2" />Escalation History</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr]">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Search</Label>
                  <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search scope, priority, description, emails, or events" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Scope</Label>
                  <Select value={scopeFilter} onValueChange={setScopeFilter}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All scopes</SelectItem>
                      <SelectItem value="GLOBAL">Global</SelectItem>
                      <SelectItem value="PRIORITY">Priority</SelectItem>
                      <SelectItem value="DEPARTMENT">Department</SelectItem>
                      <SelectItem value="CATEGORY">Category</SelectItem>
                      <SelectItem value="ASSET_CRITICALITY">Asset Criticality</SelectItem>
                      <SelectItem value="PLANT">Plant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All priorities</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All rules</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="NOTIFICATION_READY">Notification ready</SelectItem>
                      <SelectItem value="NO_ALERTS">No alerts configured</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Showing {filteredConfigs.length} of {configs.length} rules
                </p>
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              </div>
            </CardContent>
          </Card>

          {configs.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center"><Gauge className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-medium">No SLA rules configured</h3><p className="text-sm text-muted-foreground mt-1">Create your first SLA rule to start tracking response and resolution times.</p><Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add SLA Rule</Button></CardContent></Card>
          ) : filteredConfigs.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center"><Gauge className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-medium">No rules match your filters</h3><p className="text-sm text-muted-foreground mt-1">Broaden the search or reset the filters to see all SLA rules.</p><Button className="mt-4" variant="outline" onClick={clearFilters}>Reset filters</Button></CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredConfigs.map((config) => {
                const pc = PRIORITY_CONFIG[(config as any).priority as string] || PRIORITY_CONFIG.MEDIUM;
                const alerts = getRuleAlerts(config);
                return (
                  <Card key={String((config as any).id)} className={`${(config as any).isActive ? '' : 'opacity-60'} hover:shadow-md transition-shadow`}>
                    <CardHeader className="pb-2 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{(config as any).scope}</Badge>
                          {(config as any).scopeValue && <Badge variant="secondary" className="text-xs">{(config as any).scopeValue}</Badge>}
                        </div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className={pc.color}>{pc.icon}</span>
                          <span>{pc.label}</span>
                        </CardTitle>
                        {(config as any).description && <CardDescription className="text-xs">{(config as any).description}</CardDescription>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openPreview(config)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(config)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(config)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        <Switch checked={(config as any).isActive} onCheckedChange={() => toggleActive(config)} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 bg-blue-50 rounded-lg dark:bg-blue-500/15"><p className="font-semibold text-blue-700 dark:text-blue-200">{formatMinutes((config as any).responseTimeMinutes)}</p><p className="text-blue-600/70 dark:text-blue-200/70 mt-0.5">Response</p></div>
                        <div className="p-2 bg-purple-50 rounded-lg dark:bg-purple-500/15"><p className="font-semibold text-purple-700 dark:text-purple-200">{formatMinutes((config as any).acknowledgementTimeMinutes)}</p><p className="text-purple-600/70 dark:text-purple-200/70 mt-0.5">Ack</p></div>
                        <div className="p-2 bg-green-50 rounded-lg dark:bg-green-500/15"><p className="font-semibold text-green-700 dark:text-green-200">{formatMinutes((config as any).closureTimeMinutes)}</p><p className="text-green-600/70 dark:text-green-200/70 mt-0.5">Closure</p></div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"><Bell className="h-3 w-3" />Escalation Ladder</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map((l) => {
                            const mins = (config as any)[`escalation${l}Minutes`];
                            const active = (config as any).escalation_level >= l;
                            return (
                              <div key={l} className={`flex-1 text-center py-1 px-1 rounded text-[10px] font-medium ${active ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200' : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                L{l} {mins ? formatMinutes(mins) : '-'}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Reminder: {formatMinutes((config as any).reminderIntervalMinutes)}</span>
                        <span>{(config as any).isActive ? <Badge className="bg-green-100 text-green-700 text-[10px] dark:bg-green-500/20 dark:text-green-200">Active</Badge> : <Badge variant="outline" className="text-[10px]">Inactive</Badge>}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {alerts.length === 0 ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-200">Healthy</Badge>
                        ) : (
                          alerts.map((alert) => (
                            <Badge key={alert} variant="outline" className="text-[10px] text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200">{alert}</Badge>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Escalation Matrix</CardTitle><CardDescription>Visual overview of escalation levels across all priority tiers</CardDescription></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Priority</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Ack</TableHead>
                      <TableHead>Closure</TableHead>
                      <TableHead className="text-red-600 dark:text-red-400">Esc L1</TableHead>
                      <TableHead className="text-orange-600 dark:text-orange-400">Esc L2</TableHead>
                      <TableHead className="text-yellow-600 dark:text-yellow-400">Esc L3</TableHead>
                      <TableHead className="text-gray-600 dark:text-muted-foreground">Esc L4</TableHead>
                      <TableHead>Reminder</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConfigs.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No SLA configurations match the current filters</TableCell></TableRow>}
                    {filteredConfigs.map((config) => (
                      <TableRow key={String((config as any).id)} className={!(config as any).isActive ? 'opacity-50' : ''}>
                        <TableCell><Badge className={PRIORITY_CONFIG[(config as any).priority as string]?.bg || ''} variant="outline">{(config as any).priority}</Badge></TableCell>
                        <TableCell className="text-xs">{(config as any).scope}{(config as any).scopeValue ? `: ${(config as any).scopeValue}` : ''}</TableCell>
                        <TableCell className="text-xs font-mono">{formatMinutes((config as any).responseTimeMinutes)}</TableCell>
                        <TableCell className="text-xs font-mono">{formatMinutes((config as any).acknowledgementTimeMinutes)}</TableCell>
                        <TableCell className="text-xs font-mono">{formatMinutes((config as any).closureTimeMinutes)}</TableCell>
                        <TableCell className="text-xs font-mono text-red-600 dark:text-red-400">{formatMinutes((config as any).escalation1Minutes)}</TableCell>
                        <TableCell className="text-xs font-mono text-orange-600 dark:text-orange-400">{formatMinutes((config as any).escalation2Minutes)}</TableCell>
                        <TableCell className="text-xs font-mono text-yellow-600 dark:text-yellow-400">{formatMinutes((config as any).escalation3Minutes)}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-600 dark:text-muted-foreground">{formatMinutes((config as any).escalation4Minutes)}</TableCell>
                        <TableCell className="text-xs font-mono">{formatMinutes((config as any).reminderIntervalMinutes)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openPreview(config)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(config)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(config)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            <Switch checked={(config as any).isActive} onCheckedChange={() => toggleActive(config)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Escalation History</CardTitle><CardDescription>Log of all work order escalations and reminders</CardDescription></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Triggered At</TableHead>
                      <TableHead>Reminders</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No escalation history</TableCell></TableRow>}
                    {history.map((entry) => (
                      <TableRow key={String((entry as any).id)}>
                        <TableCell className="font-mono text-xs font-medium">{(entry as any).woNumber}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            (entry as any).level >= 3 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200' : (entry as any).level >= 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-200'
                          }`}>L{(entry as any).level}</span>
                        </TableCell>
                        <TableCell className="text-xs">{(entry as any).triggerType}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{new Date((entry as any).triggeredAt).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{(entry as any).reminderCount > 0 ? <Badge variant="outline">{`${(entry as any).reminderCount}x`}</Badge> : '-'}</TableCell>
                        <TableCell>{(entry as any).resolved ? <Badge className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200">Resolved</Badge> : <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-200">Active</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{((entry as any).notifiedUsers || []).length} users, {((entry as any).notifiedEmails || []).length} emails</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">SLA Rule Preview</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">{String(previewItem.scope ?? 'GLOBAL')}</Badge>
                {previewItem.scopeValue && <Badge variant="secondary" className="text-xs">{String(previewItem.scopeValue)}</Badge>}
                <Badge className={PRIORITY_CONFIG[String(previewItem.priority ?? 'MEDIUM')]?.bg || ''} variant="outline">
                  {String(previewItem.priority ?? 'MEDIUM')}
                </Badge>
                {previewItem.isActive ? <Badge className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Response</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{formatMinutes(Number(previewItem.responseTimeMinutes ?? 0))}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Acknowledgement</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{formatMinutes(Number(previewItem.acknowledgementTimeMinutes ?? 0))}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Closure</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{formatMinutes(Number(previewItem.closureTimeMinutes ?? 0))}</p></CardContent></Card>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {[1, 2, 3, 4].map((level) => (
                  <Card key={level}>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Escalation L{level}</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-sm font-bold">{formatMinutes(Number(previewItem[`escalation${level}Minutes`] ?? 0))}</p>
                      <p className="text-xs text-muted-foreground">{String(previewItem[`escalationRole${level}`] ?? 'No role mapped')}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Notification setup</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><span className="font-medium">Targets:</span> {previewItem.notificationEmail ? String(previewItem.notificationEmail) : 'Not configured'}</div>
                  <div><span className="font-medium">Events:</span> {parseEventList(previewItem.sendEmailOn).length > 0 ? parseEventList(previewItem.sendEmailOn).join(', ') : 'Not configured'}</div>
                  <div><span className="font-medium">Reminder:</span> {formatMinutes(Number(previewItem.reminderIntervalMinutes ?? 0))}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Rule health</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {getRuleAlerts(previewItem).length === 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">Healthy</Badge>
                  ) : (
                    getRuleAlerts(previewItem).map((alert) => (
                      <Badge key={alert} variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200">{alert}</Badge>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setPreviewDialog(false)}>Close preview</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-lg">{editItem && (editItem as any).id ? 'Edit SLA Rule' : 'Create SLA Rule'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Scope</Label>
                  <Select value={String((editItem as any).scope)} onValueChange={(v) => setEditItem({ ...editItem, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">🌐 Global (applies to all)</SelectItem>
                      <SelectItem value="PRIORITY">📊 By Priority</SelectItem>
                      <SelectItem value="DEPARTMENT">🏢 By Department</SelectItem>
                      <SelectItem value="CATEGORY">📋 By Category</SelectItem>
                      <SelectItem value="ASSET_CRITICALITY">⚡ By Asset Criticality</SelectItem>
                      <SelectItem value="PLANT">🏭 By Plant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Priority Level</Label>
                  <Select value={String((editItem as any).priority)} onValueChange={(v) => setEditItem({ ...editItem, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CRITICAL">🔴 Critical</SelectItem>
                      <SelectItem value="HIGH">🟠 High</SelectItem>
                      <SelectItem value="MEDIUM">🟡 Medium</SelectItem>
                      <SelectItem value="LOW">🔵 Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium mb-2 block">SLA Timers</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'responseTimeMinutes', label: 'Response SLA', icon: '⚡', color: 'bg-blue-50 border-blue-200 dark:bg-blue-500/15 dark:border-blue-500/40' },
                    { key: 'acknowledgementTimeMinutes', label: 'Acknowledgement', icon: '👀', color: 'bg-purple-50 border-purple-200 dark:bg-purple-500/15 dark:border-purple-500/40' },
                    { key: 'closureTimeMinutes', label: 'Closure SLA', icon: '✅', color: 'bg-green-50 border-green-200 dark:bg-green-500/15 dark:border-green-500/40' },
                  ].map((sla) => (
                    <div key={sla.key} className={`p-3 rounded-lg border ${sla.color}`}>
                      <Label className="text-xs font-medium block mb-1.5">{sla.icon} {sla.label}</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={(editItem as any)[sla.key]} onChange={(e) => setEditItem({ ...editItem, [sla.key]: Number(e.target.value) })} className="h-8 text-sm" />
                        <span className="text-xs text-muted-foreground shrink-0">min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium mb-2 block">Escalation Ladder</Label>
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((l) => {
                    const colors = ['bg-red-50 border-red-200 dark:bg-red-500/15 dark:border-red-500/40', 'bg-orange-50 border-orange-200 dark:bg-orange-500/15 dark:border-orange-500/40', 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/15 dark:border-yellow-500/40', 'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700'];
                    const icons = ['🚨', '⚠️', '⏰', '🔔'];
                    return (
                      <div key={l} className={`p-3 rounded-lg border ${colors[l - 1]}`}>
                        <Label className="text-xs font-medium block mb-1.5">{icons[l - 1]} Level {l}</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={(editItem as any)[`escalation${l}Minutes`]} onChange={(e) => setEditItem({ ...editItem, [`escalation${l}Minutes`]: Number(e.target.value) })} className="h-8 text-sm" />
                          <span className="text-xs text-muted-foreground shrink-0">min</span>
                        </div>
                        <Input
                          className="h-7 text-xs mt-1.5"
                          placeholder="Role (e.g., MANAGER)"
                          value={String((editItem as any)[`escalationRole${l}`] || '')}
                          onChange={(e) => setEditItem({ ...editItem, [`escalationRole${l}`]: e.target.value || null })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Reminder Interval</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={(editItem as any).reminderIntervalMinutes} onChange={(e) => setEditItem({ ...editItem, reminderIntervalMinutes: Number(e.target.value) })} className="h-8" />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Scope Value <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={String((editItem as any).scopeValue || '')} onChange={(e) => setEditItem({ ...editItem, scopeValue: e.target.value })} placeholder="e.g., ELECTRICAL, CRITICAL" className="h-8" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Description</Label>
                <Input value={String((editItem as any).description || '')} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} placeholder="Purpose of this SLA rule" className="h-8" />
              </div>

              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-primary">🔔 Notification & Mail Configuration</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Notification Email(s)</Label>
                    <Input value={String((editItem as any).notificationEmail || '')} onChange={(e) => setEditItem({ ...editItem, notificationEmail: e.target.value })} placeholder="admin@example.com, manager@example.com" className="h-8" />
                    <p className="text-[10px] text-muted-foreground">Comma-separated emails for escalation alerts</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Send Email On</Label>
                    <Select value={String((editItem as any).sendEmailOn || 'ESCALATION')} onValueChange={(v) => setEditItem({ ...editItem, sendEmailOn: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ESCALATION">🚨 Escalation Only</SelectItem>
                        <SelectItem value="REMINDER">⏰ Reminder Only</SelectItem>
                        <SelectItem value="OVERDUE">⚠️ Overdue Only</SelectItem>
                        <SelectItem value="ESCALATION,REMINDER">🚨 Escalation + Reminder</SelectItem>
                        <SelectItem value="ESCALATION,OVERDUE">🚨 Escalation + Overdue</SelectItem>
                        <SelectItem value="REMINDER,OVERDUE">⏰ Reminder + Overdue</SelectItem>
                        <SelectItem value="ESCALATION,REMINDER,OVERDUE">📬 All Events</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditDialog(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? 'Saving...' : (editItem as any).id ? 'Update Rule' : 'Create Rule'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
