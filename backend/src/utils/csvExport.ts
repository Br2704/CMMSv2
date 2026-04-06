function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const normalized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map((item) => escapeCell(item)).join(',');
  const bodyLines = rows.map((row) => row.map((cell) => escapeCell(cell)).join(','));
  return [headerLine, ...bodyLines].join('\n');
}
