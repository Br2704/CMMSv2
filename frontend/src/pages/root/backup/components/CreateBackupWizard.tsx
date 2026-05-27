import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { httpRequest } from "@/api/http";
import { ShieldCheck, HardDriveDownload, AlertCircle } from "lucide-react";

export function CreateBackupWizard({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: `Backup_${new Date().toISOString().split('T')[0]}`,
    description: '',
    type: 'FULL',
    isEncrypted: true,
    isCompressed: true,
  });

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error("Backup name is required.");
      return;
    }
    setLoading(true);
    try {
      const response = await httpRequest<{ success: boolean }>("/backup", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      if (response.success) {
        toast.success("Backup job queued successfully!");
        onComplete();
      }
    } catch (err) {
      toast.error("Failed to start backup job.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveDownload className="h-5 w-5" />
          Create New Backup
        </CardTitle>
        <CardDescription>
          Configure and initiate a new secure backup. The job will run in the background.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Backup Name</Label>
          <Input 
            value={formData.name} 
            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} 
            placeholder="e.g. Pre-Deployment Backup v2.1"
          />
        </div>

        <div className="space-y-2">
          <Label>Description (Optional)</Label>
          <Input 
            value={formData.description} 
            onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} 
            placeholder="Brief reason for backup..."
          />
        </div>

        <div className="space-y-2">
          <Label>Backup Scope</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData(p => ({ ...p, type: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FULL">Full System (Database & Storage)</SelectItem>
              <SelectItem value="ORGANIZATION">Organization Specific</SelectItem>
              <SelectItem value="PLANT">Plant Specific</SelectItem>
              <SelectItem value="MODULE">Selected Modules Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label className="flex items-center gap-2">
                AES-256 Encryption
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              </Label>
              <span className="text-xs text-muted-foreground">Encrypt archive using secure keys</span>
            </div>
            <Switch 
              checked={formData.isEncrypted} 
              onCheckedChange={(c) => setFormData(p => ({ ...p, isEncrypted: c }))} 
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label>High Compression</Label>
              <span className="text-xs text-muted-foreground">Minimize storage footprint (slower)</span>
            </div>
            <Switch 
              checked={formData.isCompressed} 
              onCheckedChange={(c) => setFormData(p => ({ ...p, isCompressed: c }))} 
            />
          </div>
        </div>

        {!formData.isEncrypted && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive mt-4">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              <strong>Warning:</strong> You are about to create an unencrypted plaintext backup. This is not recommended for enterprise environments and violates zero-trust security policies.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-6">
        <Button variant="ghost" onClick={onComplete}>Cancel</Button>
        <Button onClick={handleCreate} disabled={loading}>
          {loading ? "Starting..." : "Initialize Backup"}
        </Button>
      </CardFooter>
    </Card>
  );
}
