import cron from 'node-cron';
import { logger } from '../../config/logger';
import { runAmcSchedulerTick } from './amc.helpers';

let schedulerStarted = false;

export function startAmcScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  cron.schedule('0 * * * *', () => {
    void runAmcSchedulerTick().catch((error) => {
      logger.error({ error }, 'Failed running AMC scheduler tick');
    });
  });

  logger.info('AMC scheduler started');
}
