import { Router } from 'express';
import { AppDataSource } from '../database/data-source';
import { fail, ok } from '../utils/apiResponse';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json(fail('Database not ready', { status: 'degraded' }));
    return;
  }

  let dbConnected = false;
  let migrationsApplied = false;
  try {
    const queryResult = await AppDataSource.query('SELECT 1 AS ok');
    dbConnected = Array.isArray(queryResult);
    const hasPendingMigrations = await AppDataSource.showMigrations();
    migrationsApplied = !hasPendingMigrations;
  } catch {
    dbConnected = false;
    migrationsApplied = false;
  }

  const healthy = dbConnected && migrationsApplied;
  const payload = ok(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        database: dbConnected,
        migrations: migrationsApplied,
      },
    },
    healthy ? 'OK' : 'DEGRADED',
  );
  res.status(healthy ? 200 : 503).json(payload);
});
