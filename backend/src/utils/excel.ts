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
  showOrganizationLogo?: boolean;
  headerSubtitle?: string;
  generatedAt?: string;
  footerBranding?: string;
  primaryColor?: string | null;
  headerBgColor?: string | null;
  headerFontSize?: number | null;
  footerFontSize?: number | null;
  headerBold?: boolean;
  headerUnderline?: boolean;
  headerAlignment?: string | null;
  logoAlignment?: string | null;
  headerColor?: string | null;
  footerColor?: string | null;
  footerBold?: boolean;
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
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${numeric}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
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
    return `<Column ss:AutoFitWidth="0" ss:Width="${approximateWidth.toFixed(0)}"/>`;
  });

  return widths.join("");
}

function buildStylesXml(branding: WorkbookBranding) {
  const headerColorVal = branding.headerColor?.trim() || branding.primaryColor?.trim() || "#000000";
  const headerBg = branding.headerBgColor?.trim() || "#000000";
  const headerFontSz = branding.headerFontSize ?? 10;
  const footerFontSz = branding.footerFontSize ?? 8;
  const primaryColor = branding.primaryColor?.trim() || "#111827";
  const footerColorVal = branding.footerColor?.trim() || "#6B7280";
  const hBold = branding.headerBold !== false ? "1" : "0";
  const hUnderline = branding.headerUnderline ? ' ss:Underline="Single"' : '';
  const hAlign = branding.headerAlignment?.trim() || 'left';
  const hAlignExcel = hAlign === 'center' ? 'Center' : hAlign === 'right' ? 'Right' : 'Left';
  const lAlign = branding.logoAlignment?.trim() || 'left';
  const logoAlignExcel = lAlign === 'center' ? 'Center' : lAlign === 'right' ? 'Right' : 'Left';
  const fBold = branding.footerBold !== false ? "1" : "0";

  return `<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Segoe UI" ss:Size="10"/>
  </Style>
  <Style ss:ID="sTitle">
   <Font ss:FontName="Segoe UI" ss:Bold="${hBold}" ss:Size="18" ss:Color="${escapeXml(headerColorVal)}"${hUnderline}/>
   <Alignment ss:Horizontal="${hAlignExcel}" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${escapeXml(headerColorVal)}"/>
   </Borders>
  </Style>
  <Style ss:ID="sOrgLogo">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="14" ss:Color="${escapeXml(headerColorVal)}"/>
   <Alignment ss:Horizontal="${logoAlignExcel}" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sMeta">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#4B5563"/>
   <Alignment ss:Horizontal="${hAlignExcel}" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sHeader">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="${escapeXml(String(headerFontSz))}" ss:Color="#FFFFFF"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Interior ss:Color="${escapeXml(headerBg)}" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${escapeXml(headerBg)}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${escapeXml(headerBg)}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${escapeXml(headerBg)}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${escapeXml(headerBg)}"/>
   </Borders>
  </Style>
  <Style ss:ID="sBody">
   <Font ss:FontName="Segoe UI"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
   </Borders>
  </Style>
  <Style ss:ID="sFooter">
   <Font ss:FontName="Segoe UI" ss:Bold="${fBold}" ss:Size="${escapeXml(String(footerFontSz))}" ss:Color="${escapeXml(footerColorVal)}"/>
   <Alignment ss:Horizontal="${hAlignExcel}" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sTamOptix">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="9" ss:Color="${escapeXml(primaryColor)}"/>
   <Alignment ss:Horizontal="${hAlignExcel}" ss:Vertical="Center"/>
  </Style>
 </Styles>`;
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
    // Organization name row — alignment controlled by logoAlignment
    if (branding.showOrganizationLogo !== false) {
      headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sOrgLogo"><Data ss:Type="String">${escapeXml(organizationName.toUpperCase())}</Data></Cell>`]));
    }
    headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sTitle"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>`]));
    // Subtitle row below the title (optional)
    if (branding.headerSubtitle?.trim()) {
      headerRows.push(
        rowXml([
          `<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sMeta"><Data ss:Type="String">${escapeXml(branding.headerSubtitle.trim())}</Data></Cell>`,
        ]),
      );
    }
    headerRows.push(
      rowXml([
        `<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sMeta"><Data ss:Type="String">${escapeXml(`Generated: ${generatedAt}`)}</Data></Cell>`,
      ]),
    );
    // Spacing
    headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sBody"><Data ss:Type="String"></Data></Cell>`]));
  }

  const headerRow = rowXml(safeHeaders.map((header) => cellXml(header, "sHeader")));
  const bodyRows = safeRows.map((row) => rowXml(Array.from({ length: columnCount }, (_, index) => cellXml(row[index] ?? "", "sBody"))));
  const footerRows = [
    rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sBody"><Data ss:Type="String"></Data></Cell>`]),
    rowXml([
      `<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sTamOptix"><Data ss:Type="String">TamOptiX Technologies | Intelligent CMMS Platform</Data></Cell>`,
    ]),
    rowXml([
      `<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sFooter"><Data ss:Type="String">${escapeXml(footerBranding)}</Data></Cell>`,
    ]),
  ];

  return `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${buildColumnXml(columnCount, safeHeaders, safeRows)}${[
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

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXml(title)}</Title>
 </DocumentProperties>
 ${buildStylesXml(branding)}
 ${worksheetXml}
</Workbook>`;

  return Buffer.from(xml, "utf8");
}
