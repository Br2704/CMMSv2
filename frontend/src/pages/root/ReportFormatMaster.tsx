import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getReportFormatConfig,
  updateReportFormatConfig,
  type ReportFormatConfigPayload,
  type SheetConfig,
  type ColumnConfig,
  type ChartConfig,
  type CellStyle,
} from "@/api/reportFormat";
import { useBrandingStore } from "@/store/branding.store";
import {
  FileText,
  Save,
  Loader2,
  RotateCcw,
  Eye,
  Paintbrush,
  Type,
  Layout,
  Bold,
  Underline,
  Clock,
  Sparkles,
  LetterText,
  Info,
  Grid3X3,
  Settings2,
  Database,
  CalendarDays,
  TableProperties,
  Image,
  Palette,
  Columns3,
  FileSpreadsheet,
  Table,
  CheckCircle2,
} from "lucide-react";
import { type PreviewFormat, DEFAULT_CONFIG, LOCALE_OPTIONS, DATA_SOURCE_OPTIONS, ORIENTATION_OPTIONS, PAPER_SIZE_OPTIONS, hexToRgba, getContrastColor, ALIGNMENT_ICONS } from "@/components/report-format/types";
import { SheetManager } from "@/components/report-format/SheetManager";
import { CellDefaultsEditor } from "@/components/report-format/CellDefaultsEditor";
import { ColorPickerField } from "@/components/report-format/ColorPickerField";
import { ReportPreview } from "@/components/report-format/ReportPreview";
import { DataSourceConfig } from "@/components/report-format/DataSourceConfig";
import { AdvancedSettings } from "@/components/report-format/AdvancedSettings";

/* ──────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────── */

export default function ReportFormatMaster() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReportFormatConfigPayload>(DEFAULT_CONFIG);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>("excel");
  const [activeTab, setActiveTab] = useState("header");
  const [hasChanges, setHasChanges] = useState(false);
  const [unsavedVersion, setUnsavedVersion] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [activeSheetId, setActiveSheetId] = useState("sheet-default");
  const { logoUrl, logoAssetUrl } = useBrandingStore();

  // Auto-populate org logo from branding store (re-runs when store updates)
  useEffect(() => {
    const orgLogo = logoUrl || logoAssetUrl || null;
    if (orgLogo) {
      setConfig((prev) => {
        if (!prev.organizationLogoUrl) {
          return { ...prev, organizationLogoUrl: orgLogo };
        }
        return prev;
      });
    }
  }, [logoUrl, logoAssetUrl]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReportFormatConfig();
      const data = res.data;
      setConfig({
        headerTitle: data.headerTitle ?? DEFAULT_CONFIG.headerTitle,
        headerSubtitle: data.headerSubtitle ?? DEFAULT_CONFIG.headerSubtitle,
        footerText: data.footerText ?? DEFAULT_CONFIG.footerText,
        footerSubtext: data.footerSubtext ?? DEFAULT_CONFIG.footerSubtext,
        showTamOptixBranding: data.showTamOptixBranding ?? DEFAULT_CONFIG.showTamOptixBranding,
        showOrganizationLogo: data.showOrganizationLogo ?? DEFAULT_CONFIG.showOrganizationLogo,
        showGeneratedDate: data.showGeneratedDate ?? DEFAULT_CONFIG.showGeneratedDate,
        logoAlignment: data.logoAlignment ?? DEFAULT_CONFIG.logoAlignment,
        headerColor: data.headerColor ?? DEFAULT_CONFIG.headerColor,
        footerColor: data.footerColor ?? DEFAULT_CONFIG.footerColor,
        headerFontSize: data.headerFontSize ?? DEFAULT_CONFIG.headerFontSize,
        footerFontSize: data.footerFontSize ?? DEFAULT_CONFIG.footerFontSize,
        primaryColor: data.primaryColor ?? DEFAULT_CONFIG.primaryColor,
        headerBgColor: data.headerBgColor ?? DEFAULT_CONFIG.headerBgColor,
        headerBold: data.headerBold ?? DEFAULT_CONFIG.headerBold,
        footerBold: data.footerBold ?? DEFAULT_CONFIG.footerBold,
        headerUnderline: data.headerUnderline ?? DEFAULT_CONFIG.headerUnderline,
        headerAlignment: data.headerAlignment ?? DEFAULT_CONFIG.headerAlignment,
        // Advanced fields
        sheetsConfig: data.sheetsConfig ?? DEFAULT_CONFIG.sheetsConfig,
        chartConfig: data.chartConfig ?? DEFAULT_CONFIG.chartConfig,
        cellDefaults: data.cellDefaults ?? DEFAULT_CONFIG.cellDefaults,
        reportDataSource: data.reportDataSource ?? DEFAULT_CONFIG.reportDataSource,
        defaultDateRange: data.defaultDateRange ?? DEFAULT_CONFIG.defaultDateRange,
        organizationLogoUrl: data.organizationLogoUrl ?? DEFAULT_CONFIG.organizationLogoUrl,
        tamoptixLogoUrl: data.tamoptixLogoUrl ?? DEFAULT_CONFIG.tamoptixLogoUrl,
        reportLocale: data.reportLocale ?? DEFAULT_CONFIG.reportLocale,
        defaultCellWidth: data.defaultCellWidth ?? DEFAULT_CONFIG.defaultCellWidth,
        defaultCellHeight: data.defaultCellHeight ?? DEFAULT_CONFIG.defaultCellHeight,
        showRowStriping: data.showRowStriping ?? DEFAULT_CONFIG.showRowStriping,
        pageOrientation: data.pageOrientation ?? DEFAULT_CONFIG.pageOrientation,
        paperSize: data.paperSize ?? DEFAULT_CONFIG.paperSize,
      });
      // Set active sheet from config
      if (data.sheetsConfig && data.sheetsConfig.length > 0) {
        setActiveSheetId(data.sheetsConfig[0].id);
      }
      setLastSavedAt(data.updatedAt || null);
      setUnsavedVersion(0);
    } catch (error) {
      console.error("Failed to fetch report format config:", error);
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      toast.error("Failed to load report format configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    setHasChanges(unsavedVersion > 0);
  }, [unsavedVersion]);

  const updateConfig = useCallback(
    (partial: Partial<ReportFormatConfigPayload>) => {
      setConfig((prev) => ({ ...prev, ...partial }));
      setUnsavedVersion((v) => v + 1);
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateReportFormatConfig(config);
      toast.success("Report format configuration saved successfully");
      setUnsavedVersion(0);
      setLastSavedAt(res.data.updatedAt || new Date().toISOString());
      setError(null);
    } catch (error) {
      toast.error("Failed to save: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setUnsavedVersion((v) => v + 1);
    toast.success("Reset to defaults (not saved yet)");
  };

  const handleRetry = () => {
    setIsRetrying(true);
    fetchConfig().finally(() => setIsRetrying(false));
  };

  const changesCount = useMemo(() => {
    if (!hasChanges) return 0;
    let count = 0;
    const keys = Object.keys(DEFAULT_CONFIG) as (keyof ReportFormatConfigPayload)[];
    for (const key of keys) {
      const def = DEFAULT_CONFIG[key];
      const cur = config[key];
      if (def !== undefined && cur !== undefined && JSON.stringify(cur) !== JSON.stringify(def)) {
        count++;
      }
    }
    return count;
  }, [config, hasChanges]);

  const formattedLastSaved = useMemo(() => {
    if (!lastSavedAt) return null;
    try {
      return new Date(lastSavedAt).toLocaleString();
    } catch {
      return lastSavedAt;
    }
  }, [lastSavedAt]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading configuration...</p>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error && !config.headerTitle) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
              <Info className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Failed to Load</CardTitle>
            <CardDescription className="text-xs mt-1">
              Could not connect to the server. Ensure database migrations have been run.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-4">
            <Button variant="outline" onClick={handleRetry} disabled={isRetrying} className="gap-2">
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {isRetrying ? "Retrying..." : "Retry Connection"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* ── Stale data warning banner ── */}
      {error && config.headerTitle && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 text-yellow-800 dark:text-yellow-200 text-xs">
          <Info className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Could not reach the server. Showing last known configuration. Changes may not save properly.
          </span>
          <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying} className="h-7 text-[11px] gap-1.5 shrink-0">
            {isRetrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Retry
          </Button>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 shadow-inner">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
              Report Format Config
              {hasChanges && (
                <Badge
                  variant="outline"
                  className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-200 dark:border-yellow-500/40 text-[10px] px-2 py-0.5 font-normal"
                >
                  {changesCount} change{changesCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
              <span>Customize the appearance of exported reports</span>
              <span className="hidden sm:inline text-[10px] text-muted-foreground/50">·</span>
              <Badge variant="secondary" className="text-[10px] font-normal hidden sm:inline-flex gap-1">
                <Sparkles className="h-3 w-3" />
                Multi-Sheet · Charts · Cell Editor
              </Badge>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {formattedLastSaved && !hasChanges && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">Saved</span>
                    <span className="font-mono text-[10px]">{formattedLastSaved}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Last saved at {formattedLastSaved}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hasChanges && (
            <Badge
              variant="outline"
              className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-200 dark:border-yellow-500/40 text-xs px-3 py-1.5 animate-pulse hidden sm:inline-flex"
            >
              Unsaved changes
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            size="sm"
            className="gap-2 shadow-lg shadow-primary/20"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Settings panel (3/5) ── */}
        <div className="lg:col-span-3 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start bg-muted/50 p-1 rounded-xl flex-wrap">
              <TabsTrigger value="header" className="gap-2 data-[state=active]:shadow-sm">
                <Type className="h-4 w-4" />
                <span className="hidden sm:inline">Header</span>
              </TabsTrigger>
              <TabsTrigger value="footer" className="gap-2 data-[state=active]:shadow-sm">
                <LetterText className="h-4 w-4" />
                <span className="hidden sm:inline">Footer</span>
              </TabsTrigger>
              <TabsTrigger value="colors" className="gap-2 data-[state=active]:shadow-sm">
                <Paintbrush className="h-4 w-4" />
                <span className="hidden sm:inline">Colors</span>
              </TabsTrigger>
              <TabsTrigger value="typography" className="gap-2 data-[state=active]:shadow-sm">
                <Type className="h-4 w-4" />
                <span className="hidden sm:inline">Typography</span>
              </TabsTrigger>
              <TabsTrigger value="layout" className="gap-2 data-[state=active]:shadow-sm">
                <Layout className="h-4 w-4" />
                <span className="hidden sm:inline">Layout</span>
              </TabsTrigger>
              <TabsTrigger value="sheets" className="gap-2 data-[state=active]:shadow-sm">
                <Grid3X3 className="h-4 w-4" />
                <span className="hidden sm:inline">Sheets</span>
              </TabsTrigger>
              <TabsTrigger value="cells" className="gap-2 data-[state=active]:shadow-sm">
                <TableProperties className="h-4 w-4" />
                <span className="hidden sm:inline">Cells</span>
              </TabsTrigger>
              <TabsTrigger value="datasource" className="gap-2 data-[state=active]:shadow-sm">
                <Database className="h-4 w-4" />
                <span className="hidden sm:inline">Data</span>
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-2 data-[state=active]:shadow-sm">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Advanced</span>
              </TabsTrigger>
            </TabsList>

            {/* ── HEADER TAB ── */}
            <TabsContent value="header" className="space-y-4 mt-4 animate-in slide-in-from-top-2 duration-200">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Header Content
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Main title and subtitle displayed at the top of every report
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Header Title</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {config.headerTitle.length}/500
                      </span>
                    </div>
                    <Input
                      value={config.headerTitle}
                      onChange={(e) => updateConfig({ headerTitle: e.target.value })}
                      placeholder="CMMS Report"
                      className="h-9"
                      maxLength={500}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Header Subtitle
                        <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {config.headerSubtitle?.length || 0}/200
                      </span>
                    </div>
                    <Input
                      value={config.headerSubtitle}
                      onChange={(e) => updateConfig({ headerSubtitle: e.target.value })}
                      placeholder="Organization Name, Report Period, etc."
                      className="h-9"
                      maxLength={200}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between py-1">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Show Generated Date</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Display generation timestamp below the title
                      </p>
                    </div>
                    <Switch
                      checked={config.showGeneratedDate}
                      onCheckedChange={(v) => updateConfig({ showGeneratedDate: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Show Organization Logo</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Display the org logo in the report header
                      </p>
                    </div>
                    <Switch
                      checked={config.showOrganizationLogo}
                      onCheckedChange={(v) => updateConfig({ showOrganizationLogo: v })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Paintbrush className="h-4 w-4" />
                    Header Styling
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Font weight, decoration, and size for the report title
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ColorPickerField
                    label="Header Text Color"
                    value={config.headerColor}
                    onChange={(v) => updateConfig({ headerColor: v })}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Header Font Size</Label>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
                        {config.headerFontSize}px
                      </span>
                    </div>
                    <Slider
                      value={[config.headerFontSize]}
                      onValueChange={([v]) => updateConfig({ headerFontSize: v })}
                      min={8}
                      max={48}
                      step={1}
                      className="flex-1"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>8px</span>
                      <span>48px</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Bold className="h-3.5 w-3.5" />
                      Bold
                    </Label>
                    <Switch
                      checked={config.headerBold}
                      onCheckedChange={(v) => updateConfig({ headerBold: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Underline className="h-3.5 w-3.5" />
                      Underline
                    </Label>
                    <Switch
                      checked={config.headerUnderline}
                      onCheckedChange={(v) => updateConfig({ headerUnderline: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── FOOTER TAB ── */}
            <TabsContent value="footer" className="space-y-4 mt-4 animate-in slide-in-from-top-2 duration-200">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <LetterText className="h-4 w-4" />
                    Footer Content
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Text displayed at the bottom of every exported report
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Footer Text</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {config.footerText.length}/200
                      </span>
                    </div>
                    <Input
                      value={config.footerText}
                      onChange={(e) => updateConfig({ footerText: e.target.value })}
                      placeholder="Powered by TamOptiX Technologies"
                      className="h-9"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Footer Subtext
                        <span className="text-muted-foreground font-normal ml-1">(secondary line)</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {config.footerSubtext.length}/500
                      </span>
                    </div>
                    <Input
                      value={config.footerSubtext}
                      onChange={(e) => updateConfig({ footerSubtext: e.target.value })}
                      placeholder="TamOptiX Technologies | Intelligent CMMS Platform"
                      className="h-9"
                      maxLength={500}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between py-1">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Show TamOptiX Branding</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Display "TamOptiX Technologies" in report footer
                      </p>
                    </div>
                    <Switch
                      checked={config.showTamOptixBranding}
                      onCheckedChange={(v) => updateConfig({ showTamOptixBranding: v })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Paintbrush className="h-4 w-4" />
                    Footer Styling
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ColorPickerField
                    label="Footer Text Color"
                    value={config.footerColor}
                    onChange={(v) => updateConfig({ footerColor: v })}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Footer Font Size</Label>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
                        {config.footerFontSize}px
                      </span>
                    </div>
                    <Slider
                      value={[config.footerFontSize]}
                      onValueChange={([v]) => updateConfig({ footerFontSize: v })}
                      min={6}
                      max={24}
                      step={1}
                      className="flex-1"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>6px</span>
                      <span>24px</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Bold className="h-3.5 w-3.5" />
                      Bold
                    </Label>
                    <Switch
                      checked={config.footerBold}
                      onCheckedChange={(v) => updateConfig({ footerBold: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── COLORS TAB ── */}
            <TabsContent value="colors" className="space-y-4 mt-4 animate-in slide-in-from-top-2 duration-200">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Brand Color Scheme
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Primary brand colors used in table headers and accent elements across all exported reports
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <ColorPickerField
                    label="Primary Brand Color"
                    value={config.primaryColor}
                    onChange={(v) => updateConfig({ primaryColor: v })}
                  />
                  <ColorPickerField
                    label="Table Header Background"
                    value={config.headerBgColor}
                    onChange={(v) => updateConfig({ headerBgColor: v })}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Color Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="grid grid-cols-3 gap-0.5">
                      <div
                        className="h-12 flex items-center justify-center text-[9px] font-medium"
                        style={{
                          backgroundColor: config.primaryColor,
                          color: getContrastColor(config.primaryColor),
                        }}
                      >
                        Primary
                      </div>
                      <div
                        className="h-12 flex items-center justify-center text-[9px] font-medium"
                        style={{
                          backgroundColor: config.headerBgColor,
                          color: getContrastColor(config.headerBgColor),
                        }}
                      >
                        Header BG
                      </div>
                      <div
                        className="h-12 flex items-center justify-center text-[9px] font-medium"
                        style={{
                          backgroundColor: config.headerColor,
                          color: getContrastColor(config.headerColor),
                        }}
                      >
                        Header Text
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 p-3 bg-muted/20">
                      <div className="text-center">
                        <div className="text-[9px] font-mono">{config.primaryColor}</div>
                        <div className="text-[8px] text-muted-foreground">Primary</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] font-mono">{config.headerBgColor}</div>
                        <div className="text-[8px] text-muted-foreground">Header BG</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] font-mono">{config.footerColor}</div>
                        <div className="text-[8px] text-muted-foreground">Footer</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TYPOGRAPHY TAB ── */}
            <TabsContent value="typography" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Font Settings
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Control the base font family and text appearance across all report formats
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Base Font Family</Label>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                      Reports use the <strong>Inter</strong> font family by default. PDF exports support custom fonts; Excel uses workbook default fonts.
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Title Preview</p>
                      <p
                        style={{
                          fontSize: `${config.headerFontSize}px`,
                          fontWeight: config.headerBold ? "bold" : "normal",
                          textDecoration: config.headerUnderline ? "underline" : "none",
                          color: config.headerColor,
                        }}
                        className="truncate"
                      >
                        {config.headerTitle || "CMMS Report"}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Footer Preview</p>
                      <p
                        style={{
                          fontSize: `${config.footerFontSize}px`,
                          fontWeight: config.footerBold ? "bold" : "normal",
                          color: config.footerColor,
                        }}
                        className="truncate"
                      >
                        {config.footerText || "Powered by..."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── LAYOUT TAB ── */}
            <TabsContent value="layout" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Logo & Alignment
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Control how the logo and text are positioned in reports — logo alignment and header text alignment can be set independently
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Logo Alignment (independent of header text)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["left", "center", "right"] as const).map((align) => {
                        const Icon = ALIGNMENT_ICONS[align];
                        return (
                          <Button
                            key={align}
                            variant={config.logoAlignment === align ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig({ logoAlignment: align })}
                            className="gap-2 capitalize"
                          >
                            <Icon className="h-4 w-4" />
                            {align}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      The logo alignment was previously not working correctly — this has been fixed. Logo position is now independent of header text alignment.
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Header Text Alignment</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["left", "center", "right"] as const).map((align) => {
                        const Icon = ALIGNMENT_ICONS[align];
                        return (
                          <Button
                            key={align}
                            variant={config.headerAlignment === align ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig({ headerAlignment: align })}
                            className="gap-2 capitalize"
                          >
                            <Icon className="h-4 w-4" />
                            {align}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Columns3 className="h-4 w-4" />
                    Preview Layout
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-hidden bg-muted/20 p-4">
                    <div className="space-y-2 p-3 bg-white rounded border">
                      {/* Logo position (logoAlignment) */}
                      <div className="mb-2">
                        <div
                          className="text-[10px] text-muted-foreground mb-1"
                          style={{
                            textAlign: config.logoAlignment as "left" | "center" | "right",
                          }}
                        >
                          <span className="font-medium">Logo Position:</span> {config.logoAlignment}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              config.logoAlignment === "center"
                                ? "center"
                                : config.logoAlignment === "right"
                                  ? "flex-end"
                                  : "flex-start",
                          }}
                        >
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                            Logo
                          </div>
                        </div>
                      </div>
                      {/* Header text position (headerAlignment) */}
                      <Separator />
                      <div
                        style={{
                          textAlign: config.headerAlignment as "left" | "center" | "right",
                        }}
                        className="mt-2"
                      >
                        <div className="text-[10px] text-muted-foreground mb-1">
                          <span className="font-medium">Text Position:</span> {config.headerAlignment}
                        </div>
                        <div className="text-xs font-bold">Report Title</div>
                        <div className="text-[9px] text-muted-foreground">Subtitle line</div>
                        <div className="text-[8px] text-muted-foreground mt-1">
                          Generated: {new Date().toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── SHEETS TAB (NEW - Multi-sheet management) ── */}
            <TabsContent value="sheets" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Multi-Sheet Report Editor
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Create, rename, and configure multiple sheets for your report. Each sheet can have its own columns, data source, and chart configurations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SheetManager
                    sheets={config.sheetsConfig ?? []}
                    activeSheetId={activeSheetId}
                    onChange={(sheets, activeId) => {
                      updateConfig({ sheetsConfig: sheets });
                      setActiveSheetId(activeId);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── CELLS TAB (NEW - Cell defaults editor) ── */}
            <TabsContent value="cells" className="space-y-4 mt-4">
              <CellDefaultsEditor
                cellDefaults={config.cellDefaults}
                onChange={(style) => updateConfig({ cellDefaults: style })}
              />
            </TabsContent>

            {/* ── DATA SOURCE TAB (NEW) ── */}
            <TabsContent value="datasource" className="space-y-4 mt-4">
              <DataSourceConfig
                reportDataSource={config.reportDataSource}
                defaultDateRange={config.defaultDateRange}
                onChange={(data) =>
                  updateConfig({
                    reportDataSource: data.reportDataSource,
                    defaultDateRange: data.defaultDateRange,
                  })
                }
              />
            </TabsContent>

            {/* ── ADVANCED TAB (NEW) ── */}
            <TabsContent value="advanced" className="space-y-4 mt-4">
              <AdvancedSettings config={config} onChange={updateConfig} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Preview panel (2/5) ── */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>Live Preview</span>
                </CardTitle>
                <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                  {(["excel", "pdf", "csv"] as const).map((f) => (
                    <TooltipProvider key={f}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={previewFormat === f ? "default" : "ghost"}
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setPreviewFormat(f)}
                          >
                            {f === "excel" ? (
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                            ) : f === "pdf" ? (
                              <FileText className="h-3.5 w-3.5" />
                            ) : (
                              <Table className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-[10px]">
                          {f === "excel" ? "Excel format" : f === "pdf" ? "PDF format" : "CSV format"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
              <CardDescription className="text-[10px]">
                Previewing as{" "}
                <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                  {previewFormat === "excel" ? ".xlsx" : previewFormat === "pdf" ? ".pdf" : ".csv"}
                </Badge>
                {config.sheetsConfig && config.sheetsConfig.length > 1 && (
                  <span className="ml-1">
                    · {config.sheetsConfig.length} sheets
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="transition-all duration-300 ease-in-out" key={`${previewFormat}-${unsavedVersion}`}>
                <ReportPreview config={config} format={previewFormat} />
              </div>
            </CardContent>
            <div className="px-4 pb-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span>Real-time preview</span>
              </div>
              {hasChanges && (
                <div className="flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  Unsaved
                </div>
              )}
            </div>
          </Card>

          {/* Quick info card */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p>This configuration applies to <strong>all exported reports</strong> across the system:</p>
                  <ul className="list-disc pl-4 text-[10px] space-y-0.5">
                    <li>ESG Reports</li>
                    <li>Gate Entry Reports</li>
                    <li>Machine Reliability Reports</li>
                    <li>Any CSV/Excel/PDF exports</li>
                  </ul>
                  <p className="mt-1 text-[10px] italic">
                    Use the <strong>Sheets</strong> tab to configure multi-sheet reports with custom columns, data sources, and charts per sheet.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
