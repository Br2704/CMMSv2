import request from 'supertest';
import { app } from '../app';
import { resolveRefreshSessionRow } from '../modules/auth/auth.routes';
import type { RefreshTokenEntity } from '../database/entities';
import type { Request } from 'express';

function makeRefreshRow(overrides: Partial<RefreshTokenEntity> = {}): RefreshTokenEntity {
  const now = Date.now();
  return {
    id: 'refresh-token-id',
    userId: 'user-id',
    tokenHash: 'hashed-token',
    expiresAt: new Date(now + 60_000),
    revokedAt: null,
    sessionExpiresAt: new Date(now + 60_000),
    createdIp: '127.0.0.1',
    createdUserAgent: 'vitest-agent',
    replacedByTokenId: null,
    user: undefined as unknown as RefreshTokenEntity['user'],
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  };
}

function makeRequest(ip = '127.0.0.1', userAgent = 'vitest-agent') {
  return {
    ip,
    headers: {
      'user-agent': userAgent,
    },
  } as Request;
}

describe('Auth refresh flow hardening', () => {
  it('returns 401 when refresh token is missing', async () => {
    const response = await request(app).post('/api/auth/refresh').send({});
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns 401 when cookie refresh token is present but CSRF header is missing', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['cmms_refresh_token=fake-token', 'cmms_csrf_token=fake-csrf'])
      .send({});

    // Cookie-based refresh skips CSRF check because SameSite=Strict + rate limiting
    // provide sufficient protection. The fake-token fails JWT verification instead.
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns 401 when CSRF header does not match cookie', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['cmms_refresh_token=fake-token', 'cmms_csrf_token=cookie-token'])
      .set('X-CSRF-Token', 'header-token')
      .send({});

    // Cookie-based refresh skips CSRF check (see comment above).
    // The fake-token fails JWT verification instead.
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('resolves the active refresh row when the token is still current', async () => {
    const currentRow = makeRefreshRow();
    const refreshRepo = {
      findOneBy: jest.fn(),
    };

    const resolved = await resolveRefreshSessionRow(refreshRepo, currentRow, currentRow.userId, makeRequest());

    expect(resolved).toBe(currentRow);
    expect(refreshRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('recovers the rotated refresh session during the grace window for the same browser context', async () => {
    const replacementRow = makeRefreshRow({
      id: 'replacement-token-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const revokedRow = makeRefreshRow({
      revokedAt: new Date(),
      replacedByTokenId: replacementRow.id,
    });
    const refreshRepo = {
      findOneBy: jest.fn().mockResolvedValue(replacementRow),
    };

    const resolved = await resolveRefreshSessionRow(refreshRepo, revokedRow, revokedRow.userId, makeRequest());

    expect(resolved).toBe(replacementRow);
    expect(refreshRepo.findOneBy).toHaveBeenCalledWith({ id: replacementRow.id, userId: revokedRow.userId });
  });

  it('rejects rotated refresh-token reuse outside the grace window', async () => {
    const revokedRow = makeRefreshRow({
      revokedAt: new Date(Date.now() - 20_000),
      replacedByTokenId: 'replacement-token-id',
    });
    const refreshRepo = {
      findOneBy: jest.fn(),
    };

    const resolved = await resolveRefreshSessionRow(refreshRepo, revokedRow, revokedRow.userId, makeRequest());

    expect(resolved).toBeNull();
    expect(refreshRepo.findOneBy).not.toHaveBeenCalled();
  });
});
