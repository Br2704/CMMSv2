import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { listMasters } from "@/api/masters";
import { useAuthStore } from "@/store/auth.store";

interface ShiftHandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onSubmit: (data: { toShiftId: string; handoverNotes: string }) => Promise<void>;
  isLoading?: boolean;
}

export function ShiftHandoverDialog({
  open,
  onOpenChange,
  workOrder,
  onSubmit,
  isLoading,
}: ShiftHandoverDialogProps) {
  const user = useAuthStore((state) => state.user);
  const [toShiftId, setToShiftId] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts", user?.plantId],
    queryFn: async () => {
      const response = await listMasters("shifts", { plantId: user?.plantId, isActive: true });
      return response.data || [];
    },
    enabled: open && Boolean(user?.plantId),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toShiftId || !handoverNotes) return;
    onSubmit({ toShiftId, handoverNotes });
  };

  // Reset state when opened
  React.useEffect(() => {
    if (open) {
      setToShiftId("");
      setHandoverNotes("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Shift Handover</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Target Shift <span className="text-destructive">*</span></Label>
            <Select value={toShiftId} onValueChange={setToShiftId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select shift to hand over to" />
              </SelectTrigger>
              <SelectContent>
                {shiftsLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  shifts.map((shift: any) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.shift_name || shift.name} ({shift.start_time} - {shift.end_time})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Handover Notes <span className="text-destructive">*</span></Label>
            <Textarea
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="Detail what has been done and what needs to be continued..."
              rows={4}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !toShiftId || !handoverNotes}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Hand Over
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
