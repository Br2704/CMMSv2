import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ReportFormatConfigPayload } from "@/api/reportFormat";
import {
  Printer,
  Table,
  ImageIcon,
  Globe,
} from "lucide-react";
import { useBrandingStore } from "@/store/branding.store";
import { ORIENTATION_OPTIONS, PAPER_SIZE_OPTIONS, LOCALE_OPTIONS } from "./types";

export function AdvancedSettings({
  config,
  onChange,
}: {
  config: ReportFormatConfigPayload;
  onChange: (partial: Partial<ReportFormatConfigPayload>) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Page & Print Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Configure page layout for PDF and printed reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Page Orientation</Label>
              <div className="grid grid-cols-2 gap-2">
                {ORIENTATION_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={config.pageOrientation === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => onChange({ pageOrientation: opt.value as "portrait" | "landscape" })}
                    className="gap-2 capitalize h-9"
                  >
                    <Printer className="h-4 w-4" />
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Paper Size</Label>
              <Select
                value={config.paperSize ?? "A4"}
                onValueChange={(v) => onChange({ paperSize: v as "A4" | "Letter" | "A3" })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select paper size" />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Table className="h-3.5 w-3.5" />
                Row Striping
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Alternate row colors for better readability
              </p>
            </div>
            <Switch
              checked={config.showRowStriping ?? true}
              onCheckedChange={(v) => onChange({ showRowStriping: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Logo Configuration
          </CardTitle>
          <CardDescription className="text-xs">
            Configure organization and TamOptiX logos for report branding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Organization Logo URL</Label>
            <Input
              value={config.organizationLogoUrl ?? ""}
              onChange={(e) => onChange({ organizationLogoUrl: e.target.value || null })}
              className="h-9 text-xs font-mono"
              placeholder="https://example.com/logo.png or auto (uses org upload)"
            />
            <p className="text-[10px] text-muted-foreground">
              Leave empty to use the organization's uploaded logo automatically.
              Or enter a custom URL to override.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">TamOptiX Logo URL</Label>
            <Input
              value={config.tamoptixLogoUrl ?? "/tamoptix/tamoptix-logo.svg"}
              onChange={(e) => onChange({ tamoptixLogoUrl: e.target.value })}
              className="h-9 text-xs font-mono"
              placeholder="/tamoptix/tamoptix-logo.svg"
            />
            <p className="text-[10px] text-muted-foreground">
              Default logo path: /tamoptix/tamoptix-logo.svg
            </p>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/20 border border-border/40">
            <div
              className="w-12 h-12 rounded-lg border flex items-center justify-center text-[7px] font-bold text-white"
              style={{ backgroundColor: config.primaryColor ?? "#111827" }}
            >
              Org
            </div>
            <div className="text-[11px] text-muted-foreground">
              <div className="font-medium text-foreground">Organization Logo</div>
              <div className="text-[10px]">
                {config.showOrganizationLogo ? "Visible in reports" : "Hidden in reports"}
              </div>
            </div>
            <div className="ml-auto">
              <Switch
                checked={config.showOrganizationLogo ?? true}
                onCheckedChange={(v) => onChange({ showOrganizationLogo: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Internationalization
          </CardTitle>
          <CardDescription className="text-xs">
            Set the report locale for date formats, number formatting, and language
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Report Locale</Label>
            <Select
              value={config.reportLocale ?? "en"}
              onValueChange={(v) => onChange({ reportLocale: v })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Affects date formatting (e.g., Jan 15 vs 15 Jan), number decimals, and CSV separator conventions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
