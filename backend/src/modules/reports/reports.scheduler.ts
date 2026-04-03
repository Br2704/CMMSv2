import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppDataSource } from '../../database/data-source';
import { EmailReportLogEntity, EmailReportScheduleEntity } from '../../database/entities';

let schedulerStarted = false;

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameWeek(a: Date, b: Date) {
  const aStart = new Date(a);
  const bStart = new Date(b);
  const aOffset = (aStart.getDay() + 6) % 7;
  const bOffset = (bStart.getDay() + 6) % 7;
  aStart.setDate(aStart.getDate() - aOffset);
  bStart.setDate(bStart.getDate() - bOffset);
  return isSameDay(aStart, bStart);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameQuarter(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && Math.floor(a.getMonth() / 3) === Math.floor(b.getMonth() / 3);
}

function shouldRunForFrequency(schedule: EmailReportScheduleEntity, now: Date): boolean {
  const frequency = String(schedule.frequency || 'DAILY').toUpperCase();
  const lastSentAt = schedule.lastSentAt ? new Date(schedule.lastSentAt) : null;

  if (frequency === 'DAILY') {
    return !lastSentAt || !isSameDay(lastSentAt, now);
  }

  if (frequency === 'WEEKLY') {
    if (now.getDay() !== 1) {
      return false;
    }
    return !lastSentAt || !isSameWeek(lastSentAt, now);
  }

  if (frequency === 'MONTHLY') {
    if (now.getDate() !== 1) {
      return false;
    }
    return !lastSentAt || !isSameMonth(lastSentAt, now);
  }

  if (frequency === 'QUARTERLY') {
    const month = now.getMonth();
    const firstQuarterMonth = month % 3 === 0;
    if (!firstQuarterMonth || now.getDate() !== 1) {
      return false;
    }
    return !lastSentAt || !isSameQuarter(lastSentAt, now);
  }

  return false;
}

async function sendSchedule(schedule: EmailReportScheduleEntity, now: Date) {
  const logRepo = AppDataSource.getRepository(EmailReportLogEntity);
  const scheduleRepo = AppDataSource.getRepository(EmailReportScheduleEntity);
  const payload = {
    reportName: schedule.reportName,
    generatedAt: now.toISOString(),
    sections: schedule.reportSections ?? [],
    filters: schedule.filters ?? null,
    includeCharts: schedule.includeCharts,
    includeTables: schedule.includeTables,
    includeDetailedLogs: schedule.includeDetailedLogs,
  };
  const subject = `[CMMS] ${schedule.reportName} - ${now.toISOString().slice(0, 10)}`;
  const body = `Automated report payload:\n${JSON.stringify(payload, null, 2)}`;

  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    await logRepo.save(
      logRepo.create({
        scheduleId: schedule.id,
        status: 'FAILED',
        recipients: schedule.recipients ?? [],
        errorMessage: 'SMTP is not configured',
        recordsIncluded: 0,
        reportData: payload,
      }),
    );
    return { sent: false, error: 'SMTP is not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: (schedule.recipients ?? []).join(','),
      subject,
      text: body,
    });

    await logRepo.save(
      logRepo.create({
        scheduleId: schedule.id,
        status: 'SUCCESS',
        recipients: schedule.recipients ?? [],
        errorMessage: null,
        recordsIncluded: 0,
        reportData: payload,
      }),
    );

    schedule.lastSentAt = now;
    await scheduleRepo.save(schedule);

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    await logRepo.save(
      logRepo.create({
        scheduleId: schedule.id,
        status: 'FAILED',
        recipients: schedule.recipients ?? [],
        errorMessage: message,
        recordsIncluded: 0,
        reportData: payload,
      }),
    );
    return { sent: false, error: message };
  }
}

async function runDueSchedules() {
  if (!AppDataSource.isInitialized) {
    return;
  }

  const now = new Date();
  const repo = AppDataSource.getRepository(EmailReportScheduleEntity);
  const schedules = await repo.find({ where: { isEnabled: true } });
  const due = schedules.filter((schedule) => {
    const parsed = parseTime(schedule.sendTime ?? '');
    if (!parsed) {
      return false;
    }
    if (parsed.hour !== now.getHours() || parsed.minute !== now.getMinutes()) {
      return false;
    }
    return shouldRunForFrequency(schedule, now);
  });

  for (const schedule of due) {
    const result = await sendSchedule(schedule, now);
    logger.info(
      {
        scheduleId: schedule.id,
        reportName: schedule.reportName,
        sent: result.sent,
        error: 'error' in result ? result.error : null,
      },
      'Processed scheduled report',
    );
  }
}

export function startReportsScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  cron.schedule('* * * * *', () => {
    void runDueSchedules().catch((error) => {
      logger.error({ error }, 'Failed running report scheduler tick');
    });
  });

  logger.info('Report scheduler started');
}

