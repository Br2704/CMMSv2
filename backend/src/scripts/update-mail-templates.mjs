import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, '../services/mail-templates.ts');
let content = readFileSync(filePath, 'utf-8');

// 1. Add interfaces after WoTemplateData
const interfacesToAdd = `

interface AuthTemplateData {
  userName: string;
  email: string;
  link?: string;
  token?: string;
  otp?: string;
  expiresIn?: string;
}

interface PmNotificationData {
  templateName: string;
  assetName: string;
  dueDate: string;
  maintenanceType?: string;
  discipline?: string;
  estimatedDuration?: string;
  link?: string;
}
`;

content = content.replace(
  '  escalationLevel?: number;\n  link?: string;\n}',
  '  escalationLevel?: number;\n  link?: string;\n}' + interfacesToAdd
);

// 2. Add new templates before export const MailTemplates
const newTemplates = `
function authShell(content: string, title: string, logoOverride?: string): string {
  const logo = logoOverride || BRAND_LOGO;
  return \`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>\${title}</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;min-height:100vh"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<tr><td style="padding:32px 32px 24px;background:\${PRIMARY_COLOR};text-align:center">
<img src="\${logo}" alt="CMMS" style="height:40px;width:auto;margin-bottom:8px">
<h1 style="margin:0;font-size:20px;font-weight:600;color:#fff">\${title}</h1>
</td></tr>
<tr><td style="padding:32px">\${content}</td></tr>
<tr><td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
<p style="margin:0 0 8px;font-size:12px;color:#6b7280">TamOptiX CMMS - Enterprise Maintenance Platform</p>
<p style="margin:0;font-size:11px;color:#9ca3af">
<a href="\${DASHBOARD_URL}" style="color:\${PRIMARY_COLOR};text-decoration:none">Dashboard</a>
<span style="margin:0 8px">|</span>
<a href="\${DASHBOARD_URL}/work-orders" style="color:\${PRIMARY_COLOR};text-decoration:none">Work Orders</a>
</p>
<p style="margin:8px 0 0;font-size:10px;color:#9ca3af">This is an automated message from TamOptiX CMMS. Please do not reply to this email.</p>
</td></tr></table></td></tr></table></body></html>\`;
}

function passwordReset(data: AuthTemplateData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Hello <strong>\${data.userName}</strong>,</p>
<p style="font-size:14px;color:#6b7280;margin:0 0 24px">We received a request to reset the password for your TamOptiX CMMS account associated with <strong>\${data.email}</strong>.</p>
<div style="padding:20px;background:#f0f7ff;border-radius:8px;margin-bottom:24px;text-align:center">
<p style="font-size:14px;color:#374151;margin:0 0 8px">Click the button below to reset your password:</p>
\${actionButton(data.link || DASHBOARD_URL + '/reset-password?token=' + (data.token || ''), 'Reset Password', PRIMARY_COLOR)}
</div>
<p style="font-size:13px;color:#9ca3af;margin:0 0 8px">This link will expire in <strong>\${data.expiresIn || '1 hour'}</strong>.</p>
<p style="font-size:13px;color:#9ca3af;margin:0">If you did not request a password reset, please ignore this email or contact your administrator.</p>
\`, 'Reset Your Password');
}

function userInvitation(data: AuthTemplateData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Hello <strong>\${data.userName}</strong>,</p>
<p style="font-size:14px;color:#6b7280;margin:0 0 24px">You have been invited to join the <strong>TamOptiX CMMS</strong> platform. Your account has been created with the email <strong>\${data.email}</strong>.</p>
<div style="padding:20px;background:#f0fdf4;border-radius:8px;margin-bottom:24px;text-align:center">
<p style="font-size:14px;color:#374151;margin:0 0 16px">Get started by logging into your account:</p>
\${actionButton(data.link || DASHBOARD_URL + '/login', 'Login to CMMS', SUCCESS_COLOR)}
</div>
<p style="font-size:13px;color:#6b7280;margin:0 0 4px">If you have any questions, please contact your system administrator.</p>
\`, 'Welcome to TamOptiX CMMS');
}

function otpVerification(data: AuthTemplateData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">Hello <strong>\${data.userName}</strong>,</p>
<p style="font-size:14px;color:#6b7280;margin:0 0 24px">Your verification code for TamOptiX CMMS is:</p>
<div style="padding:24px;background:#f4f5f7;border-radius:8px;margin-bottom:24px;text-align:center;letter-spacing:12px">
<span style="font-size:36px;font-weight:700;color:\${PRIMARY_COLOR};font-family:monospace">\${data.otp || '000000'}</span>
</div>
<p style="font-size:13px;color:#9ca3af;margin:0 0 8px">This code will expire in <strong>\${data.expiresIn || '10 minutes'}</strong>.</p>
<p style="font-size:13px;color:#9ca3af;margin:0">If you did not request this code, please ignore this email.</p>
\`, 'Your Verification Code');
}

function pmDue(data: PmNotificationData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">A preventive maintenance task is <strong>due</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6">
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;width:40%">Template</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">\${data.templateName}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Asset</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.assetName}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Due Date</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.dueDate}</td></tr>
\${data.maintenanceType ? \`<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Type</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.maintenanceType}</td></tr>\` : ''}
\${data.discipline ? \`<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Discipline</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.discipline}</td></tr>\` : ''}
\${data.estimatedDuration ? \`<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Est. Duration</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.estimatedDuration}</td></tr>\` : ''}
</table>
\${actionButton(data.link || DASHBOARD_URL + '/preventive-maintenance', 'View PM Schedule', INFO_COLOR)}
\`, 'Preventive Maintenance Due');
}

function calibrationDue(data: PmNotificationData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">A calibration task is <strong>due</strong> for an instrument.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6">
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;width:40%">Template</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">\${data.templateName}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Instrument/Asset</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.assetName}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Due Date</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.dueDate}</td></tr>
\${data.maintenanceType ? \`<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500">Calibration Type</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">\${data.maintenanceType}</td></tr>\` : ''}
</table>
\${actionButton(data.link || DASHBOARD_URL + '/calibration', 'View Calibration Schedule', WARNING_COLOR)}
\`, 'Calibration Due');
}

function assetReminder(data: PmNotificationData): string {
  return authShell(\`
<p style="font-size:16px;color:#374151;margin:0 0 24px">A maintenance reminder for asset <strong>\${data.assetName}</strong>.</p>
<p style="font-size:14px;color:#6b7280;margin:0 0 24px">\${data.templateName}</p>
<div style="padding:16px;background:#fffbeb;border-radius:8px;margin-bottom:24px;text-align:center">
<span style="font-size:32px">🔧</span>
<p style="font-size:14px;color:#92400e;font-weight:600;margin:8px 0 0">Due by: \${data.dueDate}</p>
</div>
\${actionButton(data.link || DASHBOARD_URL + '/assets', 'View Asset', INFO_COLOR)}
\`, 'Asset Maintenance Reminder');
}
`;

content = content.replace(
  'export const MailTemplates = {',
  newTemplates + '\nexport const MailTemplates = {'
);

// 3. Update MailTemplates export
const oldMT = `export const MailTemplates = {
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
};`;

const newMT = `export const MailTemplates = {
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
  passwordReset,
  userInvitation,
  otpVerification,
  pmDue,
  calibrationDue,
  assetReminder,
};`;

content = content.replace(oldMT, newMT);

writeFileSync(filePath, content, 'utf-8');
console.log('SUCCESS: mail-templates.ts updated');
