import type { NextFunction, Request, Response } from 'express';
import { audit } from '../utils/audit';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const EXPORT_PATH_PATTERN = /\/exports\//i;
const SENSITIVE_READ_PATH_PATTERNS = [
  /\/security(\/|$)/i,
  /\/rbac(\/|$)/i,
  /\/roles(\/|$)/i,
  /\/role-permissions(\/|$)/i,
  /\/permissions(\/|$)/i,
  /\/users(\/|$)/i,
];

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const isMutation = MUTATING_METHODS.has(req.method.toUpperCase());
  const isExport = req.method.toUpperCase() === 'GET' && EXPORT_PATH_PATTERN.test(req.originalUrl);
  const isSensitiveRead =
    req.method.toUpperCase() === 'GET' && SENSITIVE_READ_PATH_PATTERNS.some((pattern) => pattern.test(req.path));
  if (!isMutation && !isExport && !isSensitiveRead) {
    next();
    return;
  }

  res.on('finish', () => {
    const action = isExport ? 'http.export' : isMutation ? 'http.mutation' : 'http.access';
    void audit(action, {
      module: 'HTTP',
      method: req.method,
      path: req.originalUrl,
      userId: req.auth?.userId ?? null,
      plantId: req.auth?.plantIds?.[0] ?? null,
      organizationId: req.auth?.organizationId ?? null,
      statusCode: res.statusCode,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  });

  next();
}
