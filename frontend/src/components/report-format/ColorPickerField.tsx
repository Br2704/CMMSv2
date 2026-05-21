import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Palette } from "lucide-react";
import { COLOR_PRESETS, isValidHex } from "./types";

export function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showPresets, setShowPresets] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <div
                    className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer shadow-sm hover:scale-105 transition-transform"
                    style={{
                      backgroundColor: isValidHex(value) ? value : "#fef2f2",
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "color";
                      input.value = isValidHex(value) ? value : "#000000";
                      input.addEventListener("input", (e) => onChange((e.target as HTMLInputElement).value));
                      input.click();
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px]">
                Click to open system color picker
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex-1 relative">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`h-9 text-xs font-mono pl-3 pr-8 ${!isValidHex(value) ? "border-red-300 focus-visible:ring-red-300" : ""}`}
              placeholder="#000000"
            />
            {!isValidHex(value) && value && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Badge variant="outline" className="text-[8px] px-1 py-0 text-red-500 border-red-200 bg-red-50">
                  Invalid
                </Badge>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => setShowPresets(!showPresets)}
          >
            <Palette className={`h-4 w-4 transition-transform ${showPresets ? "rotate-45" : ""}`} />
          </Button>
        </div>

        {showPresets && (
          <div className="p-2 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((preset) => (
                <TooltipProvider key={preset.value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`w-6 h-6 rounded-md border border-border/50 cursor-pointer hover:scale-125 transition-all shadow-sm ${
                          value === preset.value ? "ring-2 ring-primary ring-offset-1 scale-110" : ""
                        }`}
                        style={{ backgroundColor: preset.value }}
                        onClick={() => onChange(preset.value)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-[10px]">
                      {preset.label} ({preset.value})
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
