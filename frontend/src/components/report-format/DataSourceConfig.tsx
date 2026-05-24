import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, CalendarDays, Info } from "lucide-react";
import { DATA_SOURCE_OPTIONS } from "./types";

export function DataSourceConfig({
  reportDataSource,
  defaultDateRange,
  onChange,
}: {
  reportDataSource: string | null;
  defaultDateRange: number | null;
  onChange: (data: { reportDataSource: string; defaultDateRange: number }) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Report Data Source
          </CardTitle>
          <CardDescription className="text-xs">
            Select the primary data source for all reports and default date range
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Default Data Source</Label>
            <Select
              value={reportDataSource ?? "work_orders"}
              onValueChange={(v) => onChange({ reportDataSource: v, defaultDateRange: defaultDateRange ?? 30 })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select data source" />
              </SelectTrigger>
              <SelectContent>
                {DATA_SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Default Date Range
              </Label>
              <span className="text-[11px] font-mono text-muted-foreground">{defaultDateRange ?? 30} days</span>
            </div>
            <Slider
              value={[defaultDateRange ?? 30]}
              onValueChange={([v]) => onChange({ reportDataSource: reportDataSource ?? "work_orders", defaultDateRange: v })}
              min={0}
              max={365}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Today</span>
              <span>1 Year</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>
                The selected data source determines what fields are available in column definitions.
                Each sheet can override this with its own data source.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
