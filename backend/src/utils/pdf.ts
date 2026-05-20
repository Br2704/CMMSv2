function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

type SimplePdfOptions = {
  title?: string;
  subtitle?: string;
  organizationLogoUrl?: string | null;
  generatedAt?: string;
  footerBranding?: string;
};

function textLineCommand(text: string, x: number, y: number, size: number) {
  return `BT\n/F1 ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n(${escapePdfText(text)}) Tj\nET`;
}

export function createSimplePdf(lines: string[], options: SimplePdfOptions = {}) {
  const safeLines = lines.length > 0 ? lines : ['No data'];
  const title = options.title?.trim() || 'CMMS Report';
  const subtitle = options.subtitle?.trim() || '';
  const generatedAt = options.generatedAt?.trim() || new Date().toISOString();
  const footerBranding = options.footerBranding?.trim() || 'Powered by TamOptiX Technologies';

  const commands: string[] = [];

  // Header - Professional Letterhead
  commands.push('0 g'); // Black color for text
  if (subtitle) {
    commands.push(textLineCommand(subtitle.toUpperCase(), 50, 805, 16)); // Organization Name prominent
  }
  commands.push(textLineCommand(title, 50, 788, 12)); // Report Title
  commands.push(textLineCommand(`Generated: ${generatedAt}`, 50, 775, 8)); // Generation date

  // Decorative header line
  commands.push('0.1 0.1 0.1 RG');
  commands.push('40 765 m');
  commands.push('555 765 l');
  commands.push('S');

  // Body
  let y = 740;
  for (const line of safeLines) {
    if (y < 72) break;
    commands.push(textLineCommand(line, 50, y, 10));
    y -= 14;
  }

  // Footer - TamOptiX Branding
  commands.push('0.8 0.8 0.8 RG');
  commands.push('40 60 m');
  commands.push('555 60 l');
  commands.push('S');
  
  // Footer text
  commands.push('0.3 0.3 0.3 rg'); // Dark gray
  commands.push(textLineCommand('TamOptiX Technologies | Intelligent CMMS Platform', 50, 48, 7));
  commands.push(textLineCommand(footerBranding, 50, 38, 6));
  commands.push(textLineCommand('CONFIDENTIAL', 280, 48, 6));
  commands.push(textLineCommand('Page 1', 520, 48, 7));

  const stream = commands.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
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

