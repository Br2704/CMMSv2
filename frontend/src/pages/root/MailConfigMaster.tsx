import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { httpRequest, ApiError } from '@/api/http';
import { useToast } from '@/hooks/use-toast';
import { Settings, Send, RefreshCw, MailCheck, MailWarning, Loader2, Inbox, Save, CheckCircle2, XCircle, AlertTriangle, HelpCircle, BarChart3, ExternalLink, Eye, EyeOff, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MailConfig {
  configured: boolean;
  host: string;
  port: number;
  from: string;
  fromName: string;
  user: string;
  pass: string;
}

const PROVIDERS: Record<string, { host: string; port: number; doc: string }> = {
  ZOHO_IN: { host: 'smtp.zoho.in', port: 587, doc: 'Zoho Mail India - smtp.zoho.in:587 (STARTTLS) — Recommended for tamoptix.tech' },
  ZOHO: { host: 'smtp.zoho.com', port: 587, doc: 'Zoho Mail Global - smtp.zoho.com:587 (STARTTLS)' },
  GMAIL: { host: 'smtp.gmail.com', port: 587, doc: 'Google Workspace / Gmail - smtp.gmail.com:587' },
  OUTLOOK: { host: 'smtp.office365.com', port: 587, doc: 'Microsoft 365 / Outlook - smtp.office365.com:587' },
  AWS_SES: { host: 'email-smtp.us-east-1.amazonaws.com', port: 587, doc: 'AWS SES - Use SMTP credentials from IAM' },
  SENDGRID: { host: 'smtp.sendgrid.net', port: 587, doc: 'SendGrid - apikey as user, API key as password' },
  CPANEL: { host: 'mail.yourdomain.com', port: 465, doc: 'cPanel - mail.yourdomain.com:465 (SSL)' },
};

const DNS_GUIDE = [
  { record: 'SPF', value: 'v=spf1 include:zoho.com ~all', desc: 'Authorizes Zoho to send on your behalf' },
  { record: 'DKIM', value: 'CNAME record provided by your mail provider', desc: 'Digitally signs emails to prevent tampering' },
  { record: 'DMARC', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com', desc: 'Policy for unauthenticated email handling' },
  { record: 'MX', value: 'mx.zoho.com (priority 10)', desc: 'Mail exchange for inbound delivery' },
];

export default function MailConfigMaster() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<MailConfig>({ configured: false, host: '', port: 587, from: '', fromName: 'CMMS Notification', user: '', pass: '' });
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
  const [selectedProvider, setSelectedProvider] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useTestEmailAutoFill, setUseTestEmailAutoFill] = useState('');
  const navigate = useNavigate();

  const fetchConfig = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: MailConfig }>('/mail/config', { method: 'GET' });
      if (res.data) {
        setConfig(res.data);
        // Auto-fill test email from saved from address
        if (res.data.from && !useTestEmailAutoFill) {
          setUseTestEmailAutoFill(res.data.from);
        }
      }
    } catch (e) { console.error('fetchConfig failed:', e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: typeof stats }>('/mail/stats', { method: 'GET' });
      if (res.data) setStats(res.data);
    } catch (e) { console.error('fetchStats failed:', e); }
  }, []);

  const fetchLogs = useCallback(async (page: number) => {
    try {
      const res = await httpRequest<{ success: true; data: { logs: typeof logs; total: number } }>(`/mail/logs?page=${page}&limit=20`, { method: 'GET' });
      if (res.data) { setLogs(res.data.logs); setLogTotal(res.data.total); }
    } catch (e) { console.error('fetchLogs failed:', e); }
  }, []);

  const fetchQueue = useCallback(async (page: number) => {
    try {
      const res = await httpRequest<{ success: true; data: { items: typeof queueItems; total: number } }>(`/mail/queue?page=${page}&limit=20`, { method: 'GET' });
      if (res.data) { setQueueItems(res.data.items); setQueueTotal(res.data.total); }
    } catch (e) { console.error('fetchQueue failed:', e); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchStats(), fetchLogs(1), fetchQueue(1)]).finally(() => setLoading(false));
  }, [fetchConfig, fetchStats, fetchLogs, fetchQueue]);

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider);
    if (provider && PROVIDERS[provider]) {
      const p = PROVIDERS[provider];
      setConfig((prev) => ({ ...prev, host: p.host, port: p.port }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await httpRequest('/mail/config', {
        method: 'PUT',
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          user: config.user,
          pass: config.pass,
          from: config.from,
          fromName: config.fromName,
        }),
      });
      toast({ title: 'Configuration saved', description: 'SMTP settings updated and mail service reloaded' });
      setConfig((prev) => ({ ...prev, configured: true }));
      await fetchStats();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: String(error) });
    } finally {
      setSaving(false);
    }
  };

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
      const apiError = error instanceof ApiError ? error : null;
      const smtpError = (apiError?.payload as { message?: string })?.message;
      toast({ variant: 'destructive', title: 'Failed', description: smtpError || 'Could not send test email. Check SMTP configuration.' });
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
    const map: Record<string, string> = { SENT: 'bg-green-100 text-green-800 border-green-200', FAILED: 'bg-red-100 text-red-800 border-red-200', QUEUED: 'bg-yellow-100 text-yellow-800 border-yellow-200', DEAD_LETTER: 'bg-gray-100 text-gray-800 border-gray-200', PENDING: 'bg-blue-100 text-blue-800 border-blue-200', BOUNCED: 'bg-orange-100 text-orange-800 border-orange-200', OPENED: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    return map[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const safeConfig = config ?? {} as MailConfig;
  const safeStats = stats ?? { pending: 0, sent: 0, failed: 0, deadLetter: 0, processing: 0 };
  const totalDeliveries = safeStats.sent + safeStats.failed;
  const deliveryRate = totalDeliveries > 0 ? Math.round((safeStats.sent / totalDeliveries) * 100) : 100;
  const rateBgColor = deliveryRate >= 95 ? 'bg-green-100' : deliveryRate >= 80 ? 'bg-yellow-100' : 'bg-red-100';
  const rateTextColor = deliveryRate >= 95 ? 'text-green-600' : deliveryRate >= 80 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mail Configuration</h1>
          <p className="text-sm text-muted-foreground">Configure SMTP, test delivery, monitor queue and logs</p>
        </div>
        <div className="flex items-center gap-3">
          {safeConfig.configured
            ? <Badge className="bg-green-100 text-green-800 border-green-200 text-xs px-3 py-1.5"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Configured</Badge>
            : <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs px-3 py-1.5"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Not Configured</Badge>
          }
        </div>
      </div>

      {/* Delivery Health Score */}
      {totalDeliveries > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="shrink-0">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center ${rateBgColor}`}>
                <BarChart3 className={`h-6 w-6 ${rateTextColor}`} />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Delivery Success Rate</p>
              <p className="text-2xl font-bold">{deliveryRate}%</p>
              <p className="text-xs text-muted-foreground">
                {safeStats.sent} sent / {totalDeliveries} total deliveries
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Reports Link */}
      <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/masters/email-reports')}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MailCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Email Report Schedules</p>
            <p className="text-xs text-muted-foreground">Configure automated report delivery schedules</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Pending', value: safeStats.pending, color: 'text-blue-600' },
          { label: 'Sent', value: safeStats.sent, color: 'text-green-600' },
          { label: 'Failed', value: safeStats.failed, color: 'text-red-600' },
          { label: 'Dead Letter', value: safeStats.deadLetter, color: 'text-gray-600' },
          { label: 'Processing', value: safeStats.processing, color: 'text-yellow-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1.5"><CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent className="pb-3"><p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'logs') fetchLogs(logPage); if (v === 'queue') fetchQueue(queuePage); }}>
        <TabsList className="flex w-full flex-nowrap overflow-x-auto gap-1 sm:flex-wrap sm:overflow-visible">
          <TabsTrigger value="config"><Settings className="h-4 w-4 mr-2" />Configuration</TabsTrigger>
          <TabsTrigger value="test"><Send className="h-4 w-4 mr-2" />Test Email</TabsTrigger>
          <TabsTrigger value="queue"><Inbox className="h-4 w-4 mr-2" />Mail Queue ({stats.pending + stats.deadLetter})</TabsTrigger>
          <TabsTrigger value="logs"><MailWarning className="h-4 w-4 mr-2" />Email Logs</TabsTrigger>
          <TabsTrigger value="audit"><HelpCircle className="h-4 w-4 mr-2" />Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SMTP Settings</CardTitle>
              <CardDescription>Configure your outbound mail server. Changes apply immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="smtp-provider">Quick-select provider</Label>
                <Select value={selectedProvider} onValueChange={handleProviderSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose a mail provider..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZOHO_IN">Zoho Mail (India) ★</SelectItem>
                    <SelectItem value="ZOHO">Zoho Mail (Global)</SelectItem>
                    <SelectItem value="GMAIL">Google Workspace / Gmail</SelectItem>
                    <SelectItem value="OUTLOOK">Microsoft 365 / Outlook</SelectItem>
                    <SelectItem value="AWS_SES">AWS SES</SelectItem>
                    <SelectItem value="SENDGRID">SendGrid</SelectItem>
                    <SelectItem value="CPANEL">cPanel</SelectItem>
                  </SelectContent>
                </Select>
                {selectedProvider && <p className="text-xs text-muted-foreground">{PROVIDERS[selectedProvider]?.doc}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Host <span className="text-red-500">*</span></Label>
                  <Input value={safeConfig.host} onChange={(e) => setConfig({ ...safeConfig, host: e.target.value })} placeholder="smtp.zoho.com" />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Port <span className="text-red-500">*</span></Label>
                  <Input type="number" value={safeConfig.port} onChange={(e) => setConfig({ ...safeConfig, port: Number(e.target.value) })} placeholder="587" />
                </div>
                <div className="space-y-2">
                  <Label>Username <span className="text-red-500">*</span></Label>
                  <Input value={safeConfig.user} onChange={(e) => setConfig({ ...safeConfig, user: e.target.value })} placeholder="noreply@tamoptix.tech" />
                </div>
                <div className="space-y-2">
                  <Label>Password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} value={safeConfig.pass} onChange={(e) => setConfig({ ...safeConfig, pass: e.target.value })} placeholder="App password or SMTP password" className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Stored encrypted at rest using AES-256-GCM</p>
                </div>
                <div className="space-y-2">
                  <Label>From Email <span className="text-red-500">*</span></Label>
                  <Input value={safeConfig.from} onChange={(e) => setConfig({ ...safeConfig, from: e.target.value })} placeholder="noreply@tamoptix.tech" />
                </div>
                <div className="space-y-2">
                  <Label>From Name</Label>
                  <Input value={safeConfig.fromName} onChange={(e) => setConfig({ ...safeConfig, fromName: e.target.value })} placeholder="CMMS Notification" />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving || !safeConfig.host || !safeConfig.user || !safeConfig.pass || !safeConfig.from}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
                <Button variant="outline" onClick={handleVerify} disabled={verifyLoading}>
                  {verifyLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
              </div>

              {verifyResult && (
                <div className={`p-4 rounded-lg text-sm flex items-start gap-3 ${verifyResult.connected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {verifyResult.connected ? <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" /> : <XCircle className="h-5 w-5 mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-medium">{verifyResult.connected ? 'Connection successful' : 'Connection failed'}</p>
                    <p className="text-xs mt-0.5">{verifyResult.connected ? 'SMTP server is reachable and authentication works.' : verifyResult.error}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>DNS Records Guide</CardTitle><CardDescription>Configure these DNS records at your domain registrar for reliable email delivery</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {DNS_GUIDE.map((dns) => (
                  <div key={dns.record} className="p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="font-mono text-xs">{dns.record}</Badge>
                    </div>
                    <code className="text-xs block bg-background p-2 rounded border font-mono break-all">{dns.value}</code>
                    <p className="text-xs text-muted-foreground mt-1.5">{dns.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">DNS changes can take 5-30 minutes to propagate. Use a DNS checker to verify propagation.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Send Test Email</CardTitle><CardDescription>Send a test message to verify end-to-end email delivery</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input type="email" value={testEmail || useTestEmailAutoFill} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com" />
                  </div>
                  {safeConfig.from && (
                    <Button variant="outline" size="sm" onClick={() => setTestEmail(safeConfig.from)} className="shrink-0 whitespace-nowrap gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Use sender</span>
                    </Button>
                  )}
                </div>
                {testEmail && <p className="text-xs text-muted-foreground">Test email will be sent to <strong>{testEmail}</strong></p>}
              </div>
              <Button onClick={handleTest} disabled={testLoading || !testEmail}>
                {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send Test Email
              </Button>
              {!safeConfig.configured && (
                <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>SMTP is not configured. Save the configuration in the <button className="underline font-medium" onClick={() => setActiveTab('config')}>Configuration tab</button> first.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <div><CardTitle>Mail Queue</CardTitle><CardDescription>Emails waiting to be sent or that failed</CardDescription></div>
              <Button variant="outline" size="sm" onClick={handleRetryDeadLetters} disabled={retrying || stats.deadLetter === 0}>
                {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Retry All Dead Letters ({stats.deadLetter})
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Retries</TableHead>
                      <TableHead className="hidden md:table-cell">Error</TableHead>
                      <TableHead className="w-20">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueItems.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No queued emails</TableCell></TableRow>}
                    {queueItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-[140px] truncate text-xs">{item.recipient}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">{item.subject}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${statusColor(item.status)}`}>{item.status}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{item.retryCount}/3</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[140px] truncate text-xs text-red-500">{item.lastError || '-'}</TableCell>
                        <TableCell>
                          {item.status === 'DEAD_LETTER' && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleRetryOne(item.id)}>Retry</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {queueTotal > 20 && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-muted-foreground">Page {queuePage} of {Math.ceil(queueTotal / 20)} ({queueTotal} total)</p>
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
            <CardHeader><CardTitle>Email Delivery Logs</CardTitle><CardDescription>History of all sent and failed email deliveries</CardDescription></CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Sent At</TableHead>
                      <TableHead className="hidden sm:table-cell">Retries</TableHead>
                      <TableHead className="hidden md:table-cell">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No email logs yet</TableCell></TableRow>}
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="max-w-[140px] truncate text-xs">{log.recipient}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">{log.subject}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${statusColor(log.status)}`}>{log.status}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{log.retryCount}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[140px] truncate text-xs text-red-500">{log.deliveryError || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {logTotal > 20 && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-muted-foreground">Page {logPage} of {Math.ceil(logTotal / 20)} ({logTotal} total)</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={logPage <= 1} onClick={() => { setLogPage(p => p - 1); fetchLogs(logPage - 1); }}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={logPage >= Math.ceil(logTotal / 20)} onClick={() => { setLogPage(p => p + 1); fetchLogs(logPage + 1); }}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader><CardTitle>Mail Audit Trail</CardTitle><CardDescription>Security events recorded for mail configuration changes and test sends</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg border text-sm space-y-2">
                <p className="font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Audit logging is active</p>
                <p className="text-muted-foreground">All mail configuration changes and test email sends are automatically logged to the system audit trail with actor identity, timestamp, and action details.</p>
                <ul className="list-disc list-inside text-muted-foreground text-xs space-y-1 mt-2">
                  <li><strong>mail.config.update</strong> — SMTP configuration save/update events</li>
                  <li><strong>mail.test.send</strong> — Test email send attempts with success/failure status</li>
                  <li><strong>user.invited</strong> — User invitation email triggers</li>
                  <li><strong>password.reset</strong> — Password reset email triggers</li>
                  <li><strong>pm.due</strong>, <strong>calibration.due</strong> — Scheduled maintenance notifications</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Audit logs are retained per system retention policy. Use the Security Center for advanced audit log search and export.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
