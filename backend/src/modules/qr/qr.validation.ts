import { z } from 'zod';

export const qrTokenParamSchema = z.object({
  token: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const assetIdParamSchema = z.object({
  id: z.string().uuid(),
});
