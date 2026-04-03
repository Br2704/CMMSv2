import type { NextFunction, Request, Response } from 'express';

function sanitizeString(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .trim();
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      out[key] = sanitizeValue(item);
    }
    return out;
  }
  return value;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    req.query = sanitizeValue(req.query) as Request['query'];
  }
  if (req.params) {
    req.params = sanitizeValue(req.params) as Request['params'];
  }
  next();
}
