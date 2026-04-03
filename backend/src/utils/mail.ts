import nodemailer from 'nodemailer';
import { env } from '../config/env';

function canSendMail() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_FROM);
}

export async function sendEmail(input: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}) {
  if (!canSendMail() || input.to.length === 0) {
    return { sent: false as const, skipped: true as const };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to.join(','),
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { sent: true as const, skipped: false as const };
}
