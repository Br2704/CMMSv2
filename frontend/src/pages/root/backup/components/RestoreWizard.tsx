import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, UploadCloud, AlertTriangle, CheckCircle2, LockIcon } from "lucide-react";
import { restoreFromBackup } from "@/api/backup";

export function RestoreWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStep(2);
    }
  };

  const handleConfirm = async () => {
    if (!password) {
      toast.error("Decryption passphrase or Admin password is required.");
      return;
    }
    if (confirmPhrase !== "RESTORE") {
      toast.error("Please type RESTORE to confirm this destructive action.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("password", password);
      
      const response = await restoreFromBackup(formData);
      if (response.success) {
        toast.success("System restored successfully.");
        setStep(3);
      } else {
        toast.error(response.message || "Failed to restore backup.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to restore backup. Invalid signature or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto border-destructive/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          System Restore Center
        </CardTitle>
        <CardDescription>
          Restore the entire system or specific modules from an encrypted backup archive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-muted-foreground/25 bg-muted/5">
            <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Select Backup Archive</h3>
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
              Upload a valid `.zip.enc` CMMS backup file. The system will automatically verify its signature and integrity.
            </p>
            <Input type="file" accept=".enc,.zip" className="max-w-xs" onChange={handleUpload} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold">Destructive Action Warning</h4>
                <p className="text-sm opacity-90">
                  You are about to restore the system from <strong>{file?.name}</strong>. 
                  This will overwrite current database records, files, and configurations. 
                  Active user sessions may be terminated.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Decryption Key / Admin Password</Label>
                <div className="relative">
                  <LockIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="password" 
                    placeholder="Enter decryption key..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Required to decrypt the backup archive.</p>
              </div>

              <div className="space-y-2">
                <Label>Type "RESTORE" to confirm</Label>
                <Input 
                  placeholder="RESTORE"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted-foreground">Safety check against accidental overwrite.</p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">Restore Complete</h3>
            <p className="text-muted-foreground max-w-md">
              The system has been successfully restored. All services are back online with the restored state.
            </p>
            <Button className="mt-8" onClick={() => { setStep(1); setFile(null); setPassword(""); setConfirmPhrase(""); }}>
              Acknowledge
            </Button>
          </div>
        )}
      </CardContent>
      {step === 2 && (
        <CardFooter className="flex justify-between border-t pt-6 bg-muted/20">
          <Button variant="outline" onClick={() => { setStep(1); setFile(null); setConfirmPhrase(""); setPassword(""); }}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading || confirmPhrase !== "RESTORE" || !password}>
            {loading ? "Decrypting & Restoring..." : "Confirm & Execute Restore"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
