import pino from 'pino';
import { env } from './env';

const sensitiveFields = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.body.password',
  'req.body.passwordHash',
  'req.body.refreshToken',
  'req.body.token',
  'req.body.accessToken',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.mfaCode',
  'req.body.mfaSecret',
  'req.body.captchaAnswer',
  'res.headers["set-cookie"]',
  'res.headers["authorization"]',
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.accessToken',
  '*.refreshToken',
  '*.mfaSecret',
  '*.encryptionKey',
];

const loggerConfig = {
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: sensitiveFields,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: 'cmms-backend',
    environment: env.NODE_ENV,
  },
  serializers: {
    req: (req: { method: string; url: string; path: string; params: Record<string, unknown>; headers: Record<string, string> }) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      parameters: req.params,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    }),
    res: (res: { statusCode: number }) => ({
      statusCode: res.statusCode,
    }),
    err: (err: { name: string; message: string; stack?: string }) => ({
      name: err.name,
      message: err.message,
      stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    }),
  },
};

let logger: pino.Logger;

if (env.NODE_ENV === 'production') {
  logger = pino(loggerConfig);
} else {
  logger = pino(loggerConfig);
}

export { logger };
