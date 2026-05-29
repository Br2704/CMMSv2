import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MachineVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onSubmit: (data: { status: 'APPROVED' | 'REJECTED'; comments?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function MachineVerificationDialog({
  open,
  onOpenChange,
  workOrder,
  onSubmit,
  isLoading,
}: MachineVerificationDialogProps) {
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED' | ''>('');
  const [comments, setComments] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    onSubmit({ status, comments });
  };

  // Reset state when opened
  React.useEffect(() => {
    if (open) {
      setStatus("");
      setComments("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Machine Running Verification</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Verification Outcome <span className="text-destructive">*</span></Label>
            <Select value={status} onValueChange={(val: any) => setStatus(val)} required>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Machine Running Normal (Approve)</SelectItem>
                <SelectItem value="REJECTED">Machine Not Running (Reject)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Comments / Notes</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Any remarks on machine condition..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !status}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Verification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
