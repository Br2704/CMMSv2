import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  plantIds: string[];
  accessAllPlants: boolean;
  mfaVerified?: boolean;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as AccessTokenPayload;
}

export type RefreshTokenPayload = {
  sub: string;
  tokenId: string;
};

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_EXPIRES_IN_DAYS}d` as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as RefreshTokenPayload;
}

export type ChallengeTokenPayload = {
  sub: string;
  type: 'captcha' | 'mfa_setup';
  email?: string;
  answer?: string;
  secret?: string;
};

export function signChallengeToken(payload: ChallengeTokenPayload, expiresIn: SignOptions['expiresIn'] = '10m') {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyChallengeToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as ChallengeTokenPayload;
}
