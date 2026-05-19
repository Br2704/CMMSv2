import { env } from '../config/env';

const PRIMARY_COLOR = '#2563eb';
const DANGER_COLOR = '#dc2626';
const WARNING_COLOR = '#f59e0b';
const SUCCESS_COLOR = '#16a34a';
const INFO_COLOR = '#0891b2';
const BRAND_LOGO = `${env.FRONTEND_URL || 'http://localhost:5173'}/jkfenner/jkfenner-logo.png`;
const DASHBOARD_URL = env.FRONTEND_URL || 'http://localhost:5173';

interface WoTemplateData {
  woNumber: string;
  category?: string;
  assetName?: string;
  problemDescription?: string;
  priority: string;
  location?: string;
  assignedTeam?: string;
  createdTime?: string;
  slaResponseTime?: string;
  status?: string;
  escalationLevel?: number;
  link?: string;
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    CRITICAL: DANGER_COLOR,
    HIGH: '#ea580c',
    MEDIUM: WARNING_COLOR,
    LOW: INFO_COLOR,
    PLANNED: '#6b7280',
  };
  return map[priority?.toUpperCase()] || INFO_COLOR;
}

function priorityBadge(priority: string): string {
  const color = getPriorityColor(priority);
  return `<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${color}">${priority || 'N/A'}</span>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    RAISED: INFO_COLOR,
    ACCEPTED: '#7c3aed',
    IN_PROGRESS: WARNING_COLOR,
    COMPLETED: SUCCESS_COLOR,
    CLOSED: '#374151',
    REJECTED: DANGER_COLOR,
    PENDING: WARNING_COLOR,
    OVERDUE: DANGER_COLOR,
    ESCALATED: '#ea580c',
    USER_VERIFICATION: '#0891b2',
  };
  const color = colors[status?.toUpperCase()] || '#6b7280';
  return `<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${color}">${status || 'N/A'}</span>`;
}

function shell(content: string, title: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;min-height:100vh"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<tr><td style="padding:32px 32px 24px;background:${PRIMARY_COLOR};text-align:center">
<img src="${BRAND_LOGO}" alt="CMMS" style="height:40px;width:auto;margin-bottom:8px">
<h1 style="margin:0;font-size:20px;font-weight:600;color:#fff">${title}</h1>
</td></tr>
<tr><td style="padding:32px">${content}</td></tr>
<tr><td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
<p style="margin:0 0 8px;font-size:12px;color:#6b7280">TamOptiX CMMS - Enterprise Maintenance Platform</p>
<p style="margin:0;font-size:11px;color:#9ca3af">
<a href="${DASHBOARD_URL}" style="color:${PRIMARY_COLOR};text-decoration:none">Dashboard</a>
<span style="margin:0 8px">|</span>
<a href="${DASHBOARD_URL}/work-orders" style="color:${PRIMARY_COLOR};text-decoration:none">Work Orders</a>
<span style="margin:0 8px">|</span>
<a href="${DASHBOARD_URL}/settings/notifications" style="color:${PRIMARY_COLOR};text-decoration:none">Notification Settings</a>
</p>
<p style="margin:8px 0 0;font-size:10px;color:#9ca3af">This is an automated message from CMMS. Please do not reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function woSummaryTable(data: WoTemplateData): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6">
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;width:40%">Work Order</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${data.woNumber}</td></tr>
${data.category ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Category</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${data.category}</td></tr>` : ''}
${data.assetName ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Asset/Machine</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${data.assetName}</td></tr>` : ''}
${data.problemDescription ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Issue Details</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${data.problemDescription}</td></tr>` : ''}
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Priority</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${priorityBadge(data.priority)}</td></tr>
${data.status ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Status</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${statusBadge(data.status)}</td></tr>` : ''}
${data.location ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Location</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${data.location}</td></tr>` : ''}
${data.assignedTeam ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Assigned Team</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${data.assignedTeam}</td></tr>` : ''}
${data.createdTime ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Created</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${data.createdTime}</td></tr>` : ''}
${data.slaResponseTime ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">SLA Response</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${DANGER_COLOR};font-weight:600">${data.slaResponseTime}</td></tr>` : ''}
${data.escalationLevel ? `<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Escalation Level</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${DANGER_COLOR}">Level ${data.escalationLevel}</span></td></tr>` : ''}
</table>`;
}

function actionButton(url: string, label: string, color = PRIMARY_COLOR): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td align="center"><a href="${url}" style="display:inline-block;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;color:#fff;background:${color};text-decoration:none">${label}</a></td></tr></table>`;
}

function newWorkOrder(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">A new work order has been <strong>raised</strong> and requires attention.</p>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'View Work Order')}
${actionButton(DASHBOARD_URL, 'Go to Dashboard', '#374151')}
`, 'New Work Order Raised');
}

function workOrderAssigned(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Work order has been <strong>assigned</strong> to your team for action.</p>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'View & Accept Work Order')}
`, 'Work Order Assigned');
}

function workOrderEscalated(data: WoTemplateData): string {
  const urgencyColors = ['', DANGER_COLOR, '#ea580c', WARNING_COLOR, INFO_COLOR];
  const levelColor = urgencyColors[data.escalationLevel || 1] || DANGER_COLOR;
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 8px">Work order has been <strong>escalated</strong> and requires immediate attention.</p>
<p style="font-size:14px;color:${DANGER_COLOR};margin:0 0 24px;padding:12px;background:#fef2f2;border-radius:8px;font-weight:600">⚠ Escalation Level ${data.escalationLevel || 1} - Action Required</p>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Take Action Now', levelColor)}
`, 'Work Order Escalated');
}

function workOrderPending(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Work order is <strong>pending</strong> and has not been actioned yet.</p>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'View Pending Work Order', WARNING_COLOR)}
`, 'Work Order Pending');
}

function workOrderOverdue(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 8px">Work order has <strong>exceeded its SLA</strong> and is now overdue.</p>
<p style="font-size:14px;color:${DANGER_COLOR};margin:0 0 24px;padding:12px;background:#fef2f2;border-radius:8px;font-weight:600">⏰ SLA Breached - Immediate action required</p>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Resolve Overdue Work Order', DANGER_COLOR)}
`, 'Work Order Overdue - SLA Breached');
}

function workOrderReminder(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">This is a <strong>recurring reminder</strong> for an outstanding work order that requires closure.</p>
${woSummaryTable(data)}
<p style="font-size:13px;color:#6b7280;margin:16px 0 0;padding:12px;background:#fffbeb;border-radius:8px;border-left:4px solid ${WARNING_COLOR}">⏱ This work order is past its expected closure time. Please take action to avoid further escalation.</p>
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Close Work Order', WARNING_COLOR)}
`, 'Work Order Reminder');
}

function workOrderCompleted(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Work order has been <strong>completed</strong> successfully.</p>
<div style="padding:16px;background:#f0fdf4;border-radius:8px;margin-bottom:24px;text-align:center">
<span style="font-size:40px">✅</span>
<p style="font-size:14px;color:#16a34a;font-weight:600;margin:8px 0 0">Completed</p>
</div>
${woSummaryTable({ ...data, status: 'COMPLETED' })}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'View Completed Work Order', SUCCESS_COLOR)}
`, 'Work Order Completed');
}

function workOrderRejected(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Work order has been <strong>rejected</strong> and requires review.</p>
${woSummaryTable({ ...data, status: 'REJECTED' })}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Review Rejected Work Order', DANGER_COLOR)}
`, 'Work Order Rejected');
}

function approvalRequired(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Work order requires your <strong>approval</strong> to proceed.</p>
<div style="padding:16px;background:#fefce8;border-radius:8px;margin-bottom:24px;text-align:center">
<span style="font-size:40px">📋</span>
<p style="font-size:14px;color:#a16207;font-weight:600;margin:8px 0 0">Awaiting Approval</p>
</div>
${woSummaryTable(data)}
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Review & Approve', '#7c3aed')}
`, 'Approval Required');
}

function slaBreached(data: WoTemplateData): string {
  return shell(`
<p style="font-size:16px;color:#374151;margin:0 0 8px"><strong>SLA has been breached</strong> for this work order.</p>
<p style="font-size:14px;color:${DANGER_COLOR};margin:0 0 24px;padding:12px;background:#fef2f2;border-radius:8px;font-weight:600">🚨 SLA Breach - Priority escalation initiated</p>
${woSummaryTable(data)}
<p style="font-size:13px;color:#6b7280;margin:16px 0 0;padding:12px;background:#fef2f2;border-radius:8px;border-left:4px solid ${DANGER_COLOR}">This work order has exceeded its Service Level Agreement (SLA) time. Escalation procedures have been automatically triggered.</p>
${actionButton(data.link || `${DASHBOARD_URL}/work-orders`, 'Resolve Immediately', DANGER_COLOR)}
`, 'SLA Breached - Urgent Action Required');
}

function workOrderDigest(data: {
  date: string;
  openCount: number;
  closedCount: number;
  escalatedCount: number;
  overdueCount: number;
  items: Array<WoTemplateData>;
}): string {
  const itemsHtml = data.items
    .map(
      (item, index) => `
<tr${index % 2 === 0 ? ' style="background:#f9fafb"' : ''}>
<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${item.woNumber}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${item.assetName || '-'}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${priorityBadge(item.priority)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${statusBadge(item.status || '')}</td>
</tr>`,
    )
    .join('');

  return shell(`
<h2 style="font-size:18px;color:#374151;margin:0 0 16px">Daily Work Order Digest</h2>
<p style="font-size:14px;color:#6b7280;margin:0 0 24px">Summary of work order activity for ${data.date}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
<tr>
<td style="padding:16px;text-align:center;background:#eff6ff;border-radius:8px;width:25%">
<p style="font-size:24px;font-weight:700;color:${PRIMARY_COLOR};margin:0">${data.openCount}</p>
<p style="font-size:11px;color:#6b7280;margin:4px 0 0">Open</p>
</td>
<td style="padding:8px;width:4px"></td>
<td style="padding:16px;text-align:center;background:#f0fdf4;border-radius:8px;width:25%">
<p style="font-size:24px;font-weight:700;color:${SUCCESS_COLOR};margin:0">${data.closedCount}</p>
<p style="font-size:11px;color:#6b7280;margin:4px 0 0">Closed</p>
</td>
<td style="padding:8px;width:4px"></td>
<td style="padding:16px;text-align:center;background:#fef2f2;border-radius:8px;width:25%">
<p style="font-size:24px;font-weight:700;color:${DANGER_COLOR};margin:0">${data.escalatedCount}</p>
<p style="font-size:11px;color:#6b7280;margin:4px 0 0">Escalated</p>
</td>
<td style="padding:8px;width:4px"></td>
<td style="padding:16px;text-align:center;background:#fffbeb;border-radius:8px;width:25%">
<p style="font-size:24px;font-weight:700;color:${WARNING_COLOR};margin:0">${data.overdueCount}</p>
<p style="font-size:11px;color:#6b7280;margin:4px 0 0">Overdue</p>
</td>
</tr>
</table>
${itemsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px"><tr style="background:#f3f4f6"><th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">WO #</th><th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">Asset</th><th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">Priority</th><th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151">Status</th></tr>${itemsHtml}</table>` : '<p style="font-size:14px;color:#6b7280;text-align:center">No work order activity to report.</p>'}
${actionButton(DASHBOARD_URL, 'View Full Dashboard')}
`, 'Daily Work Order Digest');
}

export const MailTemplates = {
  newWorkOrder,
  workOrderAssigned,
  workOrderEscalated,
  workOrderPending,
  workOrderOverdue,
  workOrderReminder,
  workOrderCompleted,
  workOrderRejected,
  approvalRequired,
  slaBreached,
  workOrderDigest,
};

export function buildMail(input: {
  template: keyof typeof MailTemplates;
  data: WoTemplateData | Record<string, unknown>;
}): { subject: string; html: string } {
  const subjects: Record<string, string> = {
    newWorkOrder: `[CMMS] New Work Order: ${(input.data as WoTemplateData).woNumber}`,
    workOrderAssigned: `[CMMS] Work Order Assigned: ${(input.data as WoTemplateData).woNumber}`,
    workOrderEscalated: `[CMMS] 🚨 Work Order Escalated: ${(input.data as WoTemplateData).woNumber} (Level ${(input.data as WoTemplateData).escalationLevel || 1})`,
    workOrderPending: `[CMMS] Work Order Pending: ${(input.data as WoTemplateData).woNumber}`,
    workOrderOverdue: `[CMMS] ⏰ Work Order Overdue: ${(input.data as WoTemplateData).woNumber}`,
    workOrderReminder: `[CMMS] Reminder: ${(input.data as WoTemplateData).woNumber}`,
    workOrderCompleted: `[CMMS] Work Order Completed: ${(input.data as WoTemplateData).woNumber}`,
    workOrderRejected: `[CMMS] Work Order Rejected: ${(input.data as WoTemplateData).woNumber}`,
    approvalRequired: `[CMMS] Approval Required: ${(input.data as WoTemplateData).woNumber}`,
    slaBreached: `[CMMS] 🚨 SLA Breached: ${(input.data as WoTemplateData).woNumber}`,
    workOrderDigest: `[CMMS] Daily Work Order Digest`,
  };

  const templateFn = MailTemplates[input.template];
  const html = templateFn(input.data as WoTemplateData & { date: string; openCount: number; closedCount: number; escalatedCount: number; overdueCount: number; items: WoTemplateData[] });

  return {
    subject: subjects[input.template] || `[CMMS] Work Order Update: ${(input.data as WoTemplateData).woNumber}`,
    html,
  };
}
