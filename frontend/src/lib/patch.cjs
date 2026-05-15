const fs = require('fs');

const path = 'd:/CMMSv2/frontend/src/lib/import-template.ts';
let code = fs.readFileSync(path, 'utf8');

const newStyles = `const STYLES = {
  keyRow: {
    fill: { patternType: "solid", fgColor: { rgb: "1E293B" } },
    font: { color: { rgb: "CBD5E1" }, sz: 8, name: "Segoe UI", italic: true },
    alignment: { horizontal: "center", vertical: "center" },
  },
  required: {
    fill: { patternType: "solid", fgColor: { rgb: "DC2626" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Segoe UI" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: { bottom: { style: "thick", color: { rgb: "991B1B" } }, right: { style: "thin", color: { rgb: "FCA5A5" } } },
  },
  optional: {
    fill: { patternType: "solid", fgColor: { rgb: "0284C7" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Segoe UI" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: { bottom: { style: "thick", color: { rgb: "0369A1" } }, right: { style: "thin", color: { rgb: "7DD3FC" } } },
  },
  reqBadge: {
    fill: { patternType: "solid", fgColor: { rgb: "FEF2F2" } },
    font: { bold: true, color: { rgb: "EF4444" }, sz: 9, name: "Segoe UI" },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "FCA5A5" } } },
  },
  optBadge: {
    fill: { patternType: "solid", fgColor: { rgb: "F0F9FF" } },
    font: { color: { rgb: "0EA5E9" }, sz: 9, name: "Segoe UI" },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "7DD3FC" } } },
  },
  desc: {
    fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
    font: { italic: true, color: { rgb: "64748B" }, sz: 9, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  example: {
    fill: { patternType: "solid", fgColor: { rgb: "FEF3C7" } },
    font: { color: { rgb: "B45309" }, sz: 10, name: "Segoe UI", italic: true },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: "F59E0B" } }, right: { style: "thin", color: { rgb: "FDE68A" } } },
  },
  dataCell: {
    fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
    font: { color: { rgb: "334155" }, sz: 11, name: "Segoe UI" },
    alignment: { vertical: "center", horizontal: "left" },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  instrBanner: {
    fill: { patternType: "solid", fgColor: { rgb: "1E293B" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
  },
  instrTitle: {
    font: { bold: true, color: { rgb: "334155" }, sz: 12, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
  },
  instrHead: {
    fill: { patternType: "solid", fgColor: { rgb: "475569" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
  },
  instrRow: {
    fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
    font: { color: { rgb: "334155" }, sz: 10, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  instrAlt: {
    fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
    font: { color: { rgb: "334155" }, sz: 10, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  instrFooter: {
    font: { italic: true, color: { rgb: "94A3B8" }, sz: 9, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
  },
  refHead: {
    fill: { patternType: "solid", fgColor: { rgb: "0284C7" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Segoe UI" },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: "0369A1" } } },
  },
  refSection: {
    fill: { patternType: "solid", fgColor: { rgb: "F0F9FF" } },
    font: { bold: true, color: { rgb: "0284C7" }, sz: 9, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "BAE6FD" } } },
  },
  refValue: {
    fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
    font: { color: { rgb: "334155" }, sz: 10, name: "Segoe UI" },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } }, left: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
};`;

const stylesStart = code.indexOf('const STYLES = {');
const stylesEnd = code.indexOf('};', stylesStart) + 2;

code = code.slice(0, stylesStart) + newStyles + code.slice(stylesEnd);


const refLogicStart = code.indexOf('  // ── REFERENCE SHEET ─────────────────────────────────────────────────────────');
const refLogicEnd = code.indexOf('  // ── WRITE & DOWNLOAD ────────────────────────────────────────────────────────');

const newRefLogic = `  // ── REFERENCE SHEET ─────────────────────────────────────────────────────────
  const refColMap = new Map<string, string>();
  const validCols = cols.filter((c) => c.allowedValues && c.allowedValues.length > 0);

  if (validCols.length > 0) {
    const refAoA: string[][] = [];
    refAoA.push(validCols.map((c) => c.label || c.key));

    const maxRows = Math.max(...validCols.map((c) => {
      const uniqueVals = Array.from(new Set(c.allowedValues?.map(v => v.trim()).filter(Boolean) || []));
      return uniqueVals.length;
    }));

    // Generate unique cleaned values for each column
    const cleanedValuesMap = validCols.map(c => Array.from(new Set(c.allowedValues?.map(v => v.trim()).filter(Boolean) || [])));

    for (let r = 0; r < maxRows; r++) {
      refAoA.push(cleanedValuesMap.map((vals) => vals[r] || ""));
    }

    const refWs: Record<string, any> = utils.aoa_to_sheet(refAoA);
    refWs["!cols"] = validCols.map(() => ({ wch: 35 }));

    for (let c = 0; c < validCols.length; c++) {
      applyStyle(refWs, utils.encode_cell({ r: 0, c }), STYLES.refHead);
      
      const colLetter = utils.encode_col(c);
      const count = cleanedValuesMap[c].length;
      if (count > 0) {
        refColMap.set(validCols[c].key, \`Reference!$\${colLetter}$2:$\${colLetter}$\${count + 1}\`);
      }
      
      for (let r = 1; r <= maxRows; r++) {
        if (refAoA[r][c]) {
          applyStyle(refWs, utils.encode_cell({ r, c }), STYLES.refValue);
        }
      }
    }

    utils.book_append_sheet(wb, refWs, "Reference");
  } else if (config.referenceSections && config.referenceSections.length > 0) {
    // Fallback if no allowedValues were provided inline
    const refRows: string[][] = [["Field / Section", "Reference Values"]];
    config.referenceSections.forEach((section) => {
      if (!section.values || section.values.length === 0) return;
      refRows.push([section.title, ""]);
      section.values.forEach((v) => refRows.push(["", v.trim()]));
      refRows.push(["", ""]);
    });

    const refWs: Record<string, any> = utils.aoa_to_sheet(refRows);
    refWs["!cols"] = [{ wch: 35 }, { wch: 55 }];

    applyStyle(refWs, "A1", STYLES.refHead);
    applyStyle(refWs, "B1", STYLES.refHead);

    let ri = 2;
    config.referenceSections.forEach((section) => {
      if (!section.values || section.values.length === 0) return;
      applyStyle(refWs, \`A\${ri}\`, STYLES.refSection);
      if (refWs[\`B\${ri}\`]) refWs[\`B\${ri}\`].s = STYLES.refSection;
      ri++;
      section.values.forEach(() => {
        if (refWs[\`B\${ri}\`]) refWs[\`B\${ri}\`].s = STYLES.refValue;
        ri++;
      });
      ri++; // blank separator
    });

    utils.book_append_sheet(wb, refWs, "Reference");
  }

`;

code = code.slice(0, refLogicStart) + newRefLogic + code.slice(refLogicEnd);

// Replace Data Validations
const dvStart = code.indexOf('  // Data validations — dropdown lists and date constraints');
const dvEnd = code.indexOf('  utils.book_append_sheet(wb, ws, config.uploadSheetName);');

const newDvLogic = `  // Data validations — dropdown lists and date constraints
  const dvList: object[] = [];
  cols.forEach((col, c) => {
    const colRef = utils.encode_col(c);
    if (col.allowedValues && col.allowedValues.length > 0) {
      const formula = refColMap.has(col.key) 
        ? refColMap.get(col.key) 
        : \`"\${Array.from(new Set(col.allowedValues.map((v) => v.trim()).filter(Boolean))).slice(0, 10).join(",")}"\`;
      
      dvList.push({
        type: "list",
        sqref: \`\${colRef}6:\${colRef}1000\`,
        formula1: formula,
        showDropDown: false,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid value",
        error: "Select a valid option from the dropdown menu.",
        showInputMessage: true,
        promptTitle: col.label || col.key,
        prompt: "Select value from dropdown list",
      });
    } else if (col.type === "date") {
      dvList.push({
        type: "date",
        sqref: \`\${colRef}6:\${colRef}1000\`,
        operator: "between",
        formula1: "2000-01-01",
        formula2: "2099-12-31",
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid date",
        error: "Enter a date between 2000-01-01 and 2099-12-31.",
        showInputMessage: true,
        promptTitle: "Date Format",
        prompt: "YYYY-MM-DD (e.g. 2024-01-15)",
      });
    }
  });
  if (dvList.length > 0) (ws as any)["!dataValidations"] = dvList;

`;

code = code.slice(0, dvStart) + newDvLogic + code.slice(dvEnd);

fs.writeFileSync(path, code);
console.log('patched');
