import { z } from 'zod';

const hexColorRegex = /^#[0-9a-fA-F]{3,8}$/;

const cellStyleSchema = z.object({
  width: z.number().int().min(20).max(800).optional(),
  height: z.number().int().min(10).max(200).optional(),
  bgColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  textColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  fontSize: z.number().int().min(6).max(72).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  wrapText: z.boolean().optional(),
  borderTop: z.string().optional(),
  borderBottom: z.string().optional(),
  borderLeft: z.string().optional(),
  borderRight: z.string().optional(),
});

const columnConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  width: z.number().int().min(20).max(800).optional(),
  visible: z.boolean().optional().default(true),
  dataType: z.enum(['text', 'number', 'date', 'image', 'boolean', 'currency']).optional().default('text'),
  formula: z.string().optional(),
  style: cellStyleSchema.optional(),
});

const rowConfigSchema = z.object({
  height: z.number().int().min(10).max(200).optional(),
  style: cellStyleSchema.optional(),
});

const chartConfigSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'area', 'radar', 'composed']),
  title: z.string().max(200).optional(),
  dataSource: z.string().optional(),
  xAxisKey: z.string().optional(),
  yAxisKeys: z.array(z.string()).optional(),
  colorScheme: z.array(z.string()).optional(),
  showLegend: z.boolean().optional().default(true),
  showGrid: z.boolean().optional().default(true),
  height: z.number().int().min(100).max(800).optional().default(300),
  position: z.enum(['top', 'bottom', 'left', 'right']).optional().default('bottom'),
});

const sheetConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  isActive: z.boolean().optional().default(true),
  dataSource: z.string().optional(),
  dateRange: z.number().int().min(0).max(365).optional(),
  columns: z.array(columnConfigSchema).optional().default([]),
  rows: z.array(rowConfigSchema).optional().default([]),
  charts: z.array(chartConfigSchema).optional().default([]),
  filterExpression: z.string().optional(),
  sortColumn: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const updateReportFormatSchema = z.object({
  // Original fields
  headerTitle: z.string().min(1).max(500).optional(),
  headerSubtitle: z.string().max(200).optional(),
  footerText: z.string().max(200).optional(),
  footerSubtext: z.string().max(500).optional(),
  showTamOptixBranding: z.boolean().optional(),
  showOrganizationLogo: z.boolean().optional(),
  showGeneratedDate: z.boolean().optional(),
  logoAlignment: z.enum(['left', 'center', 'right']).optional(),
  headerColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  footerColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  headerFontSize: z.number().int().min(8).max(48).optional(),
  footerFontSize: z.number().int().min(6).max(24).optional(),
  primaryColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  headerBgColor: z.string().regex(hexColorRegex, 'Must be a hex color').optional(),
  headerBold: z.boolean().optional(),
  footerBold: z.boolean().optional(),
  headerUnderline: z.boolean().optional(),
  headerAlignment: z.enum(['left', 'center', 'right']).optional(),

  // New advanced fields
  sheetsConfig: z.array(sheetConfigSchema).optional(),
  chartConfig: z.array(chartConfigSchema).optional(),
  cellDefaults: cellStyleSchema.optional(),
  reportDataSource: z.string().max(100).optional(),
  defaultDateRange: z.number().int().min(0).max(365).optional(),
  organizationLogoUrl: z.string().optional().nullable(),
  tamoptixLogoUrl: z.string().optional(),
  reportLocale: z.string().max(10).optional(),
  defaultCellWidth: z.number().int().min(20).max(800).optional(),
  defaultCellHeight: z.number().int().min(10).max(200).optional(),
  showRowStriping: z.boolean().optional(),
  pageOrientation: z.enum(['portrait', 'landscape']).optional(),
  paperSize: z.enum(['A4', 'Letter', 'A3']).optional(),
});
