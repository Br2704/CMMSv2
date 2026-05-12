import type { NextFunction, Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';
import { HttpError } from '../utils/httpError';

function mapQueryError(error: QueryFailedError): { status: number; message: string; details?: unknown } {
  const dbError = error as QueryFailedError & {
    code?: string;
    detail?: string;
    table?: string;
    constraint?: string;
    sqlMessage?: string;
  };

  const code = String(dbError.code ?? '').toLowerCase();
  const details = {
    code: dbError.code ?? null,
    detail: dbError.detail ?? dbError.sqlMessage ?? null,
    table: dbError.table ?? null,
    constraint: dbError.constraint ?? null,
  };

  if (code === '23505' || code === 'er_dup_entry' || code === '2627' || code === '2601') {
    return { status: 409, message: 'Unique constraint violation', details };
  }
  if (code === '23503' || code === 'er_no_referenced_row_2' || code === '547') {
    return { status: 400, message: 'Invalid reference in request data', details };
  }
  if (code === '23502' || code === 'er_bad_null_error' || code === '515') {
    return { status: 400, message: 'Missing required field', details };
  }
  if (code === '22p02' || code === '22007' || code === '241') {
    return { status: 400, message: 'Invalid field format', details };
  }
  return { status: 500, message: 'Database operation failed', details };
}

export function errorHandler(
  error: Error & { status?: number; statusCode?: number; details?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (env.NODE_ENV !== 'production') {
    const dbError =
      error instanceof QueryFailedError
        ? {
            code: (error as any).code,
            detail: (error as any).detail,
            table: (error as any).table,
            constraint: (error as any).constraint,
          }
        : undefined;
    logger.error(
      {
        route: req.originalUrl,
        method: req.method,
        message: error.message,
        stack: error.stack,
        dbError,
      },
      'Unhandled request error',
    );
  }

  if (error instanceof ZodError) {
    const isProduction = env.NODE_ENV === 'production';
    const details = isProduction
      ? { errorCount: error.issues.length, code: 'VALIDATION_ERROR' }
      : error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
    res.status(400).json(fail('Validation failed', details));
    return;
  }

  if (error instanceof QueryFailedError) {
    const mapped = mapQueryError(error);
    const safeDetails = mapped.status >= 500 && env.NODE_ENV === 'production' ? undefined : mapped.details;
    res.status(mapped.status).json(fail(mapped.message, safeDetails));
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json(fail(error.message, error.details));
    return;
  }

  if (req.originalUrl.includes('/auth/login') && (error.statusCode === 503 || error.status === 503)) {
    res
      .status(503)
      .json(fail('Authentication service is temporarily unavailable. Please retry shortly.', { code: 'AUTH_DEPENDENCY_ERROR' }));
    return;
  }

  const status = error.status ?? error.statusCode ?? 500;
  const message = status >= 500 && env.NODE_ENV === 'production' ? 'Internal server error' : error.message || 'Internal server error';
  const details = status >= 500 && env.NODE_ENV === 'production' ? undefined : error.details;
  res.status(status).json(fail(message, details));
}
