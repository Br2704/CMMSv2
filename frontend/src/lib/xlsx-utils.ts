import ExcelJS from "exceljs";

export async function parseFileContent(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let sheetName = workbook.worksheets[0]?.name;
  if (!sheetName) throw new Error("Spreadsheet has no sheets");

  const dataSheet = workbook.worksheets.find(
    (ws) =>
      ws.name.toLowerCase().includes("upload") ||
      ws.name.toLowerCase().includes("data") ||
      ws.name.toLowerCase().includes("entry"),
  );
  if (dataSheet) {
    sheetName = dataSheet.name;
  } else if (sheetName.toLowerCase().includes("instruction") && workbook.worksheets.length > 1) {
    sheetName = workbook.worksheets[1].name;
  }

  const ws = workbook.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(String(cell.value ?? ""));
    });
    rows.push(values);
  });
  return rows;
}
