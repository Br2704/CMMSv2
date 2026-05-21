import { type ReportFormatConfigPayload, type ChartConfig } from "@/api/reportFormat";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
} from "lucide-react";

export type PreviewFormat = "excel" | "pdf" | "csv";

export interface ColorPreset {
  label: string;
  value: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { label: "Black", value: "#000000" },
  { label: "Dark Gray", value: "#111827" },
  { label: "Gray", value: "#6B7280" },
  { label: "Blue", value: "#2563EB" },
  { label: "Dark Blue", value: "#1E3A5F" },
  { label: "Indigo", value: "#4F46E5" },
  { label: "Purple", value: "#7C3AED" },
  { label: "Red", value: "#DC2626" },
  { label: "Orange", value: "#EA580C" },
  { label: "Amber", value: "#D97706" },
  { label: "Green", value: "#16A34A" },
  { label: "Teal", value: "#0D9488" },
  { label: "Cyan", value: "#06B6D4" },
  { label: "Pink", value: "#DB2777" },
  { label: "White", value: "#FFFFFF" },
  { label: "Slate", value: "#475569" },
];

export const CHART_TYPE_OPTIONS = [
  { value: "bar", label: "Bar Chart", icon: BarChart3 },
  { value: "line", label: "Line Chart", icon: LineChart },
  { value: "pie", label: "Pie Chart", icon: PieChart },
  { value: "area", label: "Area Chart", icon: AreaChart },
  { value: "radar", label: "Radar Chart", icon: BarChart3 },
  { value: "composed", label: "Composed Chart", icon: BarChart3 },
];

export const DATA_SOURCE_OPTIONS = [
  { value: "work_orders", label: "Work Orders" },
  { value: "assets", label: "Assets" },
  { value: "inventory", label: "Inventory" },
  { value: "safety", label: "Safety Incidents" },
  { value: "gates", label: "Gate Entries" },
  { value: "esg", label: "ESG Reports" },
  { value: "calibration", label: "Calibration" },
  { value: "maintenance", label: "Maintenance" },
  { value: "pm", label: "Preventive Maintenance" },
];

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "nl", label: "Nederlands" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
];

export const PAPER_SIZE_OPTIONS = [
  { value: "A4", label: "A4 (210×297mm)" },
  { value: "Letter", label: "Letter (216×279mm)" },
  { value: "A3", label: "A3 (297×420mm)" },
];

export const ORIENTATION_OPTIONS = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

export const DATA_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "image", label: "Image" },
  { value: "boolean", label: "Boolean" },
  { value: "currency", label: "Currency" },
];

export const ALIGNMENT_ICONS: Record<string, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

export const DEFAULT_CONFIG: ReportFormatConfigPayload = {
  headerTitle: "CMMS Report",
  headerSubtitle: "",
  footerText: "Powered by TamOptiX Technologies",
  footerSubtext: "TamOptiX Technologies | Intelligent CMMS Platform",
  showTamOptixBranding: true,
  showOrganizationLogo: true,
  showGeneratedDate: true,
  logoAlignment: "left",
  headerColor: "#000000",
  footerColor: "#6B7280",
  headerFontSize: 14,
  footerFontSize: 8,
  primaryColor: "#111827",
  headerBgColor: "#000000",
  headerBold: true,
  footerBold: true,
  headerUnderline: true,
  headerAlignment: "left",
  sheetsConfig: [
    {
      id: "sheet-default",
      name: "Sheet1",
      isActive: true,
      dataSource: "work_orders",
      dateRange: 30,
      columns: [
        { key: "wo_number", label: "WO #", width: 100, dataType: "text" },
        { key: "asset_name", label: "Asset", width: 140, dataType: "text" },
        { key: "status", label: "Status", width: 100, dataType: "text" },
        { key: "created_date", label: "Date", width: 110, dataType: "date" },
        { key: "priority", label: "Priority", width: 90, dataType: "text" },
      ],
      charts: [],
    },
  ],
  chartConfig: [],
  cellDefaults: {
    width: 120,
    height: 30,
    bgColor: "#FFFFFF",
    textColor: "#374151",
    fontSize: 10,
    alignment: "left",
    verticalAlign: "middle",
    wrapText: true,
  },
  reportDataSource: "work_orders",
  defaultDateRange: 30,
  organizationLogoUrl: null,
  tamoptixLogoUrl: "/tamoptix/tamoptix-logo.svg",
  reportLocale: "en",
  defaultCellWidth: 120,
  defaultCellHeight: 30,
  showRowStriping: true,
  pageOrientation: "portrait",
  paperSize: "A4",
};

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.substring(0, 2) || "00", 16);
  const g = Number.parseInt(clean.substring(2, 4) || "00", 16);
  const b = Number.parseInt(clean.substring(4, 6) || "00", 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.substring(0, 2) || "00", 16);
  const g = Number.parseInt(clean.substring(2, 4) || "00", 16);
  const b = Number.parseInt(clean.substring(4, 6) || "00", 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export function generateId(): string {
  return `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Map common locale codes to their CSV delimiter convention. */
export function getCsvDelimiter(locale: string): string {
  const semicolonLocales = ["de", "fr", "it", "es", "pt", "nl", "ar", "hi"];
  return semicolonLocales.includes(locale) ? ";" : ",";
}

/** Format a cell value for CSV display using locale-aware Intl APIs. */
export function formatCsvValue(value: unknown, locale: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(value));
    } catch {}
  }
  if (typeof value === "number") {
    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {}
  }
  return String(value);
}

/** Escape a cell value for CSV: format with Intl, escape formulas and delimiters. */
export function escapeCsvCell(value: unknown, locale: string, delimiter: string): string {
  const text = formatCsvValue(value, locale);
  if (!text) return "";
  const escaped = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (escaped.includes(delimiter) || /["\n\r]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}
