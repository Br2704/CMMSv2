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

interface HoldWorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onSubmit: (data: { reason: 'WAITING_SPARE' | 'WAITING_SHUTDOWN'; notes?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function HoldWorkOrderDialog({
  open,
  onOpenChange,
  workOrder,
  onSubmit,
  isLoading,
}: HoldWorkOrderDialogProps) {
  const [reason, setReason] = useState<'WAITING_SPARE' | 'WAITING_SHUTDOWN' | ''>('');
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    onSubmit({ reason, notes });
  };

  React.useEffect(() => {
    if (open) {
      setReason("");
      setNotes("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Put Work Order on Hold</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Hold Reason <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={(val: any) => setReason(val)} required>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WAITING_SPARE">Waiting for Spares</SelectItem>
                <SelectItem value="WAITING_SHUTDOWN">Waiting for Machine Shutdown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide more context..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !reason}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Put on Hold
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
