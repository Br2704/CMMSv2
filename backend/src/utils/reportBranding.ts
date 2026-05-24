import { AppDataSource } from '../database/data-source';
import { ReportFormatConfigEntity } from '../database/entities/report-format-config.entity';

const CONFIG_ID = 1;

async function getConfig(): Promise<ReportFormatConfigEntity | null> {
  try {
    const repo = AppDataSource.getRepository(ReportFormatConfigEntity);
    return repo.findOneBy({ id: CONFIG_ID });
  } catch {
    return null;
  }
}

function tryParseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function getReportBranding(options?: {
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  generatedAt?: string;
  reportTitle?: string;
  reportDataSource?: string;
  dateRange?: number;
  locale?: string;
}) {
  const config = await getConfig();
  const orgName = options?.organizationName ?? 'CMMS Organization';
  const now = options?.generatedAt ?? new Date().toISOString();
  const generatedDate = new Date().toLocaleString();

  const headerTitle = config?.headerTitle ?? 'CMMS Report';
  const headerSubtitle = config?.headerSubtitle ?? '';
  const footerText = config?.footerText ?? 'Powered by TamOptiX Technologies';
  const footerSubtext = config?.footerSubtext ?? 'TamOptiX Technologies | Intelligent CMMS Platform';
  const showTamOptix = config?.showTamOptixBranding ?? true;
  const showDate = config?.showGeneratedDate ?? true;

  // Styling fields from config
  const primaryColor = config?.primaryColor ?? '#111827';
  const headerBgColor = config?.headerBgColor ?? '#000000';
  const headerFontSize = config?.headerFontSize ?? 14;
  const footerFontSize = config?.footerFontSize ?? 8;

  // Layout & formatting fields from config
  const headerBold = config?.headerBold ?? true;
  const headerUnderline = config?.headerUnderline ?? true;
  const headerAlignment = config?.headerAlignment ?? 'left';
  const logoAlignment = config?.logoAlignment ?? 'left';
  const headerColorVal = config?.headerColor ?? '#000000';
  const footerColorVal = config?.footerColor ?? '#6B7280';
  const footerBold = config?.footerBold ?? true;
  const showOrgLogo = config?.showOrganizationLogo ?? true;

  // Advanced fields
  const sheetsConfig = tryParseJson(config?.sheetsConfig);
  const chartConfig = tryParseJson(config?.chartConfig);
  const cellDefaults = tryParseJson(config?.cellDefaults);
  const reportDataSource = options?.reportDataSource ?? config?.reportDataSource ?? 'work_orders';
  const defaultDateRange = options?.dateRange ?? config?.defaultDateRange ?? 30;
  const orgLogoUrl = options?.organizationLogoUrl ?? config?.organizationLogoUrl ?? null;
  const tamoptixLogoUrl = config?.tamoptixLogoUrl ?? '/tamoptix/tamoptix-logo.svg';
  const reportLocale = options?.locale ?? config?.reportLocale ?? 'en';
  const defaultCellWidth = config?.defaultCellWidth ?? 120;
  const defaultCellHeight = config?.defaultCellHeight ?? 30;
  const showRowStriping = config?.showRowStriping ?? true;
  const pageOrientation = config?.pageOrientation ?? 'portrait';
  const paperSize = config?.paperSize ?? 'A4';

  // Combined footer string used by existing utils
  const fullFooter = showTamOptix && footerSubtext
    ? `${footerSubtext} | ${footerText}`
    : footerText;

  return {
    organizationName: orgName,
    organizationLogoUrl: orgLogoUrl,
    generatedAt: now,
    footerBranding: fullFooter,
    headerLine: showDate
      ? `${orgName} | ${headerTitle} | Generated: ${generatedDate}`
      : `${orgName} | ${headerTitle}`,
    footerText,
    footerSubtext,
    showOrganizationLogo: showOrgLogo,
    showTamOptixBranding: showTamOptix,
    showGeneratedDate: showDate,
    headerTitle,
    headerSubtitle,
    // Styling fields that excel.ts and pdf.ts consume
    primaryColor,
    headerBgColor,
    headerFontSize,
    footerFontSize,
    // Layout & formatting fields
    headerBold,
    headerUnderline,
    headerAlignment,
    logoAlignment,
    headerColor: headerColorVal,
    footerColor: footerColorVal,
    footerBold,
    // Advanced fields
    sheetsConfig,
    chartConfig,
    cellDefaults,
    reportDataSource,
    defaultDateRange,
    tamoptixLogoUrl,
    reportLocale,
    defaultCellWidth,
    defaultCellHeight,
    showRowStriping,
    pageOrientation,
    paperSize,
  };
}
