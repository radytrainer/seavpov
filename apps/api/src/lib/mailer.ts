import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';

export interface Mailer {
  /** Returns false when email delivery is not configured. */
  send(to: string, subject: string, text: string): Promise<boolean>;
}

export function createMailer(env: Env, log: FastifyBaseLogger): Mailer {
  if (!env.SMTP_HOST) {
    return {
      async send(to, subject, text) {
        if (env.NODE_ENV === 'development') {
          // Development convenience only: production never logs message bodies.
          log.info({ to, subject, text }, 'SMTP not configured — email logged instead of sent');
        } else {
          log.warn({ subject }, 'SMTP not configured — email not sent');
        }
        return false;
      },
    };
  }

  const transport: Transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  return {
    async send(to, subject, text) {
      try {
        await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
        return true;
      } catch (err) {
        log.error({ err, subject }, 'Failed to send email');
        return false;
      }
    },
  };
}
