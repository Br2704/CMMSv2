import request from 'supertest';
import { app } from '../app';

describe('CMMS API smoke tests', () => {
  it('GET /health returns 200', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('GET /api/health responds with health envelope', async () => {
    const response = await request(app).get('/api/health');
    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBeDefined();
  });

  it('protected endpoint returns 401 without token', async () => {
    const response = await request(app).get('/api/assets');
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
