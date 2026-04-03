
import request from 'supertest';
import { app } from '../app';
import { AppDataSource } from '../database/data-source';
import { runSeed } from '../database/seed/seed';
import { env } from '../config/env';

let runtimeSetupError: Error | null = null;

beforeAll(async () => {
  try {
    await AppDataSource.initialize();
    await runSeed();
    runtimeSetupError = null;
  } catch (error) {
    runtimeSetupError = error instanceof Error ? error : new Error(String(error));
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});

describe('Runtime tests', () => {
  it('should login as the configured system administrator', async () => {
    if (runtimeSetupError) {
      throw new Error(`Runtime test setup failed. Ensure PostgreSQL is running and migrations are applied. ${runtimeSetupError.message}`);
    }

    const loginEmail = env.SEED_SUPERADMIN ? env.SUPERADMIN_EMAIL : env.ROOT_ADMIN_EMAIL;
    const loginPassword = env.SEED_SUPERADMIN ? env.SUPERADMIN_PASSWORD : env.ROOT_ADMIN_PASSWORD;
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: loginEmail,
        password: loginPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeDefined();
  });
});
