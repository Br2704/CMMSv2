import { MinusCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type SpareUsageDraft = {
  spareItemId: string;
  quantity: string;
};

type SpareOption = {
  value: string;
  label: string;
};

interface SpareUsageEditorProps {
  title?: string;
  description?: string;
  rows: SpareUsageDraft[];
  onChange: (rows: SpareUsageDraft[]) => void;
  options: SpareOption[];
  disabled?: boolean;
  emptyMessage?: string;
}

const EMPTY_ROW: SpareUsageDraft = { spareItemId: "", quantity: "1" };

export function SpareUsageEditor({
  title = "Spares Used",
  description = "Record only the spare items actually consumed during execution.",
  rows,
  onChange,
  options,
  disabled = false,
  emptyMessage = "No spare items are available for this machine or plant scope.",
}: SpareUsageEditorProps) {
  const updateRow = (index: number, next: Partial<SpareUsageDraft>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = () => {
    onChange([...rows, EMPTY_ROW]);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No spares selected. Add rows only if spares were actually used.
            </div>
          ) : (
            rows.map((row, index) => (
              <div key={`spare-usage-${index}`} className="grid gap-3 rounded-xl border border-border/70 bg-background/80 p-3 md:grid-cols-[minmax(0,1fr)_140px_48px]">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Spare Item</Label>
                  <Select value={row.spareItemId || undefined} onValueChange={(value) => updateRow(index, { spareItemId: value })} disabled={disabled}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select spare item" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Quantity Used</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(event) => updateRow(index, { quantity: event.target.value })}
                    disabled={disabled}
                    className="h-10"
                  />
                </div>

                <div className="flex items-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)} disabled={disabled}>
                    <MinusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}

          <Button type="button" variant="outline" onClick={addRow} disabled={disabled} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Spare Usage
          </Button>
        </div>
      )}
    </div>
  );
}
