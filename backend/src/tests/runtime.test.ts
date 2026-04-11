
import request from 'supertest';
import { app } from '../app';
import { AppDataSource } from '../database/data-source';
import { ensureSelectedDatabaseExists } from '../database/ensure-database';

let runtimeSetupError: Error | null = null;

beforeAll(async () => {
  try {
    await ensureSelectedDatabaseExists();
    await AppDataSource.initialize();
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
  it('should expose a healthy backend endpoint', async () => {
    if (runtimeSetupError) {
      throw new Error(`Runtime test setup failed. Ensure the configured database is reachable and migrations are applied. ${runtimeSetupError.message}`);
    }

    const response = await request(app)
      .get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
