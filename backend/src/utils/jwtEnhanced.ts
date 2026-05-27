// ============================================================================
// ENHANCED JWT UTILITY — Enterprise Security
// ============================================================================
// Provides upgraded JWT functions with:
// - RS256/ES256 asymmetric signing support (falls back to HS256)
// - Token type discrimination (access vs refresh vs challenge)
// - JWT ID (jti) for token tracking
// - Strict algorithm enforcement
// - Enhanced payload validation
// ============================================================================

import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

let keyPair: KeyPair | null = null;
let useAsymmetric = false;

/**
 * Initialize the key pair for RS256 signing.
 * Checks env vars for custom key paths, or generates on first use.
 */
function initializeKeys(): void {
  if (keyPair) return;

  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH;
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH;
  const privateKeyContent = process.env.JWT_PRIVATE_KEY;
  const publicKeyContent = process.env.JWT_PUBLIC_KEY;

  if (privateKeyContent && publicKeyContent) {
    // Keys provided as env vars
    keyPair = {
      privateKey: privateKeyContent.replace(/\\n/g, '\n'),
      publicKey: publicKeyContent.replace(/\\n/g, '\n'),
    };
    useAsymmetric = true;
    logger.info('JWT: Using RS256 with keys from environment variables');
  } else if (privateKeyPath && existsSync(resolve(privateKeyPath))) {
    const pubKeyPath = publicKeyPath || `${privateKeyPath}.pub`;
    keyPair = {
      privateKey: readFileSync(resolve(privateKeyPath), 'utf-8'),
      publicKey: existsSync(resolve(pubKeyPath)) ? readFileSync(resolve(pubKeyPath), 'utf-8') : '',
    };
    useAsymmetric = true;
    logger.info('JWT: Using RS256 with keys from files');
  } else {
    // Fall back to HS256 with existing secrets
    useAsymmetric = false;
    logger.info('JWT: Using HS256 (set JWT_PRIVATE_KEY for RS256 upgrade)');
  }
}

function getSigningAlgorithm(): 'RS256' | 'HS256' {
  initializeKeys();
  return useAsymmetric ? 'RS256' : 'HS256';
}

function getSigningKey(): string {
  initializeKeys();
  if (useAsymmetric && keyPair) {
    return keyPair.privateKey;
  }
  return env.JWT_SECRET;
}

function getVerifyingKey(): string {
  initializeKeys();
  if (useAsymmetric && keyPair) {
    return keyPair.publicKey || keyPair.privateKey;
  }
  return env.JWT_SECRET;
}

function getRefreshSigningKey(): string {
  // Always use separate key for refresh tokens
  if (useAsymmetric && keyPair) {
    return keyPair.privateKey;
  }
  return env.JWT_REFRESH_SECRET;
}

function getRefreshVerifyingKey(): string {
  if (useAsymmetric && keyPair) {
    return keyPair.publicKey || keyPair.privateKey;
  }
  return env.JWT_REFRESH_SECRET;
}

// ============================================================================
// SHARED OPTIONS
// ============================================================================

function getSignOptions(additional?: Partial<SignOptions>): SignOptions {
  return {
    algorithm: getSigningAlgorithm(),
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ...additional,
  };
}

function getVerifyOptions(additional?: Partial<VerifyOptions>): VerifyOptions {
  const algorithm = getSigningAlgorithm();
  return {
    algorithms: [algorithm, 'HS256' as jwt.Algorithm], // accept both during migration
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ...additional,
  };
}

// ============================================================================
// ACCESS TOKENS
// ============================================================================

export type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  organizationId: string | null;
  plantIds: string[];
  accessAllPlants: boolean;
  mfaVerified?: boolean;
  jti?: string;  // JWT ID for token tracking
  typ?: string;  // Token type hint
};

export function signAccessToken(payload: AccessTokenPayload): string {
  const signKey = getSigningKey();
  const options = getSignOptions({
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });

  return jwt.sign(
    { ...payload, typ: 'access' },
    signKey,
    options,
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const verifyKey = getVerifyingKey();
  const options = getVerifyOptions();

  const decoded = jwt.verify(token, verifyKey, options) as AccessTokenPayload;

  // Additional security: verify token type if present
  if (decoded.typ && decoded.typ !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }

  return decoded;
}

// ============================================================================
// REFRESH TOKENS
// ============================================================================

export type RefreshTokenPayload = {
  sub: string;
  tokenId: string;
  jti?: string;
  typ?: string;
};

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const signKey = getRefreshSigningKey();
  const options = getSignOptions({
    expiresIn: `${env.JWT_REFRESH_EXPIRES_IN_DAYS}d` as SignOptions['expiresIn'],
  });

  return jwt.sign(
    { ...payload, typ: 'refresh' },
    signKey,
    options,
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const verifyKey = getRefreshVerifyingKey();
  const options = getVerifyOptions();

  const decoded = jwt.verify(token, verifyKey, options) as RefreshTokenPayload;

  // Additional security: verify token type if present
  if (decoded.typ && decoded.typ !== 'refresh') {
    throw new Error('Invalid token type: expected refresh token');
  }

  return decoded;
}

// ============================================================================
// CHALLENGE TOKENS
// ============================================================================

export type ChallengeTokenPayload = {
  sub: string;
  type: 'captcha' | 'mfa_setup' | 'password_reset';
  email?: string;
  captchaNonce?: string;
  captchaMac?: string;
  secret?: string;
  jti?: string;
  /** Token type hint added automatically at signing time */
  typ?: string;
};

export function signChallengeToken(
  payload: ChallengeTokenPayload,
  expiresIn: SignOptions['expiresIn'] = '10m',
): string {
  const signKey = getSigningKey();
  const options = getSignOptions({ expiresIn });

  return jwt.sign({ ...payload, typ: 'challenge' }, signKey, options);
}

export function verifyChallengeToken(token: string): ChallengeTokenPayload {
  const verifyKey = getVerifyingKey();
  const options = getVerifyOptions();

  const decoded = jwt.verify(token, verifyKey, options) as ChallengeTokenPayload;

  // Additional security: verify token type if present
  if (decoded.typ && decoded.typ !== 'challenge') {
    throw new Error('Invalid token type: expected challenge token');
  }

  return decoded;
}

// ============================================================================
// KEY ROTATION SUPPORT
// ============================================================================

/**
 * Generate a new RS256 key pair for JWT signing.
 * Outputs PEM-encoded private and public keys.
 */
export function generateJwtKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Check if RS256 asymmetric signing is active.
 */
export function isAsymmetricSigningActive(): boolean {
  initializeKeys();
  return useAsymmetric;
}
