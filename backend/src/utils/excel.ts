function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type Sheet = {
  name: string;
  headers: string[];
  rows: Array<Array<unknown>>;
};

type WorkbookBranding = {
  organizationName?: string;
  organizationLogoUrl?: string | null;
  generatedAt?: string;
  footerBranding?: string;
};

function toNumberIfNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function cellXml(value: unknown, styleId: string) {
  const numeric = toNumberIfNumeric(value);
  if (numeric !== null) {
    return `<Cell ss:StyleID=\"${styleId}\"><Data ss:Type=\"Number\">${numeric}</Data></Cell>`;
  }
  return `<Cell ss:StyleID=\"${styleId}\"><Data ss:Type=\"String\">${escapeXml(value)}</Data></Cell>`;
}

function rowXml(cells: string[]) {
  return `<Row>${cells.join("")}</Row>`;
}

function buildColumnXml(columnCount: number, headers: string[], rows: Array<Array<unknown>>) {
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const headerLength = headers[index] ? String(headers[index]).length : 0;
    const bodyLength = rows.reduce((max, row) => {
      const current = row[index] === undefined || row[index] === null ? 0 : String(row[index]).length;
      return Math.max(max, current);
    }, 0);
    const maxLength = Math.max(headerLength, bodyLength, 10);
    const approximateWidth = Math.min(360, Math.max(90, maxLength * 7.5));
    return `<Column ss:AutoFitWidth=\"0\" ss:Width=\"${approximateWidth.toFixed(0)}\"/>`;
  });

  return widths.join("");
}

function worksheetXmlForSheet(title: string, sheet: Sheet, branding: WorkbookBranding, isFirstSheet: boolean) {
  const safeHeaders = sheet.headers.length > 0 ? sheet.headers : ["Info"];
  const safeRows = sheet.rows.length > 0 ? sheet.rows : [["No data"]];
  const columnCount = Math.max(safeHeaders.length, ...safeRows.map((row) => row.length), 1);
  const mergeAcross = Math.max(0, columnCount - 1);
  const generatedAt = branding.generatedAt ?? new Date().toISOString();
  const organizationName = branding.organizationName?.trim() || "CMMS Organization";
  const footerBranding = branding.footerBranding?.trim() || "Powered by TamOptix Technologies";

  const headerRows: string[] = [];
  if (isFirstSheet) {
    headerRows.push(rowXml([`<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sTitle\"><Data ss:Type=\"String\">${escapeXml(title)}</Data></Cell>`]));
    headerRows.push(
      rowXml([
        `<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sMeta\"><Data ss:Type=\"String\">${escapeXml(`Organization: ${organizationName}`)}</Data></Cell>`,
      ]),
    );
    if (branding.organizationLogoUrl) {
      headerRows.push(
        rowXml([
          `<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sMeta\"><Data ss:Type=\"String\">${escapeXml(`Organization Logo: ${branding.organizationLogoUrl}`)}</Data></Cell>`,
        ]),
      );
    }
    headerRows.push(
      rowXml([
        `<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sMeta\"><Data ss:Type=\"String\">${escapeXml(`Generated At: ${generatedAt}`)}</Data></Cell>`,
      ]),
    );
    headerRows.push(rowXml([`<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sBody\"><Data ss:Type=\"String\"></Data></Cell>`]));
  }

  const headerRow = rowXml(safeHeaders.map((header) => cellXml(header, "sHeader")));
  const bodyRows = safeRows.map((row) => rowXml(Array.from({ length: columnCount }, (_, index) => cellXml(row[index] ?? "", "sBody"))));
  const footerRows = [
    rowXml([`<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sBody\"><Data ss:Type=\"String\"></Data></Cell>`]),
    rowXml([
      `<Cell ss:MergeAcross=\"${mergeAcross}\" ss:StyleID=\"sFooter\"><Data ss:Type=\"String\">${escapeXml(footerBranding)}</Data></Cell>`,
    ]),
  ];

  return `<Worksheet ss:Name=\"${escapeXml(sheet.name)}\"><Table>${buildColumnXml(columnCount, safeHeaders, safeRows)}${[
    ...headerRows,
    headerRow,
    ...bodyRows,
    ...footerRows,
  ].join("\n")}</Table></Worksheet>`;
}

export function createSimpleExcelWorkbook(title: string, sheets: Sheet[], branding: WorkbookBranding = {}): Buffer {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: "Summary", headers: ["Info"], rows: [["No data"]] }];

  const worksheetXml = safeSheets
    .map((sheet, index) => worksheetXmlForSheet(title, sheet, branding, index === 0))
    .join("\n");

  const xml = `<?xml version=\"1.0\"?>
<?mso-application progid=\"Excel.Sheet\"?>
<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\"
 xmlns:o=\"urn:schemas-microsoft-com:office:office\"
 xmlns:x=\"urn:schemas-microsoft-com:office:excel\"
 xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\"
 xmlns:html=\"http://www.w3.org/TR/REC-html40\">
 <DocumentProperties xmlns=\"urn:schemas-microsoft-com:office:office\">
  <Title>${escapeXml(title)}</Title>
 </DocumentProperties>
 <Styles>
  <Style ss:ID=\"Default\" ss:Name=\"Normal\">
   <Alignment ss:Vertical=\"Center\"/>
   <Font ss:FontName=\"Calibri\" ss:Size=\"11\"/>
  </Style>
  <Style ss:ID=\"sTitle\">
   <Font ss:FontName=\"Calibri\" ss:Bold=\"1\" ss:Size=\"16\" ss:Color=\"#0F172A\"/>
   <Alignment ss:Horizontal=\"Left\" ss:Vertical=\"Center\"/>
  </Style>
  <Style ss:ID=\"sMeta\">
   <Font ss:FontName=\"Calibri\" ss:Italic=\"1\" ss:Size=\"10\" ss:Color=\"#334155\"/>
   <Alignment ss:Horizontal=\"Left\" ss:Vertical=\"Center\"/>
  </Style>
  <Style ss:ID=\"sHeader\">
   <Font ss:FontName=\"Calibri\" ss:Bold=\"1\" ss:Size=\"11\" ss:Color=\"#FFFFFF\"/>
   <Alignment ss:Horizontal=\"Center\" ss:Vertical=\"Center\" ss:WrapText=\"1\"/>
   <Interior ss:Color=\"#1E3A5F\" ss:Pattern=\"Solid\"/>
   <Borders>
    <Border ss:Position=\"Bottom\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#D1D5DB\"/>
    <Border ss:Position=\"Left\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#D1D5DB\"/>
    <Border ss:Position=\"Right\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#D1D5DB\"/>
    <Border ss:Position=\"Top\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#D1D5DB\"/>
   </Borders>
  </Style>
  <Style ss:ID=\"sBody\">
   <Alignment ss:Horizontal=\"Left\" ss:Vertical=\"Center\" ss:WrapText=\"1\"/>
   <Borders>
    <Border ss:Position=\"Bottom\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#E5E7EB\"/>
    <Border ss:Position=\"Left\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#E5E7EB\"/>
    <Border ss:Position=\"Right\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#E5E7EB\"/>
    <Border ss:Position=\"Top\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#E5E7EB\"/>
   </Borders>
  </Style>
  <Style ss:ID=\"sFooter\">
   <Font ss:FontName=\"Calibri\" ss:Italic=\"1\" ss:Size=\"9\" ss:Color=\"#475569\"/>
   <Alignment ss:Horizontal=\"Left\" ss:Vertical=\"Center\"/>
  </Style>
 </Styles>
 ${worksheetXml}
</Workbook>`;

  return Buffer.from(xml, "utf8");
}
