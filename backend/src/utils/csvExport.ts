function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map((item) => escapeCell(item)).join(',');
  const bodyLines = rows.map((row) => row.map((cell) => escapeCell(cell)).join(','));
  return [headerLine, ...bodyLines].join('\n');
}
