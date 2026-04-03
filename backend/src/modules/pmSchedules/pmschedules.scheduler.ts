import cron from 'node-cron';
import { logger } from '../../config/logger';
import { generateDuePmTasks } from './pm-scheduling.utils';

let schedulerStarted = false;

export function startPmSchedulesScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('* * * * *', () => {
    void generateDuePmTasks().catch((error) => {
      logger.error({ error }, 'Failed running PM schedule generator');
    });
  });

  logger.info('PM schedule generator started');
}
