import cron from 'node-cron';
import { logger } from '../../config/logger';
import { generateDueCalibrationTasks } from './calibration.utils';

let schedulerStarted = false;

export function startCalibrationScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('* * * * *', () => {
    void generateDueCalibrationTasks().catch((error) => {
      logger.error({ error }, 'Failed running calibration schedule generator');
    });
  });

  logger.info('Calibration schedule generator started');
}
