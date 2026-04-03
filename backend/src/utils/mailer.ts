import nodemailer from 'nodemailer';
import { env } from '../config/env';

export async function sendMail(to: string[], subject: string, text: string) {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    return { sent: false, error: 'SMTP is not configured' as string | null };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: to.join(','),
      subject,
      text,
    });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown email error' };
  }
}
