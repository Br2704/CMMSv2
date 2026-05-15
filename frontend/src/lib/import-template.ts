import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";

export interface CsvTemplateColumn {
  key: string;
  label?: string;
  required?: boolean;
  example?: string;
  description?: string;
  allowedValues?: string[];
  format?: string;
}

export interface CsvTemplateReferenceSection {
  title: string;
  values: string[];
}

export interface CsvTemplateConfig {
  fileName: string;
  columns: CsvTemplateColumn[];
  exampleRows: string[][];
  instructions?: string[];
  referenceSections?: CsvTemplateReferenceSection[];
}

export interface ExcelTemplateColumn extends CsvTemplateColumn {
  width?: number;
  type?: "text" | "date" | "number";
}

export interface ExcelTemplateConfig {
  fileName: string;
  title: string;
  uploadSheetName: string;
  columns: ExcelTemplateColumn[];
  rows: string[][];
  referenceSections?: CsvTemplateReferenceSection[];
  instructions?: string[];
}

export function normalizeHeaderName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^-+|-+$/g, "");
}

export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell.trim());
    currentCell = "";
  };

  const pushRow = () => {
    if (currentRow.length === 0) return;
    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      pushCell();
      pushRow();
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += char;
  }

  pushCell();
  pushRow();

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

export function isCsvHelperRow(row: string[]) {
  const firstCell = (row[0] || "").trim();
  const lowerFirst = firstCell.toLowerCase();

  // Explicit helper markers
  if (firstCell.startsWith("#") || firstCell.startsWith("__")) return true;

  // Skip our specific enterprise template metadata rows
  if (lowerFirst.startsWith("guidance:") || lowerFirst.startsWith("validation:")) return true;

  // Skip badge row: check if the first cell is exactly "REQUIRED" or "OPTIONAL"
  const upperFirst = firstCell.toUpperCase();
  if (upperFirst === "REQUIRED" || upperFirst === "OPTIONAL") return true;

  // Skip label row: our labels in Row 2 always end with " *" for required or have a specific style.
  // We check if the first cell ends with " *" or matches the known header key but with spaces.
  if (firstCell.endsWith(" *")) return true;

  // Skip the example row ONLY if it's explicitly marked
  if (lowerFirst.startsWith("example:") || lowerFirst.includes("sample user") || lowerFirst.includes("example user") || lowerFirst.includes("sample mch") || lowerFirst.includes("example mch")) {
    return true;
  }

  return false;
}

function csvCell(value: string) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsvTemplate(fileName: string, headers: string[], rows: string[][]) {
  downloadCsv(fileName, [headers, ...rows]);
}

function optionText(values: string[] | undefined) {
  const filtered = Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
  return filtered.length > 0 ? filtered.join(" | ") : "";
}

export function downloadEnterpriseCsvTemplate(config: CsvTemplateConfig) {
  const headers = config.columns.map((column) => column.key);
  const helperRow = (marker: string, values: string[]) => [marker, ...values];
  const helperRows: string[][] = [
    helperRow("__instructions", [
      (config.instructions || [
        "Keep the header row unchanged.",
        "Use exact values from allowed_values for dropdown fields.",
        "Delete helper rows that start with __ or # before importing if your spreadsheet tool keeps them.",
      ]).join(" "),
    ]),
    helperRow("__required", config.columns.map((column) => `${column.key}: ${column.required ? "required" : "optional"}`)),
    helperRow("__example", config.columns.map((column) => `${column.key}: ${column.example || ""}`)),
    helperRow("__allowed_values", config.columns.map((column) => `${column.key}: ${optionText(column.allowedValues) || "free text"}`)),
    helperRow(
      "__field_notes",
      config.columns.map((column) => `${column.key}: ${[column.label, column.description, column.format].filter(Boolean).join(" - ")}`),
    ),
  ];

  const referenceRows = (config.referenceSections || []).flatMap((section) => {
    const rows = [[`# ${section.title}`, "Allowed/reference values"]];
    const values = section.values.map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) {
      rows.push(["#", "No values available"]);
      return rows;
    }
    values.forEach((value) => rows.push(["#", value]));
    return rows;
  });

  downloadCsv(config.fileName, [
    headers,
    ...helperRows,
    ...config.exampleRows,
    ...(referenceRows.length > 0 ? [[], ...referenceRows] : []),
  ]);
}



// ── ExcelJS Enterprise Template Generation ──────────────────────────────────────

export async function downloadEnterpriseExcelTemplate(config: ExcelTemplateConfig) {
  const workbook = new ExcelJS.Workbook();
  const cols = config.columns;

  // ── INSTRUCTIONS SHEET (First Sheet) ────────────────────────────────────────
  const instrSheet = workbook.addWorksheet("Instructions");
  instrSheet.getColumn(1).width = 10;
  instrSheet.getColumn(2).width = 25;
  instrSheet.getColumn(3).width = 80;

  const bannerRow = instrSheet.addRow(["IMPORT GUIDE & BEST PRACTICES"]);
  bannerRow.height = 35;
  bannerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  bannerRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  bannerRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  instrSheet.mergeCells(1, 1, 1, 3);

  const titleRow = instrSheet.addRow([config.title]);
  titleRow.height = 25;
  titleRow.getCell(1).font = { bold: true, color: { argb: "FF334155" }, size: 12 };
  instrSheet.mergeCells(2, 1, 2, 3);

  instrSheet.addRow([]); // Blank spacer

  const headRow = instrSheet.addRow(["Step", "Action", "Details"]);
  headRow.height = 20;
  [1, 2, 3].forEach(c => {
    const cell = headRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const steps = [
    ["1", "Open Upload Sheet", `Go to the '${config.uploadSheetName}' tab to enter your data.`],
    ["2", "Required Fields", "RED headers marked with * are mandatory — blank rows will be skipped."],
    ["3", "Optional Fields", "BLUE headers are optional — leave blank if not applicable."],
    ["4", "Dropdowns", "Click any data cell to see the dropdown arrow. Pick a valid value."],
    ["5", "Dates", "Enter dates as YYYY-MM-DD (e.g. 2024-06-15)."],
    ["6", "Frozen Rows", "The top 5 header rows are frozen — scroll down to enter all records."],
    ["7", "Upload", "Save and upload via Bulk Actions > Import Spreadsheet on the portal."],
  ];

  steps.forEach((step, index) => {
    const row = instrSheet.addRow(step);
    row.height = 24;
    const isAlt = index % 2 === 1;
    [1, 2, 3].forEach(c => {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? "FFFFFFFF" : "FFF8FAFC" } };
      cell.font = { color: { argb: "FF334155" }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    });
  });

  instrSheet.addRow([]);
  const footerRow = instrSheet.addRow(["", "Powered by TamOptiX Technologies"]);
  footerRow.getCell(2).font = { italic: true, color: { argb: "FF94A3B8" }, size: 9 };


  // ── UPLOAD SHEET (Main Data Entry) ──────────────────────────────────────────
  const isUserTemplate = config.fileName.toLowerCase().includes("user");
  const headerRowCount = isUserTemplate ? 6 : 5; // User wants row 7 for users (6 header rows), row 6 for machines (5 header rows)

  const ws = workbook.addWorksheet(config.uploadSheetName, {
    views: [{ state: "frozen", xSplit: 0, ySplit: headerRowCount, activePane: "bottomLeft" }]
  });

  // Set column widths and keys
  ws.columns = cols.map(c => ({
    header: c.key,
    key: c.key,
    width: Math.max((c.width || 120) / 7.5, 15)
  }));

  // Add the 5 header rows manually to apply complex styles
  // Row 1: Keys
  const row1 = ws.getRow(1);
  row1.values = cols.map(c => c.key);
  row1.height = 18;
  cols.forEach((_, i) => {
    const cell = row1.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.font = { color: { argb: "FFCBD5E1" }, size: 8, italic: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Row 2: Labels
  const row2 = ws.getRow(2);
  row2.values = cols.map(c => `${c.label || c.key}${c.required ? " *" : ""}`);
  row2.height = 36;
  cols.forEach((c, i) => {
    const cell = row2.getCell(i + 1);
    const isReq = !!c.required;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isReq ? "FFDC2626" : "FF0284C7" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thick", color: { argb: isReq ? "FF991B1B" : "FF0369A1" } } };
  });

  // Row 3: Badges
  const row3 = ws.getRow(3);
  row3.values = cols.map(c => (c.required ? "REQUIRED" : "OPTIONAL"));
  row3.height = 16;
  cols.forEach((c, i) => {
    const cell = row3.getCell(i + 1);
    const isReq = !!c.required;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isReq ? "FFFEF2F2" : "FFF0F9FF" } };
    cell.font = { bold: true, color: { argb: isReq ? "FFEF4444" : "FF0EA5E9" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: isReq ? "FFFCA5A5" : "FF7DD3FC" } } };
  });

  // Row 4: Descriptions (Guidance)
  const row4 = ws.getRow(4);
  row4.values = cols.map((c, i) => (i === 0 ? `GUIDANCE: ${c.description || ""}` : c.description || c.format || ""));
  row4.height = 44;
  cols.forEach((_, i) => {
    const cell = row4.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    cell.font = { italic: true, color: { argb: "FF64748B" }, size: 9 };
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  });

  // Row 5: Validation/Format (Optional, only for Users to shift data to Row 7)
  if (isUserTemplate) {
    const rowV = ws.getRow(5);
    rowV.values = cols.map((c, i) => (i === 0 ? `VALIDATION: ${c.format || "Allowed list only"}` : c.format || "Allowed list only"));
    rowV.height = 18;
    cols.forEach((_, i) => {
      const cell = rowV.getCell(i + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.font = { italic: true, color: { argb: "FF475569" }, size: 9 };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
  }

  // Row 5/6: Examples
  const exampleRowIdx = isUserTemplate ? 6 : 5;
  const rowE = ws.getRow(exampleRowIdx);
  rowE.values = cols.map((c, i) => (i === 0 ? `EXAMPLE: ${c.example || ""}` : c.example || ""));
  rowE.height = 20;
  cols.forEach((_, i) => {
    const cell = rowE.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.font = { color: { argb: "FFB45309" }, size: 10, italic: true };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: "FFF59E0B" } } };
  });

  // Add initial rows (starting from row 6 or 7)
  const dataStartRow = exampleRowIdx + 1;
  config.rows.forEach((rowData, rIdx) => {
    const row = ws.getRow(dataStartRow + rIdx);
    row.values = rowData;
    row.height = 22;
    cols.forEach((_, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.font = { color: { argb: "FF334155" }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };
    });
  });

  // ── REFERENCE SHEET & DATA VALIDATION ───────────────────────────────────────
  const refSheet = workbook.addWorksheet("Reference", { state: "hidden" });
  const validCols = cols.filter(c => c.allowedValues && c.allowedValues.length > 0);

  if (validCols.length > 0) {
    // Header for Reference sheet
    const refHeaderRow = refSheet.getRow(1);
    validCols.forEach((c, i) => {
      const cell = refHeaderRow.getCell(i + 1);
      cell.value = c.label || c.key;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    validCols.forEach((col, vIdx) => {
      const uniqueValues = Array.from(new Set(col.allowedValues?.map(v => v.trim()).filter(Boolean) || []));
      uniqueValues.forEach((val, rIdx) => {
        refSheet.getRow(rIdx + 2).getCell(vIdx + 1).value = val;
      });

      // Apply Data Validation to the main sheet
      const colLetter = ws.getColumn(col.key).letter;
      const refColLetter = refSheet.getColumn(vIdx + 1).letter;
      const range = `${colLetter}${dataStartRow}:${colLetter}1000`;
      
      ws.dataValidations.model[range] = {
        type: "list",
        allowBlank: true,
        formulae: [`Reference!$${refColLetter}$2:$${refColLetter}$${uniqueValues.length + 1}`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Selection",
        error: "Please pick a valid value from the list.",
        showInputMessage: true,
        promptTitle: "Allowed Values",
        prompt: "Pick a value from the dropdown list."
      };
    });
  }

  // Handle Date validations
  cols.forEach((col) => {
    if (col.type === "date") {
      const colLetter = ws.getColumn(col.key).letter;
      const range = `${colLetter}${dataStartRow}:${colLetter}1000`;
      ws.dataValidations.model[range] = {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(2000, 0, 1), new Date(2099, 11, 31)],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Date",
        error: "Please enter a valid date (YYYY-MM-DD) between 2000 and 2100.",
        showInputMessage: true,
        promptTitle: "Date Format",
        prompt: "YYYY-MM-DD (e.g., 2024-06-15)"
      };
    }
  });

  // ── FINAL DOWNLOAD ──────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  
  let finalName = config.fileName;
  finalName = finalName.replace(/\.(xml|xls)$/i, ".xlsx");
  if (!finalName.toLowerCase().endsWith(".xlsx")) finalName += ".xlsx";
  
  anchor.download = finalName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

/** Find the header row in a 2D array by scanning for a known column name.
 *  Returns [headerRow, ...dataRows] — skips non-data prefix rows.
 */
export function findHeaderRowFromRows(rows: string[][], requiredHeader: string): string[][] {
  if (rows.length === 0) return [];

  const headerIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => normalizeHeaderName(cell.replace(/\s+\*$/, "")) === requiredHeader))
    .map(({ index }) => index);
  const headerIndex = headerIndexes[0] ?? -1;
  if (headerIndex < 0) return rows;

  const headerRow = rows[headerIndex].map((cell) => cell.replace(/\s+\*$/, ""));
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim().length > 0));
  return [headerRow, ...dataRows];
}

export function parseExcelXmlRows(content: string, requiredHeader: string) {
  if (!content.trim().startsWith("<?xml") && !content.includes("<Workbook")) return null;
  const documentXml = new DOMParser().parseFromString(content, "application/xml");
  const rows = Array.from(documentXml.getElementsByTagNameNS("*", "Row")).map((row) =>
    Array.from(row.getElementsByTagNameNS("*", "Cell")).map((cell) => {
      const dataEl = cell.getElementsByTagNameNS("*", "Data")[0];
      return dataEl ? dataEl.textContent?.trim() || "" : cell.textContent?.trim() || "";
    }),
  );
  const headerIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => normalizeHeaderName(cell.replace(/\s+\*$/, "")) === requiredHeader))
    .map(({ index }) => index);
  const headerIndex = headerIndexes[0] ?? -1;
  if (headerIndex < 0) return [];
  const headerRow = rows[headerIndex].map((cell) => cell.replace(/\s+\*$/, ""));
  return [headerRow, ...rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim().length > 0))];
}
