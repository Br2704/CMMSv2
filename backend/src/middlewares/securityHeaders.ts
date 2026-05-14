import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';

const DANGEROUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zap/i,
  /burp/i,
  /hydra/i,
  /medusa/i,
  /john.*the.*ripper/i,
  /wpscan/i,
  /dirbuster/i,
  /gobuster/i,
];

const SQL_INJECTION_PATTERN = /(?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)/i;
const SCRIPT_INJECTION_PATTERN = /(?:<\?php|<script|javascript:|on\w+=)/i;
const PATH_TRAVERSAL_PATTERN = /(?:(?:\.\.(?:\/|\\))|(?:%2e%2e(?:\/|\\)))/i;
const CODE_EXECUTION_PATTERN = /(?:eval\(|exec\(|system\(|shell_exec\()/i;
const IFRAME_INJECTION_PATTERN = /(?:<iframe|<embed|<object)/i;
const ENCODED_PATTERN = /(?:base64_decode|chr\(|ord\()/i;

const SUSPICIOUS_PATTERNS = [
  SQL_INJECTION_PATTERN,
  SCRIPT_INJECTION_PATTERN,
  PATH_TRAVERSAL_PATTERN,
  CODE_EXECUTION_PATTERN,
  IFRAME_INJECTION_PATTERN,
  ENCODED_PATTERN,
];

interface SecurityConfig {
  enabled: boolean;
  blockSuspiciousUserAgents: boolean;
  logSuspiciousRequests: boolean;
  maxRequestBodyLength: number;
  blockSuspiciousPatterns: boolean;
}

const securityConfig: SecurityConfig = {
  enabled: env.NODE_ENV === 'production',
  blockSuspiciousUserAgents: true,
  logSuspiciousRequests: true,
  maxRequestBodyLength: 1024 * 1024,
  blockSuspiciousPatterns: true,
};

function isSuspiciousUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return DANGEROUS_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

function containsSuspiciousPattern(data: unknown): boolean {
  if (typeof data !== 'string') {
    if (typeof data === 'object' && data !== null) {
      return containsSuspiciousPattern(JSON.stringify(data));
    }
    return false;
  }
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(data));
}

function sanitizeForLogging(data: unknown): unknown {
  if (typeof data === 'string') {
    const sanitized = data
      .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-])/gi, '[EMAIL_REDACTED]')
      .replace(/(\d{3}[-.]?\d{3}[-.]?\d{4})/g, '[PHONE_REDACTED]')
      .replace(/(Bearer\s+)[a-zA-Z0-9._-]+/gi, '$1[TOKEN_REDACTED]');
    return sanitized;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'mfa', 'captcha', 'authorization'];
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }
  return data;
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.setHeader('X-Requested-With', 'XMLHttpRequest');
  }

  next();
}

export function threatDetectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!securityConfig.enabled) {
    next();
    return;
  }

  const userAgent = req.headers['user-agent'];
  if (securityConfig.blockSuspiciousUserAgents && isSuspiciousUserAgent(userAgent)) {
    logger.warn(
      { method: req.method, path: req.path, userAgent: sanitizeForLogging(userAgent) },
      'Blocked suspicious user agent',
    );
    res.status(403).json({
      success: false,
      message: 'Request blocked due to suspicious user agent',
      code: 'SECURITY_BLOCK',
    });
    return;
  }

  if (securityConfig.logSuspiciousRequests) {
    const suspiciousBody = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null;
    if (suspiciousBody && containsSuspiciousPattern(JSON.stringify(suspiciousBody))) {
      logger.warn(
        {
          method: req.method,
          path: req.path,
          ip: req.ip,
          body: sanitizeForLogging(suspiciousBody),
        },
        'Suspicious request pattern detected',
      );
    }
  }

  if (securityConfig.blockSuspiciousPatterns) {
    // Only check the URL path (not query string) to avoid false positives from UUIDs or normal params
    const urlPath = req.path || '/';
    if (containsSuspiciousPattern(urlPath)) {
      logger.warn(
        { method: req.method, path: urlPath, ip: req.ip },
        'Blocked request with suspicious URL path',
      );
      res.status(400).json({
        success: false,
        message: 'Request contains potentially malicious content',
        code: 'SECURITY_BLOCK',
      });
      return;
    }
  }

  next();
}

export function requestValidationMiddleware(req: Request, res: Response, next: NextFunction) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > securityConfig.maxRequestBodyLength) {
    res.status(413).json({
      success: false,
      message: 'Request body too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(req.method.toUpperCase())) {
    res.status(405).json({
      success: false,
      message: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    });
    return;
  }

  next();
}