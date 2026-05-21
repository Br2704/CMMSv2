function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const normalized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[\",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/\"/g, '""')}"`;
  }
  return normalized;
}

export interface CsvBranding {
  headerTitle?: string;
  organizationName?: string;
  generatedAt?: string;
  footerText?: string;
  footerSubtext?: string;
  showTamOptixBranding?: boolean;
  showGeneratedDate?: boolean;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>, branding?: CsvBranding): string {
  const headerLine = headers.map((item) => escapeCell(item)).join(',');
  const bodyLines = rows.map((row) => row.map((cell) => escapeCell(cell)).join(','));

  if (!branding) {
    return [headerLine, ...bodyLines].join('\n');
  }

  const now = branding.generatedAt ?? new Date().toISOString();
  const orgName = branding.organizationName ?? 'CMMS Organization';
  const title = branding.headerTitle ?? 'CMMS Report';
  const footerText = branding.footerText ?? 'Powered by TamOptix Technologies';
  const footerSubtext = branding.footerSubtext ?? 'TamOptiX Technologies | Intelligent CMMS Platform';
  const showTamOptix = branding.showTamOptixBranding ?? true;
  const showDate = branding.showGeneratedDate ?? true;

  const metaLines: string[] = [];

  // Header section
  const headerMeta = title.toUpperCase();
  metaLines.push([escapeCell(headerMeta), ''].join(','));
  metaLines.push([escapeCell(orgName)].concat(Array(headers.length - 1).fill('')).join(','));

  if (showDate) {
    metaLines.push([escapeCell(`Generated: ${now}`)].concat(Array(headers.length - 1).fill('')).join(','));
  }

  // Spacing
  metaLines.push('');

  // Data
  metaLines.push(headerLine);
  metaLines.push(...bodyLines);

  // Spacing before footer
  metaLines.push('');

  // Footer section
  if (showTamOptix && footerSubtext) {
    metaLines.push([escapeCell(footerSubtext)].concat(Array(headers.length - 1).fill('')).join(','));
  }
  metaLines.push([escapeCell(footerText)].concat(Array(headers.length - 1).fill('')).join(','));

  return metaLines.join('\n');
}
