import cron from 'node-cron';
import { logger } from '../config/logger';
import { AppDataSource } from '../database/data-source';
import { SystemConfigEntity } from '../database/entities/system-config.entity';
import { secretRotationManager, type SecretRotationState } from './secretRotation';

let schedulerStarted = false;

const SECRET_KEYS = ['JWT_ACCESS', 'JWT_REFRESH', 'DATA_ENCRYPTION'] as const;
const ROTATION_STATE_KEY = 'SECRET_ROTATION_STATE';

async function loadRotationState(): Promise<void> {
  try {
    if (!AppDataSource.isInitialized) {
      logger.warn('Database not initialized — skipping rotation state load');
      return;
    }
    const repo = AppDataSource.getRepository(SystemConfigEntity);
    const row = await repo.findOneBy({ configKey: ROTATION_STATE_KEY });
    if (row?.configValue) {
      const state = row.configValue as SecretRotationState;
      secretRotationManager.importState(state);
      logger.info({ keys: Object.keys(state.keys || {}) }, 'Loaded secret rotation state from database');
    } else {
      logger.info('No persisted secret rotation state found — using environment defaults');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load secret rotation state from database');
  }
}

async function saveRotationState(): Promise<void> {
  try {
    if (!AppDataSource.isInitialized) return;
    const state = secretRotationManager.exportState();
    const repo = AppDataSource.getRepository(SystemConfigEntity);
    let config = await repo.findOneBy({ configKey: ROTATION_STATE_KEY });
    if (!config) {
      config = repo.create({
        configKey: ROTATION_STATE_KEY,
        description: 'Rotated secret versions (JWT_ACCESS, JWT_REFRESH, DATA_ENCRYPTION)',
        isActive: true,
      });
    }
    config.configValue = state;
    config.lastModifiedAt = new Date();
    await repo.save(config);
  } catch (error) {
    logger.error({ error }, 'Failed to save secret rotation state to database');
  }
}

async function runSecretRotationCheck(): Promise<void> {
  for (const key of SECRET_KEYS) {
    try {
      if (secretRotationManager.isKeyGracePeriodExpired(key)) {
        logger.info({ keyName: key }, 'Secret grace period expired — rotating');
        secretRotationManager.rotateSecret(key);
        await saveRotationState();
        logger.info(
          {
            keyName: key,
            activeVersions: secretRotationManager.getAllActiveSecrets(key).length,
          },
          'Secret rotated successfully and persisted to database',
        );
      }
    } catch (error) {
      logger.error({ keyName: key, error }, 'Failed to rotate secret');
    }
  }
}

export async function startSecretRotationScheduler(): Promise<void> {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Load persisted rotation state from DB first
  await loadRotationState();

  // Check every 6 hours — rotation intervals are 90, 180, and 365 days,
  // so a 6-hour check interval is more than sufficient.
  cron.schedule('0 */6 * * *', () => {
    void runSecretRotationCheck().catch((error) => {
      logger.error({ error }, 'Secret rotation scheduler tick failed');
    });
  });

  logger.info('Secret rotation scheduler started (checking every 6 hours)');
}
