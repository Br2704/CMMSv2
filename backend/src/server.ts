import { createServer } from 'http';
import { app } from './app';
import { startAmcScheduler } from './modules/amc/amc.scheduler';
import { env } from './config/env';
import { logger } from './config/logger';
import { AppDataSource } from './database/data-source';
import { startCalibrationScheduler } from './modules/calibration/calibration.scheduler';
import { startOrganizationSubscriptionScheduler } from './modules/organizations/organizations.scheduler';
import { startPmSchedulesScheduler } from './modules/pmSchedules/pmschedules.scheduler';
import { startReportsScheduler } from './modules/reports/reports.scheduler';
import { startDashboardSocketServer, stopDashboardSocketServer } from './realtime/dashboard-socket';

async function bootstrap() {
  await AppDataSource.initialize();
  startReportsScheduler();
  startPmSchedulesScheduler();
  startCalibrationScheduler();
  startAmcScheduler();
  startOrganizationSubscriptionScheduler();

  const server = createServer(app);
  startDashboardSocketServer(server);
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server');
    server.close(async () => {
      await stopDashboardSocketServer();
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
