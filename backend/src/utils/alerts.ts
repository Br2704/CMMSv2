import { AppDataSource } from '../database/data-source';
import { AlertConfigEntity, AlertLogEntity, AssetEntity, AssetPerformanceLogEntity } from '../database/entities';
import { audit } from './audit';

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareValues(actual: number, threshold: number, comparisonType: '>' | '<' | '>=' | '<=') {
  switch (comparisonType) {
    case '>':
      return actual > threshold;
    case '<':
      return actual < threshold;
    case '>=':
      return actual >= threshold;
    case '<=':
      return actual <= threshold;
    default:
      return false;
  }
}

function metricValueMap(log: AssetPerformanceLogEntity) {
  const runtimeHours = toNumber(log.runtimeHours);
  const energyKwh = toNumber(log.energyKwh);
  const productionOutput = toNumber(log.productionOutput);
  const efficiencyValue = toNumber(log.efficiencyValue);
  const energyPerRuntime = energyKwh !== null && runtimeHours !== null && runtimeHours > 0 ? energyKwh / runtimeHours : null;
  const outputPerEnergy = productionOutput !== null && energyKwh !== null && energyKwh > 0 ? productionOutput / energyKwh : null;

  return {
    runtimeHours,
    energyKwh,
    productionOutput,
    efficiencyValue,
    energyPerRuntime,
    outputPerEnergy,
  };
}

export async function evaluatePerformanceLogAlerts(log: AssetPerformanceLogEntity, asset: AssetEntity, actorUserId?: string | null) {
  const configRepo = AppDataSource.getRepository(AlertConfigEntity);
  const alertRepo = AppDataSource.getRepository(AlertLogEntity);

  const configs = await configRepo
    .createQueryBuilder('cfg')
    .where('cfg.is_active = :active', { active: true })
    .andWhere('(cfg.plant_id = :plantId OR cfg.plant_id IS NULL)', { plantId: log.plantId })
    .andWhere('(cfg.asset_type = :assetType OR cfg.asset_type IS NULL)', { assetType: asset.assetType })
    .getMany();

  if (configs.length === 0) {
    return [];
  }

  const values = metricValueMap(log);
  const createdAlerts: AlertLogEntity[] = [];

  for (const config of configs) {
    const key = config.metricKey as keyof typeof values;
    const actual = values[key];
    if (actual === null || actual === undefined) {
      continue;
    }
    const threshold = Number(config.thresholdValue);
    if (!Number.isFinite(threshold)) {
      continue;
    }
    if (!compareValues(actual, threshold, config.comparisonType)) {
      continue;
    }

    const alert = alertRepo.create({
      plantId: log.plantId,
      assetId: log.assetId,
      metricKey: config.metricKey,
      actualValue: actual.toFixed(6),
      thresholdValue: config.thresholdValue,
      comparisonType: config.comparisonType,
      severity: config.severity,
      status: 'OPEN',
      message: `${config.metricKey} breached threshold (${actual.toFixed(3)} ${config.comparisonType} ${threshold})`,
      isActive: true,
    });
    createdAlerts.push(alert);
  }

  if (createdAlerts.length === 0) {
    return [];
  }

  await alertRepo.save(createdAlerts);
  await audit('alerts.triggered', {
    module: 'NOTIFICATIONS',
    actorUserId: actorUserId ?? null,
    entityName: 'alerts_log',
    statusCode: 201,
    metadata: { count: createdAlerts.length, plantId: log.plantId, assetId: log.assetId },
  });
  return createdAlerts;
}
