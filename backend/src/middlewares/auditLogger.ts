import type { NextFunction, Request, Response } from 'express';
import { audit } from '../utils/audit';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const EXPORT_PATH_PATTERN = /\/exports\//i;

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const isMutation = MUTATING_METHODS.has(req.method.toUpperCase());
  const isExport = req.method.toUpperCase() === 'GET' && EXPORT_PATH_PATTERN.test(req.originalUrl);
  if (!isMutation && !isExport) {
    next();
    return;
  }

  res.on('finish', () => {
    void audit(isExport ? 'http.export' : 'http.mutation', {
      module: 'HTTP',
      method: req.method,
      path: req.originalUrl,
      userId: req.auth?.userId ?? null,
      plantId: req.auth?.plantIds?.[0] ?? null,
      statusCode: res.statusCode,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  });

  next();
}
