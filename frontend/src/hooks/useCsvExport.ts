import { useCallback } from "react";

interface CsvExportOptions<T> {
  items: T[];
  filename?: string;
  columns: { key: string; header: string; render?: (item: T) => string }[];
}

function sanitizeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function useCsvExport<T extends Record<string, unknown>>() {
  const exportCsv = useCallback(({ items, filename = "export", columns }: CsvExportOptions<T>) => {
    const headerRow = columns.map((col) => sanitizeCsvValue(col.header)).join(",");
    const dataRows = items.map((item) =>
      columns.map((col) => {
        if (col.render) return sanitizeCsvValue(col.render(item));
        return sanitizeCsvValue(item[col.key]);
      }).join(","),
    );
    const csv = [headerRow, ...dataRows].join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return { exportCsv };
}
