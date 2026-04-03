import { Router } from 'express';
import { AppDataSource } from '../database/data-source';
import { fail, ok } from '../utils/apiResponse';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memory = process.memoryUsage();
  if (!AppDataSource.isInitialized) {
    res.status(503).json(
      fail('Database not ready', {
        db: { connected: false },
        migrations: { applied: false },
        uptimeSeconds,
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
        },
      }),
    );
    return;
  }

  let dbConnected = false;
  let migrationsApplied = false;
  let dbLatencyMs: number | null = null;
  try {
    const startedAt = Date.now();
    const queryResult = await AppDataSource.query('SELECT 1 AS ok');
    dbLatencyMs = Date.now() - startedAt;
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
      db: { connected: dbConnected },
      migrations: { applied: migrationsApplied },
      uptimeSeconds,
      dbLatencyMs,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
    },
    healthy ? 'OK' : 'DEGRADED',
  );
  res.status(healthy ? 200 : 503).json(payload);
});
