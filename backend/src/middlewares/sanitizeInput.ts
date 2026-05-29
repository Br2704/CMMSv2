import type { NextFunction, Request, Response } from 'express';

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SANITIZE_DEPTH = 20;

function sanitizeString(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .trim();
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SANITIZE_DEPTH) {
    return null;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj)
      .filter(([key]) => !BLOCKED_KEYS.has(key))
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]);
    return Object.fromEntries(entries);
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
