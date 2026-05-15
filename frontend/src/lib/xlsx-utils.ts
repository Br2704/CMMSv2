import * as XLSX from "xlsx-js-style";

export function parseFileContent(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", codepage: 65001 });
        
        // Find the most likely data sheet: 
        // 1. A sheet with "upload" in the name
        // 2. A sheet with "data" in the name
        // 3. Otherwise, fall back to the first sheet that isn't "Instructions"
        let sheetName = workbook.SheetNames[0];
        const dataSheet = workbook.SheetNames.find(name => 
          name.toLowerCase().includes("upload") || 
          name.toLowerCase().includes("data") ||
          name.toLowerCase().includes("entry")
        );
        
        if (dataSheet) {
          sheetName = dataSheet;
        } else if (sheetName.toLowerCase().includes("instruction") && workbook.SheetNames.length > 1) {
          sheetName = workbook.SheetNames[1];
        }

        const firstSheet = workbook.Sheets[sheetName];
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
  sheetName = "Data Entry",
) {
  const headerRow = columns.map((c) => c.key);
  const labelRow = columns.map((c) => (c.required ? `${c.label} *` : c.label));
  
  const ws = XLSX.utils.aoa_to_sheet([headerRow, labelRow, ...sampleRows]);
  
  // Set column widths
  const colWidths = columns.map((c) => ({ wch: Math.max(c.label.length + 5, 18) }));
  ws["!cols"] = colWidths;
  
  // Freeze header rows
  ws["!freeze"] = { xSplit: 0, ySplit: 2, topLeftCell: "A3", activePane: "bottomLeft", state: "frozen" };
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Add a simple reference sheet if there's any info
  const refRows = [["FIELD GUIDE", "DESCRIPTION"], ...columns.map(c => [c.label, c.required ? "Required Field" : "Optional Field"])];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
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
