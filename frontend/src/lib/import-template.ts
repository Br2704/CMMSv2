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
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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
  return firstCell.length === 0 || firstCell.startsWith("#") || firstCell.startsWith("__");
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

function escapeXml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelCell(value: string, styleId = "body", type: "String" | "Number" = "String") {
  const safeType = type === "Number" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? "Number" : "String";
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${safeType}">${escapeXml(value)}</Data></Cell>`;
}

function excelRow(cells: string[], height?: number) {
  return `<Row${height ? ` ss:Height="${height}"` : ""}>${cells.join("")}</Row>`;
}

function excelValidationXml(columnIndex: number, values: string[], startRow: number, endRow: number) {
  const options = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 80);
  if (options.length === 0) return "";
  return `<DataValidation xmlns="urn:schemas-microsoft-com:office:excel">
   <Range>R${startRow}C${columnIndex}:R${endRow}C${columnIndex}</Range>
   <Type>List</Type>
   <Value>"${escapeXml(options.join(","))}"</Value>
   <InputTitle>Allowed values</InputTitle>
   <InputMessage>Select a value from the configured master-data list.</InputMessage>
   <ErrorTitle>Invalid value</ErrorTitle>
   <ErrorMessage>Use one of the allowed values from the dropdown/reference sheet.</ErrorMessage>
  </DataValidation>`;
}

function excelDateValidationXml(columnIndex: number, startRow: number, endRow: number) {
  return `<DataValidation xmlns="urn:schemas-microsoft-com:office:excel">
   <Range>R${startRow}C${columnIndex}:R${endRow}C${columnIndex}</Range>
   <Type>Date</Type>
   <Min>2000-01-01</Min>
   <Max>2099-12-31</Max>
   <InputTitle>Date format</InputTitle>
   <InputMessage>Use YYYY-MM-DD format.</InputMessage>
   <ErrorTitle>Invalid date</ErrorTitle>
   <ErrorMessage>Enter a valid date between 2000-01-01 and 2099-12-31.</ErrorMessage>
  </DataValidation>`;
}

function downloadExcelXml(fileName: string, xml: string) {
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadEnterpriseExcelTemplate(config: ExcelTemplateConfig) {
  const headers = config.columns.map((column) => `${column.key}${column.required ? " *" : ""}`);
  const headerKeys = config.columns.map((column) => column.key);
  const notes = config.columns.map((column) => [column.label, column.description, column.format].filter(Boolean).join(" - "));
  const uploadStartRow = 7;
  const validationStartRow = uploadStartRow;
  const validationEndRow = 500;
  const columnXml = config.columns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width || 130}"/>`)
    .join("");
  const validations = config.columns
    .map((column, index) => {
      if (column.allowedValues?.length) return excelValidationXml(index + 1, column.allowedValues, validationStartRow, validationEndRow);
      if (column.type === "date") return excelDateValidationXml(index + 1, validationStartRow, validationEndRow);
      return "";
    })
    .join("");

  const instructionText = (config.instructions || [
    "Fill data in the Machine Upload sheet only.",
    "Required columns are marked with * and highlighted.",
    "Use dropdown values where available. Do not rename database column headers.",
    "Dates must be in YYYY-MM-DD format.",
  ]).join(" ");

  const uploadRows = [
    excelRow([`<Cell ss:MergeAcross="${Math.max(0, config.columns.length - 1)}" ss:StyleID="title"><Data ss:Type="String">${escapeXml(config.title)}</Data></Cell>`], 28),
    excelRow([`<Cell ss:MergeAcross="${Math.max(0, config.columns.length - 1)}" ss:StyleID="subtitle"><Data ss:Type="String">${escapeXml(instructionText)}</Data></Cell>`], 42),
    excelRow(config.columns.map((column) => excelCell(column.required ? "Required" : "Optional", column.required ? "requiredFlag" : "optionalFlag")), 22),
    excelRow(notes.map((note) => excelCell(note, "note")), 44),
    excelRow(headerKeys.map((header) => excelCell(header, "technicalHeader")), 20),
    excelRow(headers.map((header, index) => excelCell(header, config.columns[index].required ? "requiredHeader" : "header")), 24),
    ...config.rows.map((row, rowIndex) =>
      excelRow(
        config.columns.map((column, columnIndex) =>
          excelCell(row[columnIndex] || "", rowIndex % 2 === 0 ? "body" : "bodyAlt", column.type === "number" ? "Number" : "String"),
        ),
      ),
    ),
  ].join("\n");

  const referenceRows = [
    excelRow([excelCell("Reference Group", "header"), excelCell("Allowed Value", "header")]),
    ...(config.referenceSections || []).flatMap((section) => {
      const values = section.values.length > 0 ? section.values : ["No values available"];
      return values.map((value) => excelRow([excelCell(section.title, "body"), excelCell(value, "body")]));
    }),
  ].join("\n");

  const fieldRows = [
    excelRow(["Field", "Required", "Type", "Allowed Values", "Description"].map((value) => excelCell(value, "header"))),
    ...config.columns.map((column) =>
      excelRow([
        excelCell(column.key, "body"),
        excelCell(column.required ? "Yes" : "No", column.required ? "requiredFlag" : "optionalFlag"),
        excelCell(column.type || "text", "body"),
        excelCell(optionText(column.allowedValues) || "Free text", "body"),
        excelCell([column.label, column.description, column.format].filter(Boolean).join(" - "), "body"),
      ]),
    ),
  ].join("\n");

  const instructionRows = [
    excelRow([excelCell("Step", "header"), excelCell("Guidance", "header")]),
    excelRow([excelCell("1", "body"), excelCell("Download a blank template for production imports or a demo file for examples.", "body")]),
    excelRow([excelCell("2", "body"), excelCell("Fill the Machine Upload sheet. Keep the technical header row unchanged.", "body")]),
    excelRow([excelCell("3", "body"), excelCell("Use dropdown/reference values for plant, department, module, type, asset type, criticality, status, vendor, and cost center.", "body")]),
    excelRow([excelCell("4", "body"), excelCell("Upload the saved .xls or CSV file from Machine Master. Errors show exact row numbers.", "body")]),
  ].join("\n");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXml(config.title)}</Title>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="title"><Font ss:FontName="Calibri" ss:Bold="1" ss:Size="16" ss:Color="#0F172A"/><Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/></Style>
  <Style ss:ID="subtitle"><Alignment ss:WrapText="1" ss:Vertical="Top"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#334155"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="header"><Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="requiredHeader"><Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#B91C1C" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="technicalHeader"><Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#1E293B"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="requiredFlag"><Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#7F1D1D"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="optionalFlag"><Font ss:FontName="Calibri" ss:Color="#334155"/><Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/></Style>
  <Style ss:ID="note"><Alignment ss:WrapText="1" ss:Vertical="Top"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#475569"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="body"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/></Borders></Style>
  <Style ss:ID="bodyAlt"><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(config.uploadSheetName)}">
  <Table>${columnXml}${uploadRows}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>6</SplitHorizontal><TopRowBottomPane>6</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
  ${validations}
 </Worksheet>
 <Worksheet ss:Name="Instructions"><Table><Column ss:Width="90"/><Column ss:Width="620"/>${instructionRows}</Table></Worksheet>
 <Worksheet ss:Name="Field Guide"><Table><Column ss:Width="140"/><Column ss:Width="80"/><Column ss:Width="80"/><Column ss:Width="280"/><Column ss:Width="420"/>${fieldRows}</Table></Worksheet>
 <Worksheet ss:Name="Master Data"><Table><Column ss:Width="180"/><Column ss:Width="360"/>${referenceRows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Visible>SheetHidden</Visible></WorksheetOptions></Worksheet>
</Workbook>`;

  downloadExcelXml(config.fileName, xml);
}

export function parseExcelXmlRows(content: string, requiredHeader: string) {
  if (!content.trim().startsWith("<?xml") && !content.includes("<Workbook")) return null;
  const documentXml = new DOMParser().parseFromString(content, "application/xml");
  const rows = Array.from(documentXml.getElementsByTagName("Row")).map((row) =>
    Array.from(row.getElementsByTagName("Cell")).map((cell) => cell.textContent?.trim() || ""),
  );
  const headerIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => normalizeHeaderName(cell.replace(/\s+\*$/, "")) === requiredHeader))
    .map(({ index }) => index);
  const headerIndex = headerIndexes[headerIndexes.length - 1] ?? -1;
  if (headerIndex < 0) return [];
  const headerRow = rows[headerIndex].map((cell) => cell.replace(/\s+\*$/, ""));
  return [headerRow, ...rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim().length > 0))];
}
