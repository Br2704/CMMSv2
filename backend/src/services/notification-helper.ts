import { AppDataSource } from '../database/data-source';
import { UserEntity, UserRoleEntity, ProfileEntity, AssetEntity, MaintenanceTeamEntity } from '../database/entities';
import { enqueueMail, enqueueBulkMail, isMailConfigured } from './mail.service';
import { buildMail } from './mail-templates';

export interface WoNotificationData {
  woId: string;
  woNumber: string;
  category?: string;
  assetId?: string;
  plantId?: string;
  priority: string;
  status?: string;
  problemDescription?: string;
  location?: string;
  assignedTeamId?: string;
  escalationLevel?: number;
  createdTime?: string;
  slaResponseTime?: string;
}

async function resolveUserEmail(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await AppDataSource.getRepository(UserEntity).findOne({
    where: { id: userId, isActive: true },
    select: ['email'],
  });
  return user?.email ?? null;
}

async function resolveUsersByRole(
  role: string,
  plantId: string | null | undefined,
): Promise<string[]> {
  const userRoleRepo = AppDataSource.getRepository(UserRoleEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);

  const roles = await userRoleRepo.find({ where: { role: role.toUpperCase() } });
  if (roles.length === 0) return [];

  let userIds = roles.map((r) => r.userId);

  if (plantId) {
    const profiles = await profileRepo.find({
      where: userIds.map((uid) => ({ userId: uid, plantId })),
      select: ['userId'],
    });
    userIds = profiles.map((p) => p.userId);
  }

  const users = await AppDataSource.getRepository(UserEntity).find({
    where: userIds.map((uid) => ({ id: uid, isActive: true })),
    select: ['email'],
  });

  return users.map((u) => u.email).filter((e): e is string => Boolean(e));
}

async function resolveTeamMemberEmails(
  teamId: string | null | undefined,
): Promise<string[]> {
  if (!teamId) return [];
  const team = await AppDataSource.getRepository(MaintenanceTeamEntity).findOne({
    where: { id: teamId, isActive: true },
    select: ['teamLeaderId', 'teamMemberIds'],
  });
  if (!team) return [];

  const allIds = [team.teamLeaderId, ...(team.teamMemberIds ?? [])].filter(Boolean) as string[];
  if (allIds.length === 0) return [];

  const users = await AppDataSource.getRepository(UserEntity).find({
    where: allIds.map((id) => ({ id, isActive: true })),
    select: ['email'],
  });
  return users.map((u) => u.email).filter((e): e is string => Boolean(e));
}

async function resolveAssetName(assetId: string | null | undefined): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await AppDataSource.getRepository(AssetEntity).findOne({
    where: { id: assetId },
    select: ['name'],
  });
  return asset?.name ?? undefined;
}

async function buildWoData(raw: WoNotificationData): Promise<Record<string, unknown>> {
  const assetName = raw.assetId ? await resolveAssetName(raw.assetId) : undefined;
  return {
    woNumber: raw.woNumber,
    assetName: assetName || 'Unknown Asset',
    category: raw.category || 'N/A',
    problemDescription: raw.problemDescription || '',
    priority: raw.priority || 'MEDIUM',
    location: raw.location || '',
    assignedTeam: raw.assignedTeamId ? (await resolveTeamMemberEmails(raw.assignedTeamId)).length > 0 ? 'Assigned Team' : '' : '',
    createdTime: raw.createdTime || new Date().toLocaleString(),
    slaResponseTime: raw.slaResponseTime || '',
    status: raw.status || '',
    escalationLevel: raw.escalationLevel || 0,
    link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/work-orders`,
  };
}

export async function sendNewWorkOrderEmails(
  data: WoNotificationData,
  raiserId?: string | null,
): Promise<void> {
  if (!(await isMailConfigured())) return;

  const templateData = await buildWoData(data);

  const emails = new Set<string>();

  const raiserEmail = await resolveUserEmail(raiserId);
  if (raiserEmail) emails.add(raiserEmail);

  const teamEmails = await resolveTeamMemberEmails(data.assignedTeamId);
  teamEmails.forEach((e) => emails.add(e));

  const { subject, html } = buildMail({ template: 'newWorkOrder', data: templateData as any });

  await enqueueBulkMail(
    Array.from(emails).map((recipient) => ({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'newWorkOrder',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_CREATED',
      priority: data.priority === 'CRITICAL' ? 2 : data.priority === 'HIGH' ? 1 : 0,
    })),
  );
}

export async function sendWorkOrderAssignedEmails(
  data: WoNotificationData,
  teamId?: string | null,
): Promise<void> {
  if (!(await isMailConfigured())) return;
  const templateData = await buildWoData(data);
  const emails = await resolveTeamMemberEmails(teamId);
  if (emails.length === 0) return;

  const { subject, html } = buildMail({ template: 'workOrderAssigned', data: templateData as any });

  await enqueueBulkMail(
    emails.map((recipient) => ({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'workOrderAssigned',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_ASSIGNED',
    })),
  );
}

export async function sendWorkOrderCompletedEmails(
  data: WoNotificationData,
  raiserId?: string | null,
  assignedToId?: string | null,
): Promise<void> {
  if (!(await isMailConfigured())) return;
  const templateData = await buildWoData({ ...data, status: 'COMPLETED' });
  const emails = new Set<string>();

  const raiserEmail = await resolveUserEmail(raiserId);
  if (raiserEmail) emails.add(raiserEmail);
  const assigneeEmail = await resolveUserEmail(assignedToId);
  if (assigneeEmail) emails.add(assigneeEmail);

  if (emails.size === 0) return;
  const { subject, html } = buildMail({ template: 'workOrderCompleted', data: templateData as any });

  Array.from(emails).forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'workOrderCompleted',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_COMPLETED',
    });
  });
}

export async function sendWorkOrderClosedEmails(
  data: WoNotificationData,
  raiserId?: string | null,
  assignedToId?: string | null,
): Promise<void> {
  if (!(await isMailConfigured())) return;
  const templateData = await buildWoData({ ...data, status: 'CLOSED' });
  const emails = new Set<string>();

  const raiserEmail = await resolveUserEmail(raiserId);
  if (raiserEmail) emails.add(raiserEmail);
  const assigneeEmail = await resolveUserEmail(assignedToId);
  if (assigneeEmail) emails.add(assigneeEmail);

  if (emails.size === 0) return;
  const { subject, html } = buildMail({ template: 'workOrderCompleted', data: templateData as any });

  Array.from(emails).forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'workOrderCompleted',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_CLOSED',
    });
  });
}

export async function sendWorkOrderEscalationEmails(
  data: WoNotificationData,
  level: number,
  emails: string[],
): Promise<void> {
  if (!(await isMailConfigured()) || emails.length === 0) return;
  const templateData = await buildWoData({ ...data, escalationLevel: level, status: 'ESCALATED' });
  const { subject, html } = buildMail({ template: 'workOrderEscalated', data: templateData as any });

  emails.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'workOrderEscalated',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_ESCALATED',
      priority: 2,
    });
  });
}

export async function sendWorkOrderReminderEmails(
  data: WoNotificationData,
  emails: string[],
): Promise<void> {
  if (!(await isMailConfigured()) || emails.length === 0) return;
  const templateData = await buildWoData(data);
  const { subject, html } = buildMail({ template: 'workOrderReminder', data: templateData as any });

  emails.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'workOrderReminder',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_REMINDER',
      priority: 0,
    });
  });
}

export async function sendSlaBreachEmails(
  data: WoNotificationData,
  emails: string[],
): Promise<void> {
  if (!isMailConfigured() || emails.length === 0) return;
  const templateData = await buildWoData(data);
  const { subject, html } = buildMail({ template: 'slaBreached', data: templateData as any });

  emails.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'slaBreached',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'SLA_BREACHED',
      priority: 3,
    });
  });
}

export async function sendWorkOrderRejectedEmails(
  data: WoNotificationData,
  recipientId?: string | null,
): Promise<void> {
  if (!(await isMailConfigured()) || !recipientId) return;
  const templateData = await buildWoData({ ...data, status: 'REJECTED' });
  const email = await resolveUserEmail(recipientId);
  if (!email) return;

  const { subject, html } = buildMail({ template: 'workOrderAssigned', data: templateData as any });

  enqueueMail({
    recipient: email,
    subject: `Work Order Reopened: ${data.woNumber}`,
    htmlBody: html,
    templateName: 'workOrderRejected',
    templateData: templateData as Record<string, unknown>,
    woId: data.woId,
    woNumber: data.woNumber,
    eventType: 'WORK_ORDER_REJECTED',
  });
}

export async function sendWorkOrderCancelledEmails(
  data: WoNotificationData,
  recipientIds: string[],
): Promise<void> {
  if (!(await isMailConfigured()) || recipientIds.length === 0) return;
  const templateData = await buildWoData({ ...data, status: 'CANCELLED' });
  const emails = await Promise.all(recipientIds.map(resolveUserEmail));
  const validEmails = emails.filter((e): e is string => Boolean(e));

  if (validEmails.length === 0) return;

  const { subject, html } = buildMail({ template: 'workOrderCompleted', data: templateData as any });

  validEmails.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject: `Work Order Cancelled: ${data.woNumber}`,
      htmlBody: html,
      templateName: 'workOrderCancelled',
      templateData: templateData as Record<string, unknown>,
      woId: data.woId,
      woNumber: data.woNumber,
      eventType: 'WORK_ORDER_CANCELLED',
    });
  });
}

export async function sendPasswordResetEmail(
  email: string,
  userName: string,
  resetLink: string,
): Promise<void> {
  if (!(await isMailConfigured()) || !email) return;

  const { subject, html } = buildMail({
    template: 'passwordReset',
    data: {
      userName,
      email,
      link: resetLink,
      expiresIn: '1 hour',
    } as any,
  });

  await enqueueMail({
    recipient: email,
    subject,
    htmlBody: html,
    templateName: 'passwordReset',
    templateData: { userName, email, expiresIn: '1 hour' },
    eventType: 'PASSWORD_RESET',
  });
}

export async function sendUserInvitationEmail(
  email: string,
  userName: string,
  inviteLink: string,
): Promise<void> {
  if (!(await isMailConfigured()) || !email) return;

  const { subject, html } = buildMail({
    template: 'userInvitation',
    data: {
      userName,
      email,
      link: inviteLink,
    } as any,
  });

  await enqueueMail({
    recipient: email,
    subject,
    htmlBody: html,
    templateName: 'userInvitation',
    templateData: { userName, email },
    eventType: 'USER_INVITED',
  });
}

export async function sendPmDueEmails(
  recipients: string[],
  data: {
    templateName: string;
    assetName: string;
    dueDate: string;
    maintenanceType?: string;
    discipline?: string;
    estimatedDuration?: string;
  },
): Promise<void> {
  if (!(await isMailConfigured()) || recipients.length === 0) return;

  const { subject, html } = buildMail({
    template: 'pmDue',
    data: { ...data, link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/preventive-maintenance` } as any,
  });

  recipients.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'pmDue',
      templateData: data as Record<string, unknown>,
      eventType: 'PM_DUE',
    });
  });
}

export async function sendCalibrationDueEmails(
  recipients: string[],
  data: {
    templateName: string;
    assetName: string;
    dueDate: string;
    maintenanceType?: string;
  },
): Promise<void> {
  if (!(await isMailConfigured()) || recipients.length === 0) return;

  const { subject, html } = buildMail({
    template: 'calibrationDue',
    data: { ...data, link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/calibration` } as any,
  });

  recipients.forEach((recipient) => {
    enqueueMail({
      recipient,
      subject,
      htmlBody: html,
      templateName: 'calibrationDue',
      templateData: data as Record<string, unknown>,
      eventType: 'CALIBRATION_DUE',
    });
  });
}
