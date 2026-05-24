import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type SheetConfig,
  type ColumnConfig,
  type ChartConfig,
} from "@/api/reportFormat";
import {
  Plus,
  Trash2,
  GripVertical,
  PenLine,
  BarChart3,
  PieChart,
  LineChart,
  AreaChart,
  Columns,
} from "lucide-react";
import { DATA_SOURCE_OPTIONS, DATA_TYPE_OPTIONS, CHART_TYPE_OPTIONS, generateId } from "./types";

export function SheetManager({
  sheets,
  activeSheetId,
  onChange,
}: {
  sheets: SheetConfig[];
  activeSheetId: string;
  onChange: (sheets: SheetConfig[], activeId: string) => void;
}) {
  const addSheet = () => {
    const newSheet: SheetConfig = {
      id: generateId(),
      name: `Sheet${sheets.length + 1}`,
      isActive: true,
      dataSource: "work_orders",
      dateRange: 30,
      columns: [
        { key: "wo_number", label: "WO #", width: 100, dataType: "text" },
        { key: "asset_name", label: "Asset", width: 140, dataType: "text" },
        { key: "status", label: "Status", width: 100, dataType: "text" },
      ],
      charts: [],
    };
    const updated = [...sheets, newSheet];
    onChange(updated, newSheet.id);
  };

  const removeSheet = (id: string) => {
    if (sheets.length <= 1) {
      toast.error("You must have at least one sheet");
      return;
    }
    const updated = sheets.filter((s) => s.id !== id);
    const newActive = id === activeSheetId ? updated[updated.length - 1].id : activeSheetId;
    onChange(updated, newActive);
  };

  const renameSheet = (id: string, name: string) => {
    const updated = sheets.map((s) => (s.id === id ? { ...s, name } : s));
    onChange(updated, activeSheetId);
  };

  const updateSheet = (id: string, partial: Partial<SheetConfig>) => {
    const updated = sheets.map((s) => (s.id === id ? { ...s, ...partial } : s));
    onChange(updated, activeSheetId);
  };

  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Report Sheets</Label>
        <Button variant="outline" size="sm" onClick={addSheet} className="gap-1.5 h-7 text-[11px]">
          <Plus className="h-3 w-3" />
          Add Sheet
        </Button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-md cursor-pointer text-xs transition-colors border border-b-0 ${
              sheet.id === activeSheetId
                ? "bg-white dark:bg-muted border-border text-foreground font-medium shadow-sm"
                : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60"
            }`}
            onClick={() => onChange(sheets, sheet.id)}
          >
            <span className="truncate max-w-[100px]">{sheet.name}</span>
            {sheets.length > 1 && (
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSheet(sheet.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={activeSheet.name}
            onChange={(e) => renameSheet(activeSheet.id, e.target.value)}
            className="h-8 text-xs font-medium max-w-[200px]"
            placeholder="Sheet name"
          />
          <span className="text-[10px] text-muted-foreground ml-auto">
            {activeSheet.columns?.length ?? 0} columns, {activeSheet.charts?.length ?? 0} charts
          </span>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Data Source</Label>
            <Select
              value={activeSheet.dataSource ?? "work_orders"}
              onValueChange={(v) => updateSheet(activeSheet.id, { dataSource: v })}
            >
              <SelectTrigger className="h-8 text-xs">
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
            <Label className="text-xs font-medium">Date Range (days)</Label>
            <Input
              type="number"
              value={activeSheet.dateRange ?? 30}
              onChange={(e) => updateSheet(activeSheet.id, { dateRange: Number(e.target.value) })}
              className="h-8 text-xs"
              min={0}
              max={365}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Columns className="h-3.5 w-3.5" />
              Column Definitions
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => {
                const columns = activeSheet.columns ?? [];
                const newCol: ColumnConfig = {
                  key: `field_${columns.length + 1}`,
                  label: `Field ${columns.length + 1}`,
                  width: 120,
                  dataType: "text",
                };
                updateSheet(activeSheet.id, { columns: [...columns, newCol] });
              }}
            >
              <Plus className="h-3 w-3" /> Add Column
            </Button>
          </div>

          {activeSheet.columns && activeSheet.columns.length > 0 ? (
            <div className="space-y-2">
              {activeSheet.columns.map((col, idx) => (
                <div
                  key={`${activeSheet.id}-col-${idx}`}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/40"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    value={col.key}
                    onChange={(e) => {
                      const cols = [...(activeSheet.columns ?? [])];
                      cols[idx] = { ...cols[idx], key: e.target.value };
                      updateSheet(activeSheet.id, { columns: cols });
                    }}
                    className="h-7 text-[11px] w-[120px] font-mono"
                    placeholder="Key"
                  />
                  <Input
                    value={col.label}
                    onChange={(e) => {
                      const cols = [...(activeSheet.columns ?? [])];
                      cols[idx] = { ...cols[idx], label: e.target.value };
                      updateSheet(activeSheet.id, { columns: cols });
                    }}
                    className="h-7 text-[11px] w-[130px]"
                    placeholder="Label"
                  />
                  <Select
                    value={col.dataType ?? "text"}
                    onValueChange={(v) => {
                      const cols = [...(activeSheet.columns ?? [])];
                      cols[idx] = { ...cols[idx], dataType: v as ColumnConfig["dataType"] };
                      updateSheet(activeSheet.id, { columns: cols });
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 ml-auto">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">W:</span>
                            <Input
                              type="number"
                              value={col.width ?? 120}
                              onChange={(e) => {
                                const cols = [...(activeSheet.columns ?? [])];
                                cols[idx] = { ...cols[idx], width: Number(e.target.value) };
                                updateSheet(activeSheet.id, { columns: cols });
                              }}
                              className="h-6 w-[50px] text-[10px]"
                              min={20}
                              max={800}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px]">Column width in pixels</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const cols = activeSheet.columns?.filter((_, i) => i !== idx) ?? [];
                        updateSheet(activeSheet.id, { columns: cols });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-[11px] text-muted-foreground border border-dashed rounded-lg">
              No columns defined. Click "Add Column" to define report fields.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Sheet Charts
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => {
                const charts = activeSheet.charts ?? [];
                const newChart: ChartConfig = {
                  type: "bar",
                  title: `Chart ${charts.length + 1}`,
                  xAxisKey: activeSheet.columns?.[0]?.key ?? "key",
                  yAxisKeys: [activeSheet.columns?.[1]?.key ?? "value"].filter(Boolean),
                  showLegend: true,
                  showGrid: true,
                  height: 300,
                  position: "bottom",
                };
                updateSheet(activeSheet.id, { charts: [...charts, newChart] });
              }}
            >
              <Plus className="h-3 w-3" /> Add Chart
            </Button>
          </div>

          {activeSheet.charts && activeSheet.charts.length > 0 ? (
            <div className="space-y-3">
              {activeSheet.charts.map((chart, idx) => (
                <Card key={`chart-${idx}`} className="border-dashed">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {chart.type === "pie" ? (
                          <PieChart className="h-4 w-4 text-primary" />
                        ) : chart.type === "line" ? (
                          <LineChart className="h-4 w-4 text-primary" />
                        ) : chart.type === "area" ? (
                          <AreaChart className="h-4 w-4 text-primary" />
                        ) : (
                          <BarChart3 className="h-4 w-4 text-primary" />
                        )}
                        <span className="text-xs font-medium">{chart.title || `Chart ${idx + 1}`}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const charts = activeSheet.charts?.filter((_, i) => i !== idx) ?? [];
                          updateSheet(activeSheet.id, { charts });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Chart Type</Label>
                        <Select
                          value={chart.type}
                          onValueChange={(v: ChartConfig["type"]) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], type: v };
                            updateSheet(activeSheet.id, { charts });
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHART_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Chart Title</Label>
                        <Input
                          value={chart.title ?? ""}
                          onChange={(e) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], title: e.target.value };
                            updateSheet(activeSheet.id, { charts });
                          }}
                          className="h-7 text-[11px]"
                          placeholder="Chart title"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">X-Axis Key</Label>
                        <Input
                          value={chart.xAxisKey ?? ""}
                          onChange={(e) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], xAxisKey: e.target.value };
                            updateSheet(activeSheet.id, { charts });
                          }}
                          className="h-7 text-[11px] font-mono"
                          placeholder="key"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Y-Axis Keys (comma sep)</Label>
                        <Input
                          value={chart.yAxisKeys?.join(", ") ?? ""}
                          onChange={(e) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = {
                              ...charts[idx],
                              yAxisKeys: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            };
                            updateSheet(activeSheet.id, { charts });
                          }}
                          className="h-7 text-[11px] font-mono"
                          placeholder="value1, value2"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={chart.showLegend ?? true}
                          onCheckedChange={(v) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], showLegend: v };
                            updateSheet(activeSheet.id, { charts });
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground">Legend</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={chart.showGrid ?? true}
                          onCheckedChange={(v) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], showGrid: v };
                            updateSheet(activeSheet.id, { charts });
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground">Grid</span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <Label className="text-[10px] text-muted-foreground">Height</Label>
                        <Input
                          type="number"
                          value={chart.height ?? 300}
                          onChange={(e) => {
                            const charts = [...(activeSheet.charts ?? [])];
                            charts[idx] = { ...charts[idx], height: Number(e.target.value) };
                            updateSheet(activeSheet.id, { charts });
                          }}
                          className="h-6 w-[60px] text-[10px]"
                          min={100}
                          max={800}
                        />
                        <span className="text-[9px] text-muted-foreground">px</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-[11px] text-muted-foreground border border-dashed rounded-lg">
              No charts configured for this sheet. Add charts to visualize your data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
