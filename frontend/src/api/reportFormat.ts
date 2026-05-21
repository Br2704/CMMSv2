import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface CellStyle {
  width?: number;
  height?: number;
  bgColor?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  wrapText?: boolean;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
}

export interface ColumnConfig {
  key: string;
  label: string;
  width?: number;
  visible?: boolean;
  dataType?: "text" | "number" | "date" | "image" | "boolean" | "currency";
  formula?: string;
  style?: CellStyle;
}

export interface RowConfig {
  height?: number;
  style?: CellStyle;
}

export interface ChartConfig {
  type: "bar" | "line" | "pie" | "area" | "radar" | "composed";
  title?: string;
  dataSource?: string;
  xAxisKey?: string;
  yAxisKeys?: string[];
  colorScheme?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  height?: number;
  position?: "top" | "bottom" | "left" | "right";
}

export interface SheetConfig {
  id: string;
  name: string;
  isActive?: boolean;
  dataSource?: string;
  dateRange?: number;
  columns?: ColumnConfig[];
  rows?: RowConfig[];
  charts?: ChartConfig[];
  filterExpression?: string;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}

export interface ReportFormatConfig {
  id: number;
  headerTitle: string;
  headerSubtitle: string;
  footerText: string;
  footerSubtext: string;
  showTamOptixBranding: boolean;
  showOrganizationLogo: boolean;
  showGeneratedDate: boolean;
  logoAlignment: "left" | "center" | "right";
  headerColor: string;
  footerColor: string;
  headerFontSize: number;
  footerFontSize: number;
  primaryColor: string;
  headerBgColor: string;
  headerBold: boolean;
  footerBold: boolean;
  headerUnderline: boolean;
  headerAlignment: "left" | "center" | "right";
  // Advanced fields
  sheetsConfig: SheetConfig[] | null;
  chartConfig: ChartConfig[] | null;
  cellDefaults: CellStyle | null;
  reportDataSource: string | null;
  defaultDateRange: number | null;
  organizationLogoUrl: string | null;
  tamoptixLogoUrl: string | null;
  reportLocale: string | null;
  defaultCellWidth: number | null;
  defaultCellHeight: number | null;
  showRowStriping: boolean | null;
  pageOrientation: "portrait" | "landscape" | null;
  paperSize: "A4" | "Letter" | "A3" | null;
  updatedAt: string;
}

export type ReportFormatConfigPayload = Partial<Omit<ReportFormatConfig, "id" | "updatedAt">>;

export function getReportFormatConfig() {
  return httpRequest<ApiResponse<ReportFormatConfig>>("/report-format/config", { method: "GET" });
}

export function updateReportFormatConfig(payload: ReportFormatConfigPayload) {
  return httpRequest<ApiResponse<ReportFormatConfig>>("/report-format/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
