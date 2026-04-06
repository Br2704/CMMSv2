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
  const footerBranding = options.footerBranding?.trim() || 'Powered by TamOptix Technologies';

  const commands: string[] = [];

  // Header card
  commands.push('0.95 0.96 0.98 rg');
  commands.push('40 770 515 52 re');
  commands.push('f');
  commands.push('0.78 0.82 0.88 RG');
  commands.push('40 770 m');
  commands.push('555 770 l');
  commands.push('S');

  if (options.organizationLogoUrl) {
    commands.push(textLineCommand(`Organization Logo: ${options.organizationLogoUrl}`, 50, 810, 8));
  }
  commands.push(textLineCommand(title, 50, 791, 14));
  if (subtitle) {
    commands.push(textLineCommand(subtitle, 50, 778, 10));
  }
  commands.push(textLineCommand(`Generated At: ${generatedAt}`, 50, 764, 8));

  // Body
  let y = 742;
  for (const line of safeLines) {
    if (y < 72) break;
    commands.push(textLineCommand(line, 50, y, 10));
    y -= 14;
  }

  // Footer
  commands.push('0.78 0.82 0.88 RG');
  commands.push('40 54 m');
  commands.push('555 54 l');
  commands.push('S');
  commands.push(textLineCommand(footerBranding, 50, 38, 8));
  commands.push(textLineCommand('Page 1', 520, 38, 8));

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

