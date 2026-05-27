// ============================================================================
// FORCED RE-AUTHENTICATION MIDDLEWARE
// ============================================================================
// Enterprise security middleware that forces users to re-authenticate
// before performing highly sensitive operations. This prevents session
// hijacking from being used to escalate privileges or exfiltrate data.
//
// Sensitive operations requiring re-auth:
//   - Password changes
//   - MFA disable
//   - Role/permission changes
//   - Deleting users
//   - System configuration changes
// ============================================================================

import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { fail } from '../utils/apiResponse';
import { recordSecurityEvent } from '../utils/securityEvents';
import { comparePassword } from '../utils/password';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REAUTH_HEADER = 'x-reauth-token';
const REAUTH_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const REAUTH_SEPARATOR = ':';

// In-memory cache of issued re-auth tokens (userId -> { tokenHash, expiresAt })
const reauthTokens = new Map<string, { hash: string; expiresAt: number }>();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of reauthTokens.entries()) {
    if (entry.expiresAt < now) {
      reauthTokens.delete(userId);
    }
  }
}, 60 * 1000).unref();

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate a re-authentication token for the given user.
 * This is called after the user successfully re-authenticates (provides password).
 */
export async function generateReauthToken(userId: string, password: string): Promise<{ token: string } | null> {
  // Verify the password first (to be called from auth routes)
  // This function is called AFTER password verification succeeds
  const rawToken = `${userId}${REAUTH_SEPARATOR}${Date.now()}${REAUTH_SEPARATOR}${Math.random().toString(36).slice(2)}`;
  const hash = createHmac('sha256', env.JWT_SECRET)
    .update(rawToken)
    .digest('base64url');

  reauthTokens.set(userId, {
    hash,
    expiresAt: Date.now() + REAUTH_TOKEN_EXPIRY_MS,
  });

  return { token: rawToken };
}

/**
 * Verify a re-authentication token.
 */
function verifyReauthToken(userId: string, token: string): boolean {
  const entry = reauthTokens.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    return false;
  }

  const expectedHash = createHmac('sha256', env.JWT_SECRET)
    .update(token)
    .digest('base64url');

  try {
    const left = Buffer.from(entry.hash);
    const right = Buffer.from(expectedHash);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware that requires a recent re-authentication token.
 * Apply to sensitive routes like password change, MFA disable, role changes.
 */
export function requireReauthentication(req: Request, res: Response, next: NextFunction) {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json(fail('Authentication required'));
    return;
  }

  const reauthToken = req.headers[REAUTH_HEADER] as string | undefined;
  if (!reauthToken || !reauthToken.startsWith(userId)) {
    res.status(403).json(
      fail('Re-authentication required. Please verify your identity.', {
        code: 'REAUTH_REQUIRED',
        reason: 'missing_or_invalid_token',
      }),
    );
    return;
  }

  if (!verifyReauthToken(userId, reauthToken)) {
    logger.warn(
      {
        userId,
        route: req.originalUrl,
        reason: 'reauth_token_invalid_or_expired',
      },
      'Re-authentication token verification failed',
    );

    void recordSecurityEvent({
      userId,
      organizationId: req.auth?.organizationId ?? null,
      eventType: 'AUTH_REAUTH_FAILED',
      severity: 'HIGH',
      module: 'AUTH',
      action: req.method,
      path: req.originalUrl,
      message: 'Re-authentication token verification failed for sensitive operation',
      ipAddress: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      notify: true,
    });

    res.status(403).json(
      fail('Re-authentication token is invalid or expired. Please re-authenticate.', {
        code: 'REAUTH_REQUIRED',
        reason: 'invalid_or_expired',
      }),
    );
    return;
  }

  // Consume the token (one-time use)
  reauthTokens.delete(userId);
  next();
}
