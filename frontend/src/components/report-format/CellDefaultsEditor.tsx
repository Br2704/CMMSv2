import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type CellStyle } from "@/api/reportFormat";
import { TableProperties, Palette, Ruler } from "lucide-react";
import { ALIGNMENT_ICONS } from "./types";
import { ColorPickerField } from "./ColorPickerField";

export function CellDefaultsEditor({
  cellDefaults,
  onChange,
}: {
  cellDefaults: CellStyle | null;
  onChange: (style: CellStyle | null) => void;
}) {
  const defaults = cellDefaults ?? {
    width: 120,
    height: 30,
    bgColor: "#FFFFFF",
    textColor: "#374151",
    fontSize: 10,
    alignment: "left" as const,
    verticalAlign: "middle" as const,
    wrapText: true,
  };

  const update = (partial: Partial<CellStyle>) => {
    onChange({ ...defaults, ...partial });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TableProperties className="h-4 w-4" />
            Default Cell Dimensions
          </CardTitle>
          <CardDescription className="text-xs">
            Default width and height for all cells in the report
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5" />
                  Default Cell Width
                </Label>
                <span className="text-[11px] font-mono text-muted-foreground">{defaults.width ?? 120}px</span>
              </div>
              <Slider
                value={[defaults.width ?? 120]}
                onValueChange={([v]) => update({ width: v })}
                min={20}
                max={800}
                step={5}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>20px</span>
                <span>800px</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5" />
                  Default Cell Height
                </Label>
                <span className="text-[11px] font-mono text-muted-foreground">{defaults.height ?? 30}px</span>
              </div>
              <Slider
                value={[defaults.height ?? 30]}
                onValueChange={([v]) => update({ height: v })}
                min={10}
                max={200}
                step={5}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>10px</span>
                <span>200px</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Default Cell Appearance
          </CardTitle>
          <CardDescription className="text-xs">
            Default colors, font, and alignment for report cells
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ColorPickerField
              label="Default Background Color"
              value={defaults.bgColor ?? "#FFFFFF"}
              onChange={(v) => update({ bgColor: v })}
            />
            <ColorPickerField
              label="Default Text Color"
              value={defaults.textColor ?? "#374151"}
              onChange={(v) => update({ textColor: v })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Default Font Size</Label>
              <span className="text-[11px] font-mono text-muted-foreground">{defaults.fontSize ?? 10}px</span>
            </div>
            <Slider
              value={[defaults.fontSize ?? 10]}
              onValueChange={([v]) => update({ fontSize: v })}
              min={6}
              max={72}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>6px</span>
              <span>72px</span>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Horizontal Alignment</Label>
              <div className="grid grid-cols-3 gap-1">
                {(["left", "center", "right"] as const).map((align) => {
                  const Icon = ALIGNMENT_ICONS[align];
                  return (
                    <Button
                      key={align}
                      variant={defaults.alignment === align ? "default" : "outline"}
                      size="sm"
                      onClick={() => update({ alignment: align })}
                      className="h-7 text-[10px] gap-1"
                    >
                      <Icon className="h-3 w-3" />
                      {align}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Vertical Alignment</Label>
              <div className="grid grid-cols-3 gap-1">
                {(["top", "middle", "bottom"] as const).map((align) => (
                  <Button
                    key={align}
                    variant={defaults.verticalAlign === align ? "default" : "outline"}
                    size="sm"
                    onClick={() => update({ verticalAlign: align })}
                    className="h-7 text-[10px] capitalize"
                  >
                    {align}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={defaults.wrapText ?? true}
                onCheckedChange={(v) => update({ wrapText: v })}
              />
              <Label className="text-xs font-medium cursor-pointer">Wrap Text</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4">
          <Label className="text-xs font-medium mb-2 block">Cell Preview</Label>
          <div
            className="border rounded p-3 text-xs"
            style={{
              backgroundColor: defaults.bgColor ?? "#FFFFFF",
              color: defaults.textColor ?? "#374151",
              fontSize: `${defaults.fontSize ?? 10}px`,
              textAlign: defaults.alignment ?? "left",
              verticalAlign: defaults.verticalAlign ?? "middle",
              width: `${defaults.width ?? 120}px`,
              height: `${defaults.height ?? 30}px`,
              display: "flex",
              alignItems: defaults.verticalAlign === "top" ? "flex-start" : defaults.verticalAlign === "bottom" ? "flex-end" : "center",
              justifyContent: defaults.alignment === "center" ? "center" : defaults.alignment === "right" ? "flex-end" : "flex-start",
              overflow: defaults.wrapText ? "visible" : "hidden",
              wordBreak: defaults.wrapText ? "break-word" : "normal",
              whiteSpace: defaults.wrapText ? "normal" : "nowrap",
            }}
          >
            Sample Cell Content
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
