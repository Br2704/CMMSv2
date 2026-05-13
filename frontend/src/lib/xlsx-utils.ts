import * as XLSX from "xlsx";

export function parseFileContent(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", codepage: 65001 });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: "" });
        resolve(rows.map((row) => row.map((cell: unknown) => String(cell ?? ""))));
      } catch (err) {
        reject(new Error("Failed to read spreadsheet: " + (err instanceof Error ? err.message : "unknown error")));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export function downloadXlsxTemplate(
  fileName: string,
  columns: Array<{ key: string; label: string; required?: boolean }>,
  sampleRows: string[][],
  sheetName = "Template",
) {
  const headerRow = columns.map((c) => (c.required ? `${c.label} *` : c.label));
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...sampleRows]);
  const colWidths = columns.map((c) => ({ wch: Math.max(c.label.length + 3, 15) }));
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const refSheet = XLSX.utils.aoa_to_sheet([["Allowed Values", ""]]);
  XLSX.utils.book_append_sheet(wb, refSheet, "Reference");
  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
