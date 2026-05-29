import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';

export function validate(schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const input = req[source];
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      if (env.NODE_ENV !== 'production') {
        logger.warn(
          {
            route: req.originalUrl,
            method: req.method,
            source,
            details,
          },
          'Request validation failed',
        );
      }
      res.status(400).json(fail('Validation failed', { issues: details, flattened: parsed.error.flatten() }));
      return;
    }

      if (source === 'body') {
        req.body = parsed.data;
      } else if (source === 'query') {
        req.query = parsed.data;
      } else if (source === 'params') {
        req.params = parsed.data;
      }
    next();
  };
}

type MultiSourceSchema = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export function validateRequest(schema: MultiSourceSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const source of ['params', 'query', 'body'] as const) {
      const validator = schema[source];
      if (!validator) {
        continue;
      }
      const parsed = validator.safeParse(req[source]);
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        if (env.NODE_ENV !== 'production') {
          logger.warn(
            {
              route: req.originalUrl,
              method: req.method,
              source,
              details,
            },
            'Request validation failed',
          );
        }
        res.status(400).json(fail('Validation failed', { issues: details, flattened: parsed.error.flatten() }));
        return;
      }
        if (source === 'body') {
          req.body = parsed.data;
        } else if (source === 'query') {
          req.query = parsed.data;
        } else if (source === 'params') {
          req.params = parsed.data;
        }
    }

    next();
  };
}
