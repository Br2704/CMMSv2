import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.passwordHash',
      'req.body.refreshToken',
      'req.body.token',
      'req.body.accessToken',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});
