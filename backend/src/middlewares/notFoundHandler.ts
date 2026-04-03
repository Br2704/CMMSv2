import type { Request, Response } from 'express';
import { fail } from '../utils/apiResponse';

export function apiNotFoundHandler(req: Request, res: Response) {
  res.status(404).json(
    fail('Route not found', {
      method: req.method,
      path: req.originalUrl,
    }),
  );
}
