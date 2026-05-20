import { AppDataSource } from '../database/data-source';
import { AssetEntity } from '../database/entities/asset.entity';
import { WorkOrderEntity } from '../database/entities/work-order.entity';
import { OrganizationEntity } from '../database/entities/organization.entity';
import { PlantEntity } from '../database/entities/plant.entity';
import { UserEntity } from '../database/entities/user.entity';
import { DepartmentEntity } from '../database/entities/department.entity';
import { MaintenanceTeamEntity } from '../database/entities/maintenance-team.entity';

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toNumberIfNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function cellXml(value: unknown, styleId: string, formula?: string) {
  const numeric = toNumberIfNumeric(value);
  if (formula) {
    const displayVal = numeric !== null ? String(numeric) : escapeXml(value);
    return `<Cell ss:StyleID="${styleId}" ss:Formula="${escapeXml(formula)}"><Data ss:Type="${numeric !== null ? 'Number' : 'String'}">${displayVal}</Data></Cell>`;
  }
  if (numeric !== null) {
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${numeric}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function rowXml(cells: string[]) {
  return `<Row>${cells.join('')}</Row>`;
}

function buildColumnXml(headers: string[], rows: Array<Array<unknown>>, extraMinWidths?: number[]) {
  const columnCount = headers.length;
  return Array.from({ length: columnCount }, (_, index) => {
    const headerLength = headers[index] ? String(headers[index]).length : 0;
    const bodyLength = rows.reduce((max, row) => {
      const current = row[index] === undefined || row[index] === null ? 0 : String(row[index]).length;
      return Math.max(max, current);
    }, 0);
    const minWidth = extraMinWidths?.[index] ?? 12;
    const maxLength = Math.max(headerLength, bodyLength, minWidth);
    const approximateWidth = Math.min(480, Math.max(70, maxLength * 7.0));
    return `<Column ss:AutoFitWidth="0" ss:Width="${approximateWidth.toFixed(0)}"/>`;
  }).join('');
}

function autoFilterXml(firstCol: number, lastCol: number, lastRow: number): string {
  return `<AutoFilter xmlns="urn:schemas-microsoft-com:office:excel" x:Range="R1C${firstCol}:R${lastRow}C${lastCol}"/>`;
}

function dateStyleId(styleName: string): string {
  return `<NumberFormat ss:Format="DD/MM/YYYY HH:MM"/>`;
}

interface SheetConfig {
  name: string;
  headers: string[];
  rows: Array<Array<unknown>>;
  summaryRows?: Array<Array<{ value: unknown; style: string; formula?: string }>>;
}

interface AssetLogbookInput {
  asset: AssetEntity;
  department: DepartmentEntity | null;
  plant: PlantEntity | null;
  organization: OrganizationEntity | null;
  workOrders: WorkOrderEntity[];
  raisedByUsers: Map<string, string>;
  assignedTeams: Map<string, string>;
  assignedUsers: Map<string, string>;
}

function calcDowntimeMinutes(wo: WorkOrderEntity): number {
  if (wo.downtimeMinutes > 0) return wo.downtimeMinutes;
  if (wo.downtimeStartAt && wo.downtimeEndAt) {
    return Math.round((wo.downtimeEndAt.getTime() - wo.downtimeStartAt.getTime()) / 60000);
  }
  if (wo.startedAt && wo.closedAt) {
    return Math.round((wo.closedAt.getTime() - wo.startedAt.getTime()) / 60000);
  }
  return 0;
}

function buildWorkOrderRows(workOrders: WorkOrderEntity[], raisedByUsers: Map<string, string>, assignedTeams: Map<string, string>, assignedUsers: Map<string, string>): Array<Array<unknown>> {
  return workOrders.map((wo) => {
    const spareItems = Array.isArray(wo.spareConsumption) ? wo.spareConsumption : [];
    const spareNames = spareItems.map((s: Record<string, unknown>) => String(s.name ?? s.partName ?? s.itemCode ?? '')).filter(Boolean).join(', ');
    const spareQty = spareItems.reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.quantity ?? s.qty ?? 0) || 0), 0);
    const attachments = Array.isArray(wo.attachments) ? wo.attachments : [];
    const photoLinks = attachments.map((a: Record<string, unknown>) => String(a.url ?? a.path ?? '')).filter(Boolean).join('; ');
    const whyWhy = wo.whyWhyAnalysis ? JSON.stringify(wo.whyWhyAnalysis) : '';
    const downtimeMin = calcDowntimeMinutes(wo);
    const machineStopped = wo.downtimeStartAt && wo.downtimeEndAt
      ? `${formatDate(wo.downtimeStartAt)} → ${formatDate(wo.downtimeEndAt)} (${downtimeMin} min)`
      : '-';
    const isClosed = wo.status === 'CLOSED' || wo.status === 'COMPLETED';
    const isApproved = wo.status === 'APPROVED' || wo.status === 'CLOSED' || wo.status === 'COMPLETED';

    return [
      wo.woNumber,
      formatDate(wo.createdAt),
      formatDate(wo.openedAt),
      formatDate(wo.closedAt),
      raisedByUsers.get(wo.raisedBy ?? '') ?? wo.raisedBy ?? '-',
      assignedTeams.get(wo.followUpTeamId ?? '') ?? '-',
      assignedUsers.get(wo.assignedTo ?? '') ?? '-',
      wo.problemDescription || '-',
      wo.initialAssessment || '-',
      wo.rootCause || '-',
      wo.actionTaken || '-',
      spareNames || '-',
      spareQty,
      downtimeMin,
      downtimeMin,
      wo.operatorFault ? 'Yes' : 'No',
      wo.followUpRequired ? 'Yes' : 'No',
      isApproved ? 'Approved' : (isClosed ? 'Closed' : wo.status),
      wo.remarks || '-',
      photoLinks || '-',
      whyWhy || '-',
      machineStopped,
      wo.laborHours || '0',
      wo.actualCost || '0',
    ];
  });
}

function buildFailureCategoryData(workOrders: WorkOrderEntity[]): Array<{ category: string; count: number; totalDowntime: number }> {
  const map = new Map<string, { count: number; totalDowntime: number }>();
  for (const wo of workOrders) {
    const cat = wo.actualFailureCategory || wo.failureCode || 'UNCATEGORIZED';
    const existing = map.get(cat) || { count: 0, totalDowntime: 0 };
    existing.count += 1;
    existing.totalDowntime += calcDowntimeMinutes(wo);
    map.set(cat, existing);
  }
  return Array.from(map.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.count - a.count);
}

function buildTeamFailureData(workOrders: WorkOrderEntity[], assignedTeams: Map<string, string>): Array<{ team: string; count: number; totalDowntime: number }> {
  const map = new Map<string, { count: number; totalDowntime: number }>();
  for (const wo of workOrders) {
    const team = assignedTeams.get(wo.followUpTeamId ?? '') ?? 'UNASSIGNED';
    const existing = map.get(team) || { count: 0, totalDowntime: 0 };
    existing.count += 1;
    existing.totalDowntime += calcDowntimeMinutes(wo);
    map.set(team, existing);
  }
  return Array.from(map.entries())
    .map(([team, data]) => ({ team, ...data }))
    .sort((a, b) => b.count - a.count);
}

function buildMonthlyDowntime(workOrders: WorkOrderEntity[]): Array<{ month: string; count: number; downtime: number; cost: number }> {
  const map = new Map<string, { count: number; downtime: number; cost: number }>();
  for (const wo of workOrders) {
    const date = wo.closedAt || wo.createdAt;
    if (!date) continue;
    const d = new Date(date);
    if (isNaN(d.getTime())) continue;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = map.get(monthKey) || { count: 0, downtime: 0, cost: 0 };
    existing.count += 1;
    existing.downtime += calcDowntimeMinutes(wo);
    existing.cost += Number(wo.actualCost || 0);
    map.set(monthKey, existing);
  }
  return Array.from(map.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildAssetSummarySheet(input: AssetLogbookInput): SheetConfig {
  const { asset, department, plant, organization } = input;
  const totalWOs = input.workOrders.length;
  const closedWOs = input.workOrders.filter((wo) => wo.status === 'CLOSED' || wo.status === 'COMPLETED');
  const totalDowntime = closedWOs.reduce((sum, wo) => sum + calcDowntimeMinutes(wo), 0);
  const totalCost = closedWOs.reduce((sum, wo) => sum + Number(wo.actualCost || 0), 0);

  return {
    name: 'Asset Summary',
    headers: ['Attribute', 'Value', 'Attribute', 'Value'],
    rows: [
      ['Organization', organization?.name || '-', 'Plant', plant?.plantName || '-'],
      ['Department', department?.name || '-', 'Location', asset.location || '-'],
      ['Asset Code', asset.code, 'Machine Name', asset.name],
      ['Serial Number', asset.serialNumber || '-', 'Model', asset.model || '-'],
      ['Criticality', asset.criticality, 'Health Score', `${asset.assetHealthScore || 0}%`],
      ['Status', asset.status, 'Asset Type', asset.assetType || '-'],
      ['Commission Date', formatDate(asset.commissionDate), 'Warranty Expiry', formatDate(asset.warrantyExpiry)],
      ['', '', '', ''],
      ['MAINTENANCE SUMMARY', '', '', ''],
      ['Total Work Orders', totalWOs, 'Closed Orders', closedWOs.length],
      ['Total Downtime (min)', totalDowntime, 'Total Cost', totalCost.toFixed(2)],
      ['Open Orders', totalWOs - closedWOs.length, 'Failure Events', closedWOs.filter((wo) => wo.isFailureEvent).length],
      ['Avg MTTR (min)', '', 'Avg MTBF (min)', ''],
    ],
  };
}

function buildWorkOrderHistorySheet(input: AssetLogbookInput): SheetConfig {
  const rows = buildWorkOrderRows(input.workOrders, input.raisedByUsers, input.assignedTeams, input.assignedUsers);

  const totalDowntime = input.workOrders.reduce((sum, wo) => sum + calcDowntimeMinutes(wo), 0);
  const totalCost = input.workOrders.reduce((sum, wo) => sum + Number(wo.actualCost || 0), 0);

  return {
    name: 'Work Order History',
    headers: [
      'WO Number', 'Raised Date', 'Opened Date', 'Closed Date',
      'Raised By', 'Assigned Team', 'Technician',
      'Issue Description', 'Initial Assessment', 'Root Cause',
      'Corrective Action', 'Spare Used', 'Spare Qty',
      'Breakdown Duration (min)', 'Downtime (min)',
      'Operator Fault', 'Follow-up Required', 'Approval Status',
      'Closure Remarks', 'Photo Link', '5-Why Analysis',
      'Machine Stopped Duration', 'Labor Hours', 'Actual Cost',
    ],
    rows: rows.length > 0 ? rows : [['No historical work orders found for this asset']],
    summaryRows: rows.length > 0 ? [
      [
        { value: 'TOTALS', style: 'sSummaryLabel' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sSummaryNumber', formula: `SUM(M2:M${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `SUM(N2:N${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `SUM(O2:O${rows.length + 1})` },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sBody' },
        { value: '', style: 'sSummaryNumber', formula: `SUM(W2:W${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `SUM(X2:X${rows.length + 1})` },
      ],
    ] : [],
  };
}

function buildDowntimeAnalysisSheet(input: AssetLogbookInput): SheetConfig {
  const monthly = buildMonthlyDowntime(input.workOrders);
  const rows = monthly.map((m) => [m.month, m.count, m.downtime, m.cost.toFixed(2)]);
  const totalDowntime = monthly.reduce((s, m) => s + m.downtime, 0);
  const totalCost = monthly.reduce((s, m) => s + m.cost, 0);
  const totalCount = monthly.reduce((s, m) => s + m.count, 0);

  // Detailed WO downtime rows
  const detailRows = input.workOrders
    .filter((wo) => wo.downtimeMinutes > 0 || (wo.downtimeStartAt && wo.downtimeEndAt))
    .map((wo) => {
      const dm = calcDowntimeMinutes(wo);
      const isOpFault = wo.operatorFault ? 'Yes' : 'No';
      return [wo.woNumber, wo.problemDescription || '-', formatDate(wo.downtimeStartAt), formatDate(wo.downtimeEndAt), dm, isOpFault, formatDate(wo.createdAt), formatDate(wo.closedAt ?? wo.updatedAt)];
    });

  return {
    name: 'Downtime Analysis',
    headers: ['Month', 'WO Count', 'Total Downtime (min)', 'Cost Impact'],
    rows: rows.length > 0 ? rows : [['No data', '', '', '']],
    summaryRows: rows.length > 0 ? [
      [
        { value: 'TOTAL', style: 'sSummaryLabel' },
        { value: '', style: 'sSummaryNumber', formula: `SUM(B2:B${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `SUM(C2:C${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `SUM(D2:D${rows.length + 1})` },
      ],
      [
        { value: 'AVERAGE', style: 'sSummaryLabel' },
        { value: '', style: 'sSummaryNumber', formula: `AVERAGE(B2:B${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `AVERAGE(C2:C${rows.length + 1})` },
        { value: '', style: 'sSummaryNumber', formula: `AVERAGE(D2:D${rows.length + 1})` },
      ],
    ] : [],
  };
}

function buildFailureCategorizationSheet(input: AssetLogbookInput): SheetConfig {
  const catData = buildFailureCategoryData(input.workOrders);
  const totalFailures = catData.reduce((s, c) => s + c.count, 0);
  const catRows = catData.map((c) => [c.category, c.count, ((c.count / Math.max(totalFailures, 1)) * 100).toFixed(1) + '%', c.totalDowntime]);

  const teamData = buildTeamFailureData(input.workOrders, input.assignedTeams);
  const teamRows = teamData.map((t) => [t.team, t.count, t.totalDowntime]);

  return {
    name: 'Failure Categorization',
    headers: ['Failure Category', 'Occurrences', '% of Total', 'Total Downtime (min)'],
    rows: catRows.length > 0 ? catRows : [['No failure data', '', '', '']],
    summaryRows: catRows.length > 0 ? [
      [
        { value: 'TOTAL FAILURES', style: 'sSummaryLabel' },
        { value: '', style: 'sSummaryNumber', formula: `SUM(B2:B${catRows.length + 1})` },
        { value: '', style: 'sBody' },
        { value: '', style: 'sSummaryNumber', formula: `SUM(D2:D${catRows.length + 1})` },
      ],
    ] : [],
  };
}

function buildMaintenanceKpiSheet(input: AssetLogbookInput): SheetConfig {
  const closedWOs = input.workOrders.filter((wo) => wo.status === 'CLOSED' || wo.status === 'COMPLETED');
  const totalDowntime = closedWOs.reduce((sum, wo) => sum + calcDowntimeMinutes(wo), 0);
  const totalWOs = input.workOrders.length;
  const totalClosed = closedWOs.length;
  const totalOpen = totalWOs - totalClosed;
  const totalCost = closedWOs.reduce((sum, wo) => sum + Number(wo.actualCost || 0), 0);
  const failures = closedWOs.filter((wo) => wo.isFailureEvent).length;
  const opFaults = closedWOs.filter((wo) => wo.operatorFault).length;
  const followUps = closedWOs.filter((wo) => wo.followUpRequired).length;

  const mttr = totalClosed > 0 ? (totalDowntime / totalClosed) : 0;
  const totalHours = closedWOs.reduce((sum, wo) => sum + Number(wo.laborHours || 0), 0);
  const mtbf = totalClosed > 0 && failures > 0 ? (totalHours / failures) : 0;

  const statusBreakdown = ['RAISED', 'OPENED', 'IN_PROGRESS', 'CLOSED', 'COMPLETED'].map((status) => {
    const count = input.workOrders.filter((wo) => wo.status === status).length;
    return [status, count, ((count / Math.max(totalWOs, 1)) * 100).toFixed(1) + '%'];
  });

  return {
    name: 'Maintenance KPIs',
    headers: ['KPI Metric', 'Value', 'Unit'],
    rows: [
      ['Total Work Orders', totalWOs, 'Orders'],
      ['Closed / Completed', totalClosed, 'Orders'],
      ['Open / In Progress', totalOpen, 'Orders'],
      ['Closure Rate', totalWOs > 0 ? ((totalClosed / totalWOs) * 100).toFixed(1) + '%' : '0%', '%'],
      ['Total Downtime', totalDowntime, 'Minutes'],
      ['Total Cost', totalCost.toFixed(2), 'Currency'],
      ['Failure Events', failures, 'Events'],
      ['Operator Faults', opFaults, 'Events'],
      ['Follow-ups Required', followUps, 'Cases'],
      ['Mean Time To Repair (MTTR)', mttr.toFixed(1), 'Minutes'],
      ['Mean Time Between Failures (MTBF)', mtbf.toFixed(1), 'Hours'],
      ['Total Labor Hours', totalHours, 'Hours'],
      ['Avg Cost Per WO', totalClosed > 0 ? (totalCost / totalClosed).toFixed(2) : '0', 'Currency'],
      ['', '', ''],
      ['STATUS BREAKDOWN', '', ''],
      ...statusBreakdown,
      ['', '', ''],
      ['TOP RECURRING ISSUES', '', ''],
    ],
  };
}

function sheetToXml(sheet: SheetConfig, isFirstSheet: boolean, assetCode: string, orgName: string, plantName: string): string {
  const safeHeaders = sheet.headers.length > 0 ? sheet.headers : ['Info'];
  const safeRows = sheet.rows.length > 0 ? sheet.rows : [['No data']];
  const columnCount = Math.max(safeHeaders.length, ...safeRows.map((row) => row.length), 1);

  const mergeAcross = Math.max(0, columnCount - 1);
  const generatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const headerRows: string[] = [];

  // Title block (only on all sheets)
  headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sOrgHeader"><Data ss:Type="String">${escapeXml(orgName.toUpperCase())}</Data></Cell>`]));
  headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sTitle"><Data ss:Type="String">Maintenance Asset Logbook — ${escapeXml(assetCode)}</Data></Cell>`]));
  headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sMeta"><Data ss:Type="String">Plant: ${escapeXml(plantName)} • Generated: ${generatedAt}</Data></Cell>`]));
  headerRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sBody"><Data ss:Type="String"></Data></Cell>`]));

  // Header row
  const headerRow = rowXml(safeHeaders.map((header) => cellXml(header, 'sHeader')));
  const dataStartRow = headerRows.length + 2; // After title block and header
  const dataEndRow = dataStartRow + safeRows.length - 1;

  // Body rows
  const bodyRows = safeRows.map((row) => rowXml(Array.from({ length: columnCount }, (_, index) => cellXml(row[index] ?? '', 'sBody'))));

  // Summary rows (if any)
  const summaryRows: string[] = [];
  if (sheet.summaryRows && sheet.summaryRows.length > 0) {
    const summaryRowCount = sheet.summaryRows.length;
    // Add spacer
    summaryRows.push(rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sBody"><Data ss:Type="String"></Data></Cell>`]));
    sheet.summaryRows.forEach((summaryRow) => {
      summaryRows.push(rowXml(Array.from({ length: columnCount }, (_, index) => {
        const cell = summaryRow[index];
        if (!cell) return cellXml('', 'sBody');
        return cellXml(cell.value, cell.style, cell.formula);
      })));
    });
  }

  // Footer
  const footerRows = [
    rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sBody"><Data ss:Type="String"></Data></Cell>`]),
    rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sTamOptix"><Data ss:Type="String">TamOptiX Technologies | Intelligent CMMS Platform</Data></Cell>`]),
    rowXml([`<Cell ss:MergeAcross="${mergeAcross}" ss:StyleID="sFooter"><Data ss:Type="String">Powered by TamOptiX Technologies — Confidential</Data></Cell>`]),
  ];

  const allRows = [...headerRows, headerRow, ...bodyRows, ...summaryRows, ...footerRows];
  const totalRowCount = allRows.length;
  const headerRowIndex = headerRows.length + 1;

  const af = autoFilterXml(1, columnCount, headerRowIndex);

  const columnXml = buildColumnXml(safeHeaders, safeRows, isFirstSheet ? [10, 30] : undefined);

  return `<Worksheet ss:Name="${escapeXml(sheet.name)}">
    <Table>${columnXml}${allRows.join('\n')}</Table>
    ${af}
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Print>
        <ValidPrinterInfo/>
        <PaperSizeIndex>9</PaperSizeIndex>
        <HorizontalResolution>600</HorizontalResolution>
        <VerticalResolution>600</VerticalResolution>
      </Print>
      <Selected/>
      <Panes>
        <Pane>
          <Number>3</Number>
          <ActiveRow>${Math.min(totalRowCount - 1, 10)}</ActiveRow>
          <ActiveCol>0</ActiveCol>
          <RangeSelection>R1C1:R${Math.min(totalRowCount, 50)}C${columnCount}</RangeSelection>
        </Pane>
      </Panes>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>`;
}

export async function generateAssetLogbook(assetId: string): Promise<Buffer> {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const teamRepo = AppDataSource.getRepository(MaintenanceTeamEntity);

  const asset = await assetRepo.findOne({
    where: { id: assetId },
    relations: { department: true, plant: { organization: true } },
  });

  if (!asset) {
    throw new Error('Asset not found');
  }

  const plant = asset.plant;
  const org = plant?.organization ?? null;
  const orgName = org?.name || 'CMMS Organization';
  const plantName = plant?.plantName || 'Unknown Plant';

  // Get all work orders for this asset
  const workOrders = await workOrderRepo.find({
    where: { assetId: asset.id },
    order: { closedAt: 'DESC', createdAt: 'DESC' },
  });

  // Resolve user names for raised_by
  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  workOrders.forEach((wo) => {
    if (wo.raisedBy) userIds.add(wo.raisedBy);
    if (wo.assignedTo) userIds.add(wo.assignedTo);
    if (wo.followUpTeamId) teamIds.add(wo.followUpTeamId);
  });

  const users = userIds.size > 0
    ? await userRepo.find({ where: Array.from(userIds).map((id) => ({ id })) })
    : [];
  const teams = teamIds.size > 0
    ? await teamRepo.find({ where: Array.from(teamIds).map((id) => ({ id })) })
    : [];

  const raisedByUsers = new Map<string, string>();
  const assignedUsers = new Map<string, string>();
  users.forEach((u) => {
    const name = u.fullName || u.email || u.id;
    raisedByUsers.set(u.id, name);
    assignedUsers.set(u.id, name);
  });

  const assignedTeams = new Map<string, string>();
  teams.forEach((t) => {
    assignedTeams.set(t.id, t.teamName || t.id);
  });

  const input: AssetLogbookInput = {
    asset,
    department: asset.department,
    plant,
    organization: org,
    workOrders,
    raisedByUsers,
    assignedTeams,
    assignedUsers,
  };

  const sheets = [
    buildAssetSummarySheet(input),
    buildWorkOrderHistorySheet(input),
    buildDowntimeAnalysisSheet(input),
    buildFailureCategorizationSheet(input),
    buildMaintenanceKpiSheet(input),
  ];

  const worksheetXmls = sheets
    .map((sheet, index) => sheetToXml(sheet, index === 0, asset.code, orgName, plantName))
    .join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Maintenance Asset Logbook — ${escapeXml(asset.code)}</Title>
  <Author>TamOptiX Technologies CMMS</Author>
 </DocumentProperties>
  <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Segoe UI" ss:Size="10"/>
  </Style>
  <Style ss:ID="sTitle">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="16" ss:Color="#1E293B"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="sOrgHeader">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="11" ss:Color="#475569"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sMeta">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#64748B"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sHeader">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="9" ss:Color="#FFFFFF"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
   </Borders>
   <Protection x:HideFormula="1"/>
  </Style>
  <Style ss:ID="sBody">
   <Font ss:FontName="Segoe UI" ss:Size="9"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="sSummaryLabel">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="sSummaryNumber">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="sFooter">
   <Font ss:FontName="Segoe UI" ss:Italic="1" ss:Size="8" ss:Color="#94A3B8"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="sTamOptix">
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Size="9" ss:Color="#0F172A"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
 </Styles>
 ${worksheetXmls}
</Workbook>`;

  return Buffer.from(xml, 'utf8');
}
