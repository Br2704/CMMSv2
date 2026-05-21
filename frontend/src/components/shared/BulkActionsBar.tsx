import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  isProcessing?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  onClearSelection,
  onActivate,
  onDeactivate,
  onDelete,
  onExport,
  isProcessing,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-0 z-30 -mx-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked className="h-4 w-4" />
          <span>{selectedCount} of {totalCount} selected</span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
          {onActivate && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onActivate} disabled={isProcessing}>
              <ToggleRight className="h-3.5 w-3.5 text-green-600" />
              Activate
            </Button>
          )}
          {onDeactivate && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onDeactivate} disabled={isProcessing}>
              <ToggleLeft className="h-3.5 w-3.5 text-amber-600" />
              Deactivate
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onExport} disabled={isProcessing}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-destructive/30 text-destructive hover:text-destructive" onClick={onDelete} disabled={isProcessing}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onClearSelection}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
