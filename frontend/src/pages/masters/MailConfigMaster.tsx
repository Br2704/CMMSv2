import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { httpRequest } from '@/api/http';
import { useToast } from '@/hooks/use-toast';
import { Settings, Send, RefreshCw, MailCheck, MailWarning, Loader2, Inbox } from 'lucide-react';

export function MailConfigMaster() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ configured: false, host: '', port: 587, from: '', user: '' });
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ connected?: boolean; error?: string } | null>(null);
  const [stats, setStats] = useState({ pending: 0, processing: 0, sent: 0, failed: 0, deadLetter: 0 });
  const [logs, setLogs] = useState<Array<{ id: string; recipient: string; subject: string; status: string; sentAt: string | null; retryCount: number; deliveryError: string | null }>>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [queueItems, setQueueItems] = useState<Array<{ id: string; recipient: string; subject: string; status: string; retryCount: number; lastError: string | null }>>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [activeTab, setActiveTab] = useState('config');
  const [retrying, setRetrying] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: { configured: boolean; host: string; port: number; from: string; user: string } }>('/mail/config', { method: 'GET' });
      setConfig(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: { pending: number; processing: number; sent: number; failed: number; deadLetter: number } }>('/mail/stats', { method: 'GET' });
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async (page: number) => {
    try {
      const res = await httpRequest<{ success: true; data: { logs: typeof logs; total: number } }>(`/mail/logs?page=${page}&limit=20`, { method: 'GET' });
      setLogs(res.data.logs);
      setLogTotal(res.data.total);
    } catch { /* ignore */ }
  }, []);

  const fetchQueue = useCallback(async (page: number) => {
    try {
      const res = await httpRequest<{ success: true; data: { items: typeof queueItems; total: number } }>(`/mail/queue?page=${page}&limit=20`, { method: 'GET' });
      setQueueItems(res.data.items);
      setQueueTotal(res.data.total);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchStats(), fetchLogs(1), fetchQueue(1)]).finally(() => setLoading(false));
  }, [fetchConfig, fetchStats, fetchLogs, fetchQueue]);

  const handleTest = async () => {
    if (!testEmail) return;
    setTestLoading(true);
    try {
      const res = await httpRequest<{ success: true; data: { sent: boolean; error?: string } }>('/mail/test', { method: 'POST', body: JSON.stringify({ to: testEmail }) });
      if (res.data.sent) {
        toast({ title: 'Test email sent', description: `Check ${testEmail} inbox` });
      } else {
        toast({ variant: 'destructive', title: 'Failed', description: res.data.error });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    } finally {
      setTestLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await httpRequest<{ success: true; data: { connected: boolean; error?: string } }>('/mail/verify', { method: 'GET' });
      setVerifyResult(res.data);
      if (res.data.connected) {
        toast({ title: 'SMTP Connected', description: 'Mail server is reachable' });
      } else {
        toast({ variant: 'destructive', title: 'Connection Failed', description: res.data.error });
      }
    } catch (error) {
      setVerifyResult({ connected: false, error: String(error) });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleRetryDeadLetters = async () => {
    setRetrying(true);
    try {
      const res = await httpRequest<{ success: true; data: { retried: number } }>('/mail/retry-dead-letters', { method: 'POST' });
      toast({ title: 'Retried', description: `${res.data.retried} emails requeued` });
      await fetchStats();
      await fetchQueue(1);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryOne = async (id: string) => {
    try {
      await httpRequest('/mail/retry-one', { method: 'POST', body: JSON.stringify({ id }) });
      toast({ title: 'Requeued' });
      await fetchQueue(queuePage);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: String(error) });
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = { SENT: 'bg-green-100 text-green-800', FAILED: 'bg-red-100 text-red-800', QUEUED: 'bg-yellow-100 text-yellow-800', DEAD_LETTER: 'bg-gray-100 text-gray-800', PENDING: 'bg-blue-100 text-blue-800', BOUNCED: 'bg-orange-100 text-orange-800', OPENED: 'bg-emerald-100 text-emerald-800' };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mail Configuration</h1>
          <p className="text-sm text-muted-foreground">Configure SMTP, test delivery, and monitor email logs</p>
        </div>
        {config.configured && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><MailCheck className="h-3 w-3 mr-1" />Configured</Badge>}
        {!config.configured && <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><MailWarning className="h-3 w-3 mr-1" />Not Configured</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.pending}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{stats.sent}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{stats.failed}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Dead Letter</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-gray-600">{stats.deadLetter}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Processing</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-blue-600">{stats.processing}</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'logs') fetchLogs(logPage); if (v === 'queue') fetchQueue(queuePage); }}>
        <TabsList>
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-2" />Configuration</TabsTrigger>
          <TabsTrigger value="test"><Send className="h-4 w-4 mr-2" />Test Email</TabsTrigger>
          <TabsTrigger value="queue"><Inbox className="h-4 w-4 mr-2" />Mail Queue ({stats.pending + stats.deadLetter})</TabsTrigger>
          <TabsTrigger value="logs"><MailWarning className="h-4 w-4 mr-2" />Email Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>SMTP Settings</CardTitle><CardDescription>Configure your outbound mail server</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input value={config.host} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input value={config.port} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Email</Label>
                  <Input value={config.from} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Auth User</Label>
                  <Input value={config.user} readOnly className="bg-muted" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">SMTP settings are managed via environment variables. Contact your system administrator to update them.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Connection Test</CardTitle><CardDescription>Verify SMTP server connectivity</CardDescription></CardHeader>
            <CardContent>
              <Button onClick={handleVerify} disabled={verifyLoading}>
                {verifyLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
              {verifyResult && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${verifyResult.connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {verifyResult.connected ? '✓ SMTP server is reachable and authenticated' : `✗ ${verifyResult.error}`}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Send Test Email</CardTitle><CardDescription>Send a test message to verify email delivery</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com" />
              </div>
              <Button onClick={handleTest} disabled={testLoading || !testEmail}>
                {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send Test Email
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>DNS Setup Reference</CardTitle><CardDescription>Required DNS records for production mail delivery</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="p-3 bg-muted rounded-lg space-y-2 font-mono text-xs">
                <p><strong>SPF:</strong> v=spf1 include:_spf.yourprovider.com ~all</p>
                <p><strong>DKIM:</strong> Publish 2048-bit public key as TXT record</p>
                <p><strong>DMARC:</strong> v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com</p>
                <p><strong>MX:</strong> Configure mail exchange records for your domain</p>
              </div>
              <p className="text-xs text-muted-foreground">Configure these DNS records for your domain to ensure reliable email delivery and avoid spam filters.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Mail Queue</CardTitle><CardDescription>Emails waiting to be sent</CardDescription></div>
              <Button variant="outline" size="sm" onClick={handleRetryDeadLetters} disabled={retrying || stats.deadLetter === 0}>
                {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Retry Dead Letters ({stats.deadLetter})
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No queued emails</TableCell></TableRow>}
                  {queueItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[150px] truncate">{item.recipient}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.subject}</TableCell>
                      <TableCell><Badge className={statusColor(item.status)} variant="outline">{item.status}</Badge></TableCell>
                      <TableCell>{item.retryCount}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-red-500">{item.lastError || '-'}</TableCell>
                      <TableCell>
                        {item.status === 'DEAD_LETTER' && <Button size="sm" variant="outline" onClick={() => handleRetryOne(item.id)}>Retry</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {queueTotal > 20 && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-muted-foreground">Page {queuePage} of {Math.ceil(queueTotal / 20)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={queuePage <= 1} onClick={() => { setQueuePage(p => p - 1); fetchQueue(queuePage - 1); }}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={queuePage >= Math.ceil(queueTotal / 20)} onClick={() => { setQueuePage(p => p + 1); fetchQueue(queuePage + 1); }}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>Email Delivery Logs</CardTitle><CardDescription>History of all sent emails</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No email logs</TableCell></TableRow>}
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="max-w-[150px] truncate">{log.recipient}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.subject}</TableCell>
                      <TableCell><Badge className={statusColor(log.status)} variant="outline">{log.status}</Badge></TableCell>
                      <TableCell className="text-xs">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}</TableCell>
                      <TableCell>{log.retryCount}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-red-500">{log.deliveryError || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {logTotal > 20 && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-muted-foreground">Page {logPage} of {Math.ceil(logTotal / 20)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={logPage <= 1} onClick={() => { setLogPage(p => p - 1); fetchLogs(logPage - 1); }}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={logPage >= Math.ceil(logTotal / 20)} onClick={() => { setLogPage(p => p + 1); fetchLogs(logPage + 1); }}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
