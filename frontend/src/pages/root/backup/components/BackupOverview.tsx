import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, ShieldCheck, HardDrive, AlertTriangle, Download } from "lucide-react";
import { listBackups, type BackupHistory } from "@/api/backup";
import { useAccessibleRoutes } from '@/hooks/useAccessibleRoutes';
import { format } from "date-fns";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";

export function BackupOverview({ onNavigateCreate, onNavigateRestore }: { onNavigateCreate: () => void, onNavigateRestore: () => void }) {
  const { canAccess } = useAccessibleRoutes();
  const [backups, setBackups] = useState<BackupHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Avoid calling the backup API if the user cannot access this route
      if (!canAccess('/root/backup')) {
        setBackups([]);
        setLoadError('You do not have permission to view backup history.');
        return;
      }
      
      const { data, success } = await listBackups(1, 50);
      if (success && data) {
        setBackups(data.backups);
      } else {
        setBackups([]);
        setLoadError("Backup history is currently unavailable.");
      }
    } catch (err) {
      setBackups([]);
      const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status?: number }).status) : null;
      if (status === 403) {
        setLoadError("You do not have permission to view backup history.");
      } else if (status === 404) {
        setLoadError("Backup history endpoint is not available.");
      } else {
        setLoadError("Failed to load backup history.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBackups();
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Backups</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{backups.length}</div>
            <p className="text-xs text-muted-foreground">Across all storage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">Secure</div>
            <p className="text-xs text-muted-foreground">AES-256 GCM Encrypted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0))}
            </div>
            <p className="text-xs text-muted-foreground">Local storage consumption</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Backups</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {backups.filter(b => b.status === 'FAILED').length}
            </div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Backup History</CardTitle>
            <CardDescription>Recent backup jobs and their status.</CardDescription>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onNavigateRestore}>Restore Center</Button>
            <Button onClick={onNavigateCreate}>Create Backup</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={6} />
          ) : loadError ? (
            <EmptyState
              title="Backup history unavailable"
              description={loadError}
              actionLabel="Retry"
              onAction={() => void fetchBackups()}
            />
          ) : backups.length === 0 ? (
            <EmptyState
              title="No backups found"
              description="Create the first backup to start building disaster recovery history."
              actionLabel="Create Backup"
              onAction={onNavigateCreate}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell className="font-medium">
                      {backup.name}
                      {backup.isEncrypted && <ShieldCheck className="ml-2 inline-block h-3 w-3 text-emerald-500" />}
                    </TableCell>
                    <TableCell><Badge variant="outline">{backup.type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={backup.status === 'SUCCESS' ? 'default' : backup.status === 'FAILED' ? 'destructive' : 'secondary'}>
                        {backup.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                    <TableCell>{format(new Date(backup.createdAt), 'PP p')}</TableCell>
                    <TableCell className="text-right">
                      {backup.status === 'SUCCESS' && (
                        <Button variant="ghost" size="icon" onClick={() => window.open(`/api/backup/${backup.id}/download`, '_blank')}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
