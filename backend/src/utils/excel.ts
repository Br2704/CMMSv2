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

export function createSimpleExcelWorkbook(title: string, sheets: Sheet[]): Buffer {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: "Summary", headers: ["Info"], rows: [["No data"]] }];

  const worksheetXml = safeSheets
    .map((sheet) => {
      const headerRow = `<Row>${sheet.headers
        .map((header) => `<Cell><Data ss:Type=\"String\">${escapeXml(header)}</Data></Cell>`)
        .join("")}</Row>`;
      const bodyRows = sheet.rows
        .map(
          (row) =>
            `<Row>${row
              .map((cell) => `<Cell><Data ss:Type=\"String\">${escapeXml(cell)}</Data></Cell>`)
              .join("")}</Row>`,
        )
        .join("\n");

      return `<Worksheet ss:Name=\"${escapeXml(sheet.name)}\"><Table>${headerRow}${bodyRows}</Table></Worksheet>`;
    })
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
 ${worksheetXml}
</Workbook>`;

  return Buffer.from(xml, "utf8");
}
