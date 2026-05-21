function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

type SimplePdfOptions = {
  title?: string;
  subtitle?: string;
  organizationLogoUrl?: string | null;
  showOrganizationLogo?: boolean;
  generatedAt?: string;
  footerBranding?: string;
  primaryColor?: string | null;
  headerBgColor?: string | null;
  headerFontSize?: number | null;
  footerFontSize?: number | null;
  headerBold?: boolean;
  headerUnderline?: boolean;
  headerAlignment?: string | null;
  logoAlignment?: string | null;
  headerColor?: string | null;
  footerColor?: string | null;
  footerBold?: boolean;
};

function textLineCommand(text: string, x: number, y: number, size: number, fontName = 'F1') {
  return `BT\n/${fontName} ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n(${escapePdfText(text)}) Tj\nET`;
}

// Convert a hex color (#RRGGBB) to PDF RGB values (0..1 range)
function hexToPdfRgb(hex: string | null | undefined): string {
  const clean = (hex ?? '#000000').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`;
}

function computeHeaderX(alignment: string | null | undefined): number {
  const align = (alignment ?? 'left').trim();
  if (align === 'center') return 190;  // Centered on page
  if (align === 'right') return 400;   // Right-aligned
  return 50; // Left-aligned
}

export function createSimplePdf(lines: string[], options: SimplePdfOptions = {}) {
  const safeLines = lines.length > 0 ? lines : ['No data'];
  const title = options.title?.trim() || 'CMMS Report';
  const subtitle = options.subtitle?.trim() || '';
  const generatedAt = options.generatedAt?.trim() || new Date().toISOString();
  const footerBranding = options.footerBranding?.trim() || 'Powered by TamOptix Technologies';
  const primaryColor = hexToPdfRgb(options.primaryColor);
  const headerFontSize = options.headerFontSize ?? 16;
  const footerFontSize = options.footerFontSize ?? 8;
  const headerColorVal = hexToPdfRgb(options.headerColor || options.primaryColor);
  const footerColorVal = hexToPdfRgb(options.footerColor || '#6B7280');
  const hBold = options.headerBold !== false;
  const hUnderline = options.headerUnderline === true;
  const hAlign = options.headerAlignment?.trim() || 'left';
  const logoAlign = options.logoAlignment?.trim() || 'left';
  const fBold = options.footerBold !== false;

  // Determine font: F1=normal, F2=bold (only register if headerBold is true)
  const titleFont = hBold ? 'F2' : 'F1';

  const commands: string[] = [];

  // Header - Professional Letterhead with dynamic color
  commands.push(headerColorVal); // Dynamic color for header text
  const headerX = computeHeaderX(hAlign);
  const logoX = computeHeaderX(logoAlign);
  if (subtitle && options.showOrganizationLogo !== false) {
    commands.push(textLineCommand(subtitle.toUpperCase(), logoX, 805, headerFontSize, titleFont));
  }
  commands.push(textLineCommand(title, headerX, 788, Math.max(10, headerFontSize - 4), titleFont));

  // Underline for header if enabled (draw a line under the title)
  if (hUnderline) {
    const lineY = 780;
    commands.push(headerColorVal.replace('rg', 'RG')); // Stroke color = header color
    commands.push('40 765 m');
    commands.push('555 765 l');
    commands.push('S');
  } else {
    commands.push('0.1 0.1 0.1 RG');
    commands.push('40 765 m');
    commands.push('555 765 l');
    commands.push('S');
  }

  // Body
  let y = 740;
  for (const line of safeLines) {
    if (y < 72) break;
    commands.push(textLineCommand(line, 50, y, 10));
    y -= 14;
  }

  // Footer - TamOptiX Branding with dynamic colors
  commands.push('0.8 0.8 0.8 RG');
  commands.push('40 60 m');
  commands.push('555 60 l');
  commands.push('S');

  // Footer text
  const footerFont = fBold ? 'F2' : 'F1';
  commands.push(footerColorVal);
  commands.push(textLineCommand('TamOptiX Technologies | Intelligent CMMS Platform', 50, 48, 7, footerFont));
  commands.push(textLineCommand(footerBranding, 50, 38, Math.max(5, footerFontSize), footerFont));
  commands.push(textLineCommand('CONFIDENTIAL', 280, 48, 6));
  commands.push(textLineCommand('Page 1', 520, 48, 7));

  const stream = commands.join('\n');

  // Build font dictionary: F1 = Helvetica, F2 = Helvetica-Bold (if bold is needed)
  const fontEntries = hBold || fBold
    ? '<</F1 4 0 R /F2 5 0 R>>'
    : '<</F1 4 0 R>>';
  const fontObjects = hBold || fBold
    ? [
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    ]
    : ['4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'];

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font ${fontEntries} >> /Contents 5 0 R >> endobj`,
    ...fontObjects,
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    const offset = String(offsets[i]).padStart(10, '0');
    pdf += `${offset} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
