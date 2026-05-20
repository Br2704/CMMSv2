import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { httpRequest } from '@/api/http';
import { Loader2, Shield, RefreshCw, Clock, CheckCircle2, AlertTriangle, History, KeyRound, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SecretVersion {
  id: string;
  secret: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface SecretKeyStatus {
  keyName: string;
  currentVersionId: string;
  versions: SecretVersion[];
  rotationIntervalDays: number;
  lastRotatedAt: string | null;
  nextRotationAt: string | null;
}

interface RotationStatusData {
  keys: SecretKeyStatus[];
}

function maskSecretId(id: string): string {
  if (!id || id.length < 16) return id;
  return id.substring(0, 8) + '...' + id.substring(id.length - 4);
}

function daysUntil(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffMs < 0) return 'Overdue';
  if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
  if (diffHours > 0) return `${diffHours}h`;
  return '< 1h';
}

function getKeyLabel(keyName: string): string {
  const labels: Record<string, string> = {
    JWT_ACCESS: 'JWT Access Token',
    JWT_REFRESH: 'JWT Refresh Token',
    DATA_ENCRYPTION: 'Data Encryption Key',
  };
  return labels[keyName] || keyName;
}

function getKeyDescription(keyName: string): string {
  const descriptions: Record<string, string> = {
    JWT_ACCESS: 'Signs access tokens used for API authentication. Rotation invalidates all active sessions.',
    JWT_REFRESH: 'Signs refresh tokens used for token renewal. Rotation forces re-login for all users.',
    DATA_ENCRYPTION: 'Encrypts sensitive data at rest (SMTP passwords, MFA secrets). Rotation re-encrypts on next write.',
  };
  return descriptions[keyName] || '';
}

export default function SecretRotationStatus() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RotationStatusData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await httpRequest<{ success: true; data: RotationStatusData }>('/system/secret-rotation/status', { method: 'GET' });
      if (res.data) setData(res.data);
    } catch (e) {
      console.error('fetchSecretRotationStatus failed:', e);
      toast({ variant: 'destructive', title: 'Failed to load', description: 'Could not fetch secret rotation status' });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchStatus().finally(() => setLoading(false));
  }, [fetchStatus]);

  const handleRefresh = () => {
    setLoading(true);
    fetchStatus().finally(() => setLoading(false));
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const keys = data?.keys ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Secret Rotation Status
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor and verify automatic secret rotation for cryptographic keys and tokens
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Badge variant="outline" className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Scheduler Active
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Registered Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{keys.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <History className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold">
              {keys.reduce((sum, k) => sum + k.versions.length, 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rotation Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold">Every 6h</p>
          </CardContent>
        </Card>
      </div>

      {/* Key Cards */}
      {keys.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No secrets registered</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Secret rotation has not been initialized. Restart the server to register secrets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {keys.map((key) => {
            const activeVersions = key.versions.filter(v => v.isActive).length;
            const hasRotated = key.versions.length > 1;
            const isNextRotationSoon = key.nextRotationAt && new Date(key.nextRotationAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

            return (
              <Card key={key.keyName} className="overflow-hidden">
                <CardHeader className="pb-4 border-b bg-muted/20">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        {getKeyLabel(key.keyName)}
                        <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {key.keyName}
                        </code>
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs max-w-lg">
                        {getKeyDescription(key.keyName)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${activeVersions > 1 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {activeVersions} active version{activeVersions !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Rotate every {key.rotationIntervalDays}d
                      </Badge>
                      {hasRotated && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Rotated
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Timeline row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x border-b">
                    <div className="p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last Rotation</p>
                      {key.lastRotatedAt ? (
                        <p className="text-sm font-semibold">{new Date(key.lastRotatedAt).toLocaleString()}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not yet rotated</p>
                      )}
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Next Rotation</p>
                      {key.nextRotationAt ? (
                        <div className="flex items-center justify-center gap-2">
                          <p className={`text-sm font-semibold ${isNextRotationSoon ? 'text-amber-600' : ''}`}>
                            {new Date(key.nextRotationAt).toLocaleString()}
                          </p>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isNextRotationSoon ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                            {daysUntil(key.nextRotationAt)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not scheduled</p>
                      )}
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Rotation Interval</p>
                      <p className="text-sm font-semibold">{key.rotationIntervalDays} days</p>
                    </div>
                  </div>

                  {/* Version table */}
                  {key.versions.length > 0 && (
                    <div className="p-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Version History ({key.versions.length})
                      </p>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Version ID</TableHead>
                              <TableHead className="text-xs">Secret (preview)</TableHead>
                              <TableHead className="text-xs">Created</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {key.versions.map((v) => (
                              <TableRow key={v.id} className={v.isActive ? 'bg-green-50/40' : ''}>
                                <TableCell>
                                  <code className="text-xs font-mono">{maskSecretId(v.id)}</code>
                                </TableCell>
                                <TableCell>
                                  <code className="text-xs font-mono text-muted-foreground">{v.secret.substring(0, 16)}...</code>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {new Date(v.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  {v.isActive ? (
                                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <button
                                    onClick={() => handleCopyId(v.id)}
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    title="Copy version ID"
                                  >
                                    {copiedId === v.id ? (
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">How Secret Rotation Works</p>
            <p>Rotated secrets are HMAC-SHA256 derivations of the current environment variable value, salted with a random value.</p>
            <p>When a secret is rotated, the old version remains valid (inactive) until the grace period expires. This allows a smooth transition window.</p>
            <p>All rotated secrets are persisted to the <code className="font-mono text-xs bg-muted px-1 rounded">system_configs</code> table and survive server restarts.</p>
            <p className="mt-2">The scheduler runs every 6 hours and checks each secret's grace period. Rotation intervals: JWT_ACCESS (90d), JWT_REFRESH (180d), DATA_ENCRYPTION (365d).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
