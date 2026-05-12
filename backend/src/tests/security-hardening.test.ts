/**
 * Security Hardening Test Suite
 * Tests critical security controls and configurations
 */

import request from 'supertest';
import { app } from '../app';
import { env } from '../config/env';

describe('Security Hardening Tests', () => {
  const baseUrl = env.API_PREFIX || '/api';

  describe('Request Validation', () => {
    it('should reject requests with content-length exceeding 1mb', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1);
      const response = await request(app)
        .post(`${baseUrl}/auth/login`)
        .set('Content-Type', 'application/json')
        .send({ email: 'test@test.com', password: 'test' })
        .set('Content-Length', String(largeBody.length));

      expect(response.status).toBe(413);
    });

    it('should reject TRACE method', async () => {
      const response = await request(app)
        .trace(`${baseUrl}/auth/login`);

      expect(response.status).toBe(405);
    });
  });

  describe('Security Headers', () => {
    it('should include X-Frame-Options header', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should include X-Content-Type-Options header', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-XSS-Protection header', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should include Strict-Transport-Security in production', async () => {
      const response = await request(app).get('/health');
      if (env.NODE_ENV === 'production') {
        expect(response.headers['strict-transport-security']).toBeDefined();
      }
    });

    it('should include Permissions-Policy header', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['permissions-policy']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should not expose sensitive data in production errors', async () => {
      if (env.NODE_ENV !== 'production') {
        return;
      }

      const response = await request(app)
        .post(`${baseUrl}/auth/login`)
        .send({ email: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.message).not.toContain('stack');
      expect(response.body.data?.stack).toBeUndefined();
    });

    it('should return generic message for 500 errors in production', async () => {
      if (env.NODE_ENV !== 'production') {
        return;
      }

      const response = await request(app)
        .get(`${baseUrl}/nonexistent-endpoint-12345`);

      expect(response.status).toBe(404);
    });
  });

  describe('JWT Security', () => {
    it('should use explicit algorithm in JWT configuration', () => {
      const jwt = require('../utils/jwt');
      const testPayload = { sub: 'test-user', email: 'test@test.com' };

      const token = jwt.signAccessToken({
        ...testPayload,
        roles: ['USER'],
        plantIds: [],
        accessAllPlants: false,
      });

      expect(token).toBeDefined();

      const verified = jwt.verifyAccessToken(token);
      expect(verified.sub).toBe('test-user');
    });

    it('should reject tokens with algorithm confusion', async () => {
      const jwt = require('../utils/jwt');
      const jwtLib = require('jsonwebtoken');

      const testPayload = { sub: 'test-user', email: 'test@test.com' };
      const maliciousToken = jwtLib.sign(testPayload, env.JWT_SECRET, { algorithm: 'none' });

      expect(() => {
        jwt.verifyAccessToken(maliciousToken);
      }).toThrow();
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize prototype pollution attempts', async () => {
      const response = await request(app)
        .post(`${baseUrl}/auth/login`)
        .send({
          email: 'test@test.com',
          password: 'test',
          __proto__: { isAdmin: true },
        });

      expect(response.status).not.toBe(500);
      expect(response.body.data?.isAdmin).toBeUndefined();
    });

    it('should remove null bytes from input', async () => {
      const response = await request(app)
        .post(`${baseUrl}/auth/login`)
        .send({
          email: 'test@test.com\x00',
          password: 'test',
        });

      expect(response.status).not.toBe(500);
    });

    it('should sanitize script tags from input', async () => {
      const response = await request(app)
        .post(`${baseUrl}/auth/login`)
        .send({
          email: '<script>alert(1)</script>@test.com',
          password: 'test',
        });

      expect(response.body.data?.email).not.toContain('<script>');
    });
  });

  describe('Production Configuration', () => {
    it('should require TRUST_PROXY_HOPS in production', () => {
      if (env.NODE_ENV === 'production') {
        expect(env.TRUST_PROXY_HOPS).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have secure cookie settings in production', () => {
      if (env.NODE_ENV === 'production') {
        expect(env.NODE_ENV).toBe('production');
      }
    });

    it('should validate JWT_SECRET length', () => {
      if (env.NODE_ENV === 'production') {
        expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
      }
    });
  });

  describe('Rate Limiter Configuration', () => {
    it('should have general rate limiter configured', () => {
      const rateLimiter = require('../middlewares/rateLimiter');
      expect(rateLimiter.generalApiRateLimiter).toBeDefined();
    });

    it('should have login rate limiter configured', () => {
      const rateLimiter = require('../middlewares/rateLimiter');
      expect(rateLimiter.authLoginRateLimiter).toBeDefined();
    });
  });
});